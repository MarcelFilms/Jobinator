import type { SupabaseClient } from "@supabase/supabase-js";
import { CV_LABEL_TITLE, cvLabelForJob } from "@/lib/applications/cv-label";
import { ruleFromRow } from "@/lib/applications/draft";
import { londonDay } from "@/lib/london";
import type { ProfileFact } from "@/lib/profile-defaults";
import { aiRewriteGate, applyRewrites, requestRewrites, rewriteCandidates, type AiSettings } from "@/lib/cv/ai-rewrite";
import { renderCvPdf } from "@/lib/cv/render-pdf";
import { tailorCv } from "@/lib/cv/tailor";
import { createCvJudge, validateTailoredCv } from "@/lib/cv/validate-cv";

export const LOCKED_APPLICATION = new Set(["sent", "replied", "interview", "rejected_by_employer", "offer"]);

export type GenerateOutcome =
  | { ok: true; passed: boolean; method: "rules" | "model"; aiNote: string }
  | { ok: false; reason: string };

export function tailoredPath(userId: string, applicationId: string): string {
  return `${userId}/tailored/${applicationId}.pdf`;
}

export function missingTable(message: string | undefined): boolean {
  return Boolean(message && /tailored_cvs|schema cache|does not exist/i.test(message));
}

async function spendSince(admin: SupabaseClient, fromDay: string): Promise<number> {
  const { data } = await admin.from("ai_daily").select("spend_gbp").gte("day", fromDay);
  return (data ?? []).reduce((sum, row) => sum + Number(row.spend_gbp ?? 0), 0);
}

export async function generateTailoredCv(admin: SupabaseClient, userId: string, applicationId: string): Promise<GenerateOutcome> {
  const application = await admin.from("applications").select("id, job_id, cv_id, status").eq("id", applicationId).maybeSingle();
  if (application.error) return { ok: false, reason: application.error.message };
  if (!application.data) return { ok: false, reason: "That application was not found." };
  if (LOCKED_APPLICATION.has(application.data.status)) return { ok: false, reason: "This application is past the queue, so its CV is left as it was." };

  const job = await admin.from("jobs").select("id, title, company_name, description_text").eq("id", application.data.job_id).maybeSingle();
  if (job.error || !job.data) return { ok: false, reason: job.error?.message ?? "The job was not found." };
  const label = cvLabelForJob(job.data.title ?? "", job.data.description_text ?? "");

  const baseQuery = application.data.cv_id
    ? admin.from("cvs").select("id, label, plain_text, is_approved").eq("id", application.data.cv_id).eq("user_id", userId)
    : admin.from("cvs").select("id, label, plain_text, is_approved").eq("user_id", userId).eq("label", label);
  const base = await baseQuery.maybeSingle();
  if (base.error) return { ok: false, reason: base.error.message };
  if (!base.data?.is_approved || !base.data.plain_text.trim()) {
    return { ok: false, reason: `Approve the ${CV_LABEL_TITLE[label]} CV first. A tailored CV is built only from an approved base CV.` };
  }

  const [{ data: profile, error: profileError }, { data: rules, error: rulesError }, { data: settings }] = await Promise.all([
    admin.from("candidate_profiles").select("display_name, contact_email, facts, qualifications_absent").eq("user_id", userId).maybeSingle(),
    admin.from("writing_rules").select("rule_key, instruction, severity, applies_to").eq("user_id", userId),
    admin
      .from("settings")
      .select("ai_enabled, daily_spend_cap_gbp, monthly_spend_cap_gbp, provider_base_url, cheap_model, model_prices")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (profileError) return { ok: false, reason: profileError.message };
  if (rulesError) return { ok: false, reason: rulesError.message };

  const context = {
    baseCvText: base.data.plain_text as string,
    facts: (profile?.facts ?? []) as ProfileFact[],
    displayName: (profile?.display_name as string | null) ?? "",
    contactEmail: (profile?.contact_email as string | null) ?? null,
    rules: (rules ?? []).map(ruleFromRow),
    qualificationsAbsent: (profile?.qualifications_absent as string[] | null) ?? [],
  };
  const tailored = tailorCv({ ...context, jobTitle: job.data.title ?? "", jobDescription: job.data.description_text ?? "" });

  let cv = tailored.cv;
  let method: "rules" | "model" = "rules";
  let model: string | null = null;
  const day = londonDay();
  const gate = aiRewriteGate(
    settings as AiSettings | null,
    process.env.AI_API_KEY,
    await spendSince(admin, day),
    await spendSince(admin, `${day.slice(0, 7)}-01`),
  );
  let aiNote = gate.allowed ? "" : gate.reason;
  let usage = { outcome: gate.allowed ? "called" : "no_model", input: 0, output: 0, cost: 0 };
  if (gate.allowed) {
    try {
      const result = await requestRewrites(gate, rewriteCandidates(cv), tailored.keywords);
      const judge = createCvJudge(context);
      const accepted = new Map<string, string>();
      for (const [id, text] of result.rewrites) if (judge(id.includes(".e") ? "bullet" : "summary", text)) accepted.set(id, text);
      if (accepted.size > 0) {
        cv = applyRewrites(cv, accepted);
        method = "model";
        model = gate.model;
      }
      aiNote = `${accepted.size} of ${result.rewrites.size} reworded lines passed the validator.`;
      usage = { outcome: "called", input: result.inputTokens, output: result.outputTokens, cost: result.costGbp };
      const { data: today } = await admin.from("ai_daily").select("model_calls, input_tokens, output_tokens, spend_gbp").eq("day", day).maybeSingle();
      await admin.from("ai_daily").upsert(
        {
          day,
          model_calls: Number(today?.model_calls ?? 0) + 1,
          input_tokens: Number(today?.input_tokens ?? 0) + result.inputTokens,
          output_tokens: Number(today?.output_tokens ?? 0) + result.outputTokens,
          spend_gbp: Number(today?.spend_gbp ?? 0) + result.costGbp,
        },
        { onConflict: "day" },
      );
    } catch (error) {
      aiNote = `The model was not used: ${error instanceof Error ? error.message : "request failed"}.`;
      usage = { outcome: "no_model", input: 0, output: 0, cost: 0 };
    }
  }

  const validation = validateTailoredCv({ ...context, cv });
  const title = `CV – ${job.data.company_name ?? ""} – ${job.data.title ?? ""}`.replace(/\s+–\s+–/g, " –").trim();
  const pdf = await renderCvPdf(validation.cv, title);
  const path = tailoredPath(userId, applicationId);
  const upload = await admin.storage.from("cvs").upload(path, pdf, { upsert: true, contentType: "application/pdf" });
  if (upload.error) return { ok: false, reason: upload.error.message };

  const stored = await admin.from("tailored_cvs").upsert(
    {
      application_id: applicationId,
      job_id: job.data.id,
      base_cv_id: base.data.id,
      label: base.data.label,
      method,
      model,
      content: validation.cv,
      plain_text: validation.plainText,
      text_hash: validation.textHash,
      storage_path: path,
      passed: validation.passed,
      findings: validation.findings,
      omitted: tailored.omitted,
      keywords: tailored.keywords.map((keyword) => keyword.term),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "application_id" },
  );
  if (stored.error) {
    return {
      ok: false,
      reason: missingTable(stored.error.message)
        ? "Run supabase/migrations/0005_tailored_cvs.sql in the Supabase SQL editor first."
        : stored.error.message,
    };
  }

  if (!validation.passed && application.data.status === "drafted") {
    await admin.from("applications").update({ status: "needs_review" }).eq("id", applicationId);
  }
  await admin.from("ai_usage").insert({
    day,
    task: "tailor_cv",
    job_id: job.data.id,
    model,
    input_tokens: usage.input,
    output_tokens: usage.output,
    estimated_cost_gbp: usage.cost,
    cache_hit: false,
    outcome: usage.outcome,
  });
  return { ok: true, passed: validation.passed, method, aiNote };
}
