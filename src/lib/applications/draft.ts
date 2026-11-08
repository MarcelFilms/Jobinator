import type { SupabaseClient } from "@supabase/supabase-js";
import { CV_LABEL_TITLE, cvLabelForJob } from "@/lib/applications/cv-label";
import { prepareTemplate } from "@/lib/applications/template";
import type { ProfileFact, WritingRuleSeed } from "@/lib/profile-defaults";

export type DraftOutcome = { ok: true; applicationId: string; created: boolean } | { ok: false; reason: string };

export function ruleFromRow(rule: { rule_key: string; instruction: string; severity: string; applies_to: string }): WritingRuleSeed {
  return {
    ruleKey: rule.rule_key,
    instruction: rule.instruction,
    severity: rule.severity === "rewrite" ? "rewrite" : "block",
    appliesTo: rule.applies_to === "internal_only" ? "internal_only" : "employer_text",
  };
}

export async function createTemplateApplication(admin: SupabaseClient, userId: string, jobId: string): Promise<DraftOutcome> {
  const { data: job, error: jobError } = await admin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobError) return { ok: false, reason: jobError.message };
  if (!job) return { ok: false, reason: "That job was not found." };
  if (job.duplicate_of || job.status === "duplicate") return { ok: false, reason: "Draft the original listing. This row is a duplicate." };

  const existing = await admin.from("applications").select("id").eq("job_id", jobId).maybeSingle();
  if (existing.error) return { ok: false, reason: existing.error.message };
  if (existing.data) return { ok: true, applicationId: existing.data.id as string, created: false };

  const [{ data: profile, error: profileError }, { data: rules, error: rulesError }] = await Promise.all([
    admin.from("candidate_profiles").select("display_name, facts, qualifications_absent, years_customer_facing").eq("user_id", userId).maybeSingle(),
    admin.from("writing_rules").select("rule_key, instruction, severity, applies_to").eq("user_id", userId),
  ]);
  if (profileError) return { ok: false, reason: profileError.message };
  if (rulesError) return { ok: false, reason: rulesError.message };

  const label = cvLabelForJob(job.title ?? "", job.description_text ?? "");
  const cv = await admin.from("cvs").select("id, plain_text, is_approved").eq("user_id", userId).eq("label", label).maybeSingle();
  if (cv.error) return { ok: false, reason: cv.error.message };
  if (!cv.data?.is_approved || !cv.data.plain_text.trim()) {
    return { ok: false, reason: `Approve the ${CV_LABEL_TITLE[label]} CV before drafting. The CV is chosen from the job category.` };
  }

  const draft = prepareTemplate({
    title: job.title ?? "",
    description: job.description_text ?? "",
    company: job.company_name ?? "",
    displayName: profile?.display_name ?? "",
    facts: (profile?.facts ?? []) as ProfileFact[],
    cvText: cv.data.plain_text,
    rules: (rules ?? []).map(ruleFromRow),
    qualificationsAbsent: profile?.qualifications_absent ?? [],
    yearsCustomerFacing: profile?.years_customer_facing === null || profile?.years_customer_facing === undefined ? null : Number(profile.years_customer_facing),
  });

  const inserted = await admin
    .from("applications")
    .insert({
      job_id: jobId,
      cv_id: cv.data.id,
      kind: "template",
      status: draft.validation.status,
      subject: draft.subject,
      body: draft.body,
      owner_edited: false,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) return { ok: false, reason: inserted.error?.message ?? "The application could not be stored." };

  const validation = await admin.from("validation_results").insert({
    application_id: inserted.data.id,
    body_hash: draft.validation.bodyHash,
    passed: draft.validation.passed,
    method: "deterministic",
    findings: draft.validation.findings,
    requires_manual_review: draft.validation.requiresManualReview,
  });
  if (validation.error) return { ok: false, reason: validation.error.message };
  return { ok: true, applicationId: inserted.data.id as string, created: true };
}
