"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTemplateApplication, ruleFromRow } from "@/lib/applications/draft";
import { personalizedDraftDecision } from "@/lib/applications/personalize";
import { validateApplication } from "@/lib/applications/validate";
import { generateTailoredCv } from "@/lib/cv/generate";
import { londonDay } from "@/lib/london";
import { requireOwner } from "@/lib/owner";
import type { ProfileFact, WritingRuleSeed } from "@/lib/profile-defaults";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCKED = new Set(["sent", "replied", "interview", "rejected_by_employer", "offer"]);
const SHORTLIST_BATCH = 15;

function jobError(jobId: string, message: string): never {
  redirect(`/jobs/${jobId}?error=${encodeURIComponent(message)}`);
}

function queueError(message: string): never {
  redirect(`/queue?error=${encodeURIComponent(message)}`);
}

export async function draftTemplate(formData: FormData) {
  const { user } = await requireOwner();
  const jobId = String(formData.get("job_id") ?? "");
  if (!UUID.test(jobId)) redirect("/jobs");
  const admin = createAdminClient();
  const drafted = await createTemplateApplication(admin, user.id, jobId);
  if (!drafted.ok) jobError(jobId, drafted.reason);
  if (!drafted.created) redirect("/queue?notice=An application already exists for this job.");
  const tailored = await generateTailoredCv(admin, user.id, drafted.applicationId);

  revalidatePath("/");
  revalidatePath("/queue");
  revalidatePath(`/jobs/${jobId}`);
  const note = tailored.ok
    ? tailored.passed
      ? "Drafted. The tailored CV passed the check."
      : "Drafted. The tailored CV needs review."
    : `Drafted. The tailored CV was not made: ${tailored.reason}`;
  redirect(`/queue?notice=${encodeURIComponent(note)}#${drafted.applicationId}`);
}

export async function regenerateTailoredCv(formData: FormData) {
  const { user } = await requireOwner();
  const applicationId = String(formData.get("application_id") ?? "");
  const back = String(formData.get("back") ?? "queue") === "job" ? "job" : "queue";
  if (!UUID.test(applicationId)) queueError("That application was not found.");
  const admin = createAdminClient();
  const result = await generateTailoredCv(admin, user.id, applicationId);
  const app = await admin.from("applications").select("job_id").eq("id", applicationId).maybeSingle();
  revalidatePath("/queue");
  if (app.data) revalidatePath(`/jobs/${app.data.job_id}`);
  const note = result.ok ? (result.passed ? "Tailored CV made. It passed the check." : "Tailored CV made. It needs review.") : result.reason;
  const key = result.ok ? "notice" : "error";
  if (back === "job" && app.data) redirect(`/jobs/${app.data.job_id}?${key}=${encodeURIComponent(note)}`);
  redirect(`/queue?${key}=${encodeURIComponent(note)}#${applicationId}`);
}

export async function tailorShortlist() {
  const { user } = await requireOwner();
  const admin = createAdminClient();
  const { data: jobs, error } = await admin
    .from("jobs")
    .select("id")
    .eq("status", "shortlisted")
    .is("duplicate_of", null)
    .order("first_seen_at", { ascending: false })
    .limit(SHORTLIST_BATCH);
  if (error) queueError(error.message);
  let passed = 0;
  let review = 0;
  const skipped = new Map<string, number>();
  const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  for (const job of jobs ?? []) {
    const drafted = await createTemplateApplication(admin, user.id, job.id as string);
    if (!drafted.ok) {
      skip(drafted.reason);
      continue;
    }
    const result = await generateTailoredCv(admin, user.id, drafted.applicationId);
    if (!result.ok) skip(result.reason);
    else if (result.passed) passed += 1;
    else review += 1;
  }
  revalidatePath("/");
  revalidatePath("/queue");
  const parts = [`Tailored ${passed + review} of ${(jobs ?? []).length} shortlisted jobs: ${passed} passed, ${review} need review.`];
  for (const [reason, count] of skipped) parts.push(`Skipped ${count}: ${reason}`);
  redirect(`/queue?notice=${encodeURIComponent(parts.join(" "))}`);
}

export async function saveApplication(formData: FormData) {
  const { user } = await requireOwner();
  const applicationId = String(formData.get("application_id") ?? "");
  if (!UUID.test(applicationId)) queueError("That application was not found.");
  const admin = createAdminClient();
  const loaded = await loadDraftContext(admin, user.id, applicationId);
  if (LOCKED.has(loaded.application.status)) queueError("This application is already past the queue.");

  const validation = validateApplication({
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    company: loaded.company,
    role: loaded.role,
    displayName: loaded.displayName,
    facts: loaded.facts,
    cvText: loaded.cvText,
    rules: loaded.rules,
    qualificationsAbsent: loaded.qualificationsAbsent,
    yearsCustomerFacing: loaded.yearsCustomerFacing,
    fallbackSubject: `Application for ${loaded.role} at ${loaded.company}`.trim(),
  });

  const updated = await admin
    .from("applications")
    .update({
      subject: validation.subject,
      body: validation.body,
      status: validation.status,
      owner_edited: true,
    })
    .eq("id", applicationId);
  if (updated.error) queueError(updated.error.message);

  const stored = await admin.from("validation_results").insert({
    application_id: applicationId,
    body_hash: validation.bodyHash,
    passed: validation.passed,
    method: "deterministic",
    findings: validation.findings,
    requires_manual_review: validation.requiresManualReview,
  });
  if (stored.error) queueError(stored.error.message);
  revalidatePath("/queue");
  revalidatePath(`/jobs/${loaded.application.job_id}`);
  redirect(`/queue?notice=Saved.#${applicationId}`);
}

export async function decideApplication(formData: FormData) {
  await requireOwner();
  const applicationId = String(formData.get("application_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!UUID.test(applicationId)) queueError("That application was not found.");
  if (decision !== "approved" && decision !== "rejected") queueError("Choose approve or reject.");
  const admin = createAdminClient();
  const current = await admin.from("applications").select("id, status, job_id").eq("id", applicationId).maybeSingle();
  if (current.error) queueError(current.error.message);
  if (!current.data) queueError("That application was not found.");
  if (LOCKED.has(current.data.status)) queueError("This application is already past the queue.");
  if (decision === "approved" && !["drafted", "needs_review"].includes(current.data.status)) {
    queueError("Approve a drafted letter, or one that needs review.");
  }
  const updated = await admin.from("applications").update({ status: decision }).eq("id", applicationId);
  if (updated.error) queueError(updated.error.message);
  revalidatePath("/");
  revalidatePath("/queue");
  revalidatePath(`/jobs/${current.data.job_id}`);
  redirect(`/queue?notice=${decision === "approved" ? "Approved. Nothing was sent." : "Rejected. Nothing was sent."}#${applicationId}`);
}

export async function requestPersonalizedDraft(formData: FormData) {
  await requireOwner();
  const decision = personalizedDraftDecision();
  const jobId = String(formData.get("job_id") ?? "");
  if (UUID.test(jobId)) {
    const admin = createAdminClient();
    const job = await admin.from("jobs").select("id").eq("id", jobId).maybeSingle();
    if (job.data) {
      await admin.from("ai_usage").insert({
        day: londonDay(),
        task: "personalize",
        job_id: jobId,
        model: null,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_gbp: 0,
        cache_hit: false,
        outcome: "blocked_disabled",
      });
    }
  }
  const target = UUID.test(jobId) ? `/jobs/${jobId}` : "/queue";
  redirect(`${target}?notice=${encodeURIComponent(decision.reason)}`);
}

async function loadDraftContext(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  applicationId: string,
): Promise<{
  application: { id: string; job_id: string; status: string; cv_id: string | null };
  company: string;
  role: string;
  displayName: string;
  facts: ProfileFact[];
  cvText: string;
  rules: WritingRuleSeed[];
  qualificationsAbsent: string[];
  yearsCustomerFacing: number | null;
}> {
  const application = await admin.from("applications").select("id, job_id, status, cv_id").eq("id", applicationId).maybeSingle();
  if (application.error) queueError(application.error.message);
  if (!application.data) queueError("That application was not found.");
  const job = await admin.from("jobs").select("title, company_name").eq("id", application.data.job_id).maybeSingle();
  if (job.error) queueError(job.error.message);
  const [{ data: profile, error: profileError }, { data: rules, error: rulesError }, cv] = await Promise.all([
    admin.from("candidate_profiles").select("display_name, facts, qualifications_absent, years_customer_facing").eq("user_id", userId).maybeSingle(),
    admin.from("writing_rules").select("rule_key, instruction, severity, applies_to").eq("user_id", userId),
    application.data.cv_id
      ? admin.from("cvs").select("plain_text").eq("id", application.data.cv_id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (profileError) queueError(profileError.message);
  if (rulesError) queueError(rulesError.message);
  if (cv.error) queueError(cv.error.message);
  return {
    application: application.data,
    company: job.data?.company_name?.trim() || "your team",
    role: job.data?.title?.trim() || "the role",
    displayName: profile?.display_name ?? "",
    facts: (profile?.facts ?? []) as ProfileFact[],
    cvText: cv.data?.plain_text ?? "",
    rules: (rules ?? []).map(ruleFromRow),
    qualificationsAbsent: profile?.qualifications_absent ?? [],
    yearsCustomerFacing: profile?.years_customer_facing === null || profile?.years_customer_facing === undefined ? null : Number(profile.years_customer_facing),
  };
}

