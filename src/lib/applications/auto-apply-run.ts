import type { SupabaseClient } from "@supabase/supabase-js";
import { boardConfirmed, decideAutoApply, splitName } from "@/lib/applications/auto-apply";
import { atsTarget, planAtsForm, postForm, type FormQuestion } from "@/lib/applications/ats-form";
import { createTemplateApplication } from "@/lib/applications/draft";
import { generateTailoredCv } from "@/lib/cv/generate";
import { londonDay } from "@/lib/london";
import type { ProfileFact } from "@/lib/profile-defaults";
import { fetchSource } from "@/lib/sources/types";

export type AutoApplyReport = {
  sent: number;
  skipped: number;
  held: string | null;
  results: Array<{ jobId: string; outcome: string; reason: string; httpStatus: number | null }>;
};

type JobRow = {
  id: string;
  source: string;
  external_id: string;
  application_url: string | null;
  status: string;
  duplicate_of: string | null;
  raw: { board?: string; id?: string | number; company?: string } | null;
};

const SENT = new Set(["sent", "replied", "interview", "rejected_by_employer", "offer"]);

export async function runAutoApply(supabase: SupabaseClient): Promise<AutoApplyReport> {
  const report: AutoApplyReport = { sent: 0, skipped: 0, held: null, results: [] };
  try {
    const { data: settings, error } = await supabase
      .from("settings")
      .select("auto_send_enabled, require_approval, daily_application_limit, min_fit_score, user_id")
      .limit(1)
      .maybeSingle();
    if (error || !settings) {
      report.held = "Settings could not be read.";
      return report;
    }
    if (!settings.auto_send_enabled) {
      report.held = "Automatic sending is off.";
      return report;
    }
    if (settings.require_approval) {
      report.held = "Approval is still required.";
      return report;
    }

    const profile = await loadProfile(supabase);
    if (!profile) {
      report.held = "The profile could not be read.";
      return report;
    }
    const name = splitName(profile.display_name ?? "");
    const { count } = await supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .not("sent_at", "is", null)
      .gte("sent_at", `${londonDay()}T00:00:00+00:00`);
    let sentToday = count ?? 0;
    const cap = settings.daily_application_limit ?? 15;

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, source, external_id, application_url, status, duplicate_of, raw")
      .in("source", ["greenhouse", "lever", "ashby"])
      .eq("status", "shortlisted")
      .is("duplicate_of", null);
    for (const job of (jobs ?? []) as JobRow[]) {
      if (sentToday >= cap) {
        report.results.push({ jobId: job.id, outcome: "skipped", reason: "The daily application cap is reached.", httpStatus: null });
        report.skipped += 1;
        continue;
      }
      const outcome = await submitOne(supabase, job, {
        userId: profile.user_id,
        autoSendEnabled: true,
        requireApproval: false,
        minFit: settings.min_fit_score ?? 55,
        cap,
        sentToday,
        name,
        email: profile.contact_email ?? "",
        phone: profile.phone,
        facts: (profile.facts ?? []) as ProfileFact[],
      });
      report.results.push({ jobId: job.id, outcome: outcome.outcome, reason: outcome.reason, httpStatus: outcome.httpStatus });
      if (outcome.outcome === "sent") {
        report.sent += 1;
        sentToday += 1;
      } else report.skipped += 1;
    }
  } catch (error) {
    report.held = error instanceof Error ? error.message : "Automatic form submission stopped.";
  }
  return report;
}

async function loadProfile(supabase: SupabaseClient) {
  const full = await supabase
    .from("candidate_profiles")
    .select("user_id, display_name, contact_email, phone, facts")
    .limit(1)
    .maybeSingle();
  if (!full.error) return full.data as {
    user_id: string;
    display_name: string | null;
    contact_email: string | null;
    phone: string | null;
    facts: ProfileFact[] | null;
  } | null;
  if (!/phone/i.test(full.error.message)) return null;
  const basic = await supabase
    .from("candidate_profiles")
    .select("user_id, display_name, contact_email, facts")
    .limit(1)
    .maybeSingle();
  if (basic.error || !basic.data) return null;
  return { ...basic.data, phone: null } as {
    user_id: string;
    display_name: string | null;
    contact_email: string | null;
    phone: string | null;
    facts: ProfileFact[] | null;
  };
}

async function submitOne(
  supabase: SupabaseClient,
  job: JobRow,
  owner: {
    userId: string;
    autoSendEnabled: boolean;
    requireApproval: boolean;
    minFit: number;
    cap: number;
    sentToday: number;
    name: { first: string; last: string } | null;
    email: string;
    phone: string | null;
    facts: ProfileFact[];
  },
): Promise<{ outcome: string; reason: string; httpStatus: number | null }> {
  const target = atsTarget(job);
  if (!target) return finish(supabase, job, null, "skipped", null, "This job has no public application address.");

  const { data: existing } = await supabase
    .from("applications")
    .select("id, status, sent_at")
    .eq("job_id", job.id)
    .maybeSingle();
  if (existing?.sent_at || (existing && SENT.has(existing.status))) {
    return { outcome: "skipped", reason: "This job was already submitted.", httpStatus: null };
  }

  const { data: score } = await supabase.from("job_scores").select("fit_score").eq("job_id", job.id).maybeSingle();
  let applicationId = existing?.id ?? null;
  if (!applicationId) {
    const drafted = await createTemplateApplication(supabase, owner.userId, job.id);
    if (!drafted.ok) return finish(supabase, job, null, "skipped", null, drafted.reason);
    applicationId = drafted.applicationId;
  }
  const { data: application } = await supabase.from("applications").select("body").eq("id", applicationId).maybeSingle();
  const { data: validation } = await supabase
    .from("validation_results")
    .select("passed")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!validation?.passed) {
    return finish(supabase, job, applicationId, "skipped", null, "The cover letter has not passed the validator.");
  }

  const tailored = await generateTailoredCv(supabase, owner.userId, applicationId);
  const gate = decideAutoApply({
    autoSendEnabled: owner.autoSendEnabled,
    requireApproval: owner.requireApproval,
    fitScore: score?.fit_score ?? null,
    minFitScore: owner.minFit,
    validationPassed: true,
    tailoredCvPassed: Boolean(tailored.ok && tailored.passed),
    duplicate: false,
    alreadySent: false,
    sentToday: owner.sentToday,
    dailyCap: owner.cap,
    source: job.source,
  });
  if (!gate.submit) {
    const reason = !tailored.ok && gate.reason === "The tailored CV has not passed the validator." ? tailored.reason : gate.reason;
    return finish(supabase, job, applicationId, "skipped", null, reason);
  }

  let pageHtml = "";
  try {
    const page = await fetchSource(target.pageUrl);
    if (page.status === 401 || page.status === 403 || page.status === 429) {
      return finish(
        supabase,
        job,
        applicationId,
        "skipped",
        page.status,
        `Stopped: HTTP ${page.status}. No login and no CAPTCHA attempt.`,
      );
    }
    pageHtml = page.body;
  } catch (error) {
    return finish(supabase, job, applicationId, "skipped", null, error instanceof Error ? error.message : "The application page could not be read.");
  }
  let questions: FormQuestion[] = [];
  const applicant = applicantFrom(owner, application?.body ?? "");
  const early = planAtsForm({ source: target.source, pageHtml, questions, submitUrl: target.submitUrl, applicant });
  if (early.action === "skip") return finish(supabase, job, applicationId, "skipped", null, early.reason);
  if (target.questionsUrl) {
    try {
      const response = await fetchSource(target.questionsUrl);
      if (response.status < 200 || response.status >= 300) {
        return finish(supabase, job, applicationId, "skipped", response.status, `The form questions returned HTTP ${response.status}.`);
      }
      const payload = JSON.parse(response.body) as { questions?: FormQuestion[] };
      questions = payload.questions ?? [];
    } catch (error) {
      return finish(supabase, job, applicationId, "skipped", null, error instanceof Error ? error.message : "The form questions could not be read.");
    }
  }
  const plan = planAtsForm({ source: target.source, pageHtml, questions, submitUrl: target.submitUrl, applicant });
  if (plan.action === "skip") return finish(supabase, job, applicationId, "skipped", null, plan.reason);

  const { data: stored } = await supabase.from("tailored_cvs").select("storage_path").eq("application_id", applicationId).maybeSingle();
  const file = stored?.storage_path ? await supabase.storage.from("cvs").download(stored.storage_path) : { data: null };
  if (!file.data) return finish(supabase, job, applicationId, "skipped", null, "The tailored CV file could not be read.");
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const posted = await postForm(plan, bytes, async (url, init) => {
    const response = await fetch(url, { ...init, headers: { "user-agent": "Jobinator/0.1", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(25000) });
    return { status: response.status, body: (await response.text()).slice(0, 4000) };
  });
  const confirmed = boardConfirmed(posted.status, posted.body);
  const reason = confirmed
    ? "The board confirmed the application."
    : `The board did not confirm the application (HTTP ${posted.status}). It stays in the queue.`;
  return finish(supabase, job, applicationId, confirmed ? "sent" : "rejected", posted.status, reason, {
    status: posted.status,
    body: posted.body,
  });
}

function applicantFrom(
  owner: {
    name: { first: string; last: string } | null;
    email: string;
    phone: string | null;
    facts: ProfileFact[];
  },
  letter: string,
) {
  const employment = owner.facts.find((fact) => fact.kind === "employment");
  return {
    first: owner.name?.first ?? "",
    last: owner.name?.last ?? "",
    email: owner.email,
    phone: owner.phone,
    letter,
    employer: employment?.organisation?.trim() || null,
  };
}

async function finish(
  supabase: SupabaseClient,
  job: JobRow,
  applicationId: string | null,
  outcome: "sent" | "skipped" | "rejected",
  httpStatus: number | null,
  reason: string,
  response: Record<string, unknown> = {},
) {
  if (outcome === "sent" && applicationId) {
    const updated = await supabase
      .from("applications")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", applicationId)
      .is("sent_at", null)
      .select("id");
    if (!updated.data?.length) return { outcome: "skipped", reason: "This job was already submitted.", httpStatus };
  }
  await supabase.from("application_submissions").insert({
    application_id: applicationId,
    job_id: job.id,
    source: job.source,
    outcome,
    http_status: httpStatus,
    response,
    reason,
  });
  return { outcome, reason, httpStatus };
}
