"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CV_LABEL_TITLE, cvLabelForJob } from "@/lib/applications/cv-label";
import { personalizedDraftDecision } from "@/lib/applications/personalize";
import { prepareTemplate } from "@/lib/applications/template";
import { validateApplication } from "@/lib/applications/validate";
import { londonDay } from "@/lib/london";
import { requireOwner } from "@/lib/owner";
import type { ProfileFact, WritingRuleSeed } from "@/lib/profile-defaults";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCKED = new Set(["sent", "replied", "interview", "rejected_by_employer", "offer"]);

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
  const { data: job, error: jobErrorMessage } = await admin.from("jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobErrorMessage) jobError(jobId, jobErrorMessage.message);
  if (!job) redirect("/jobs");
  if (job.duplicate_of || job.status === "duplicate") jobError(jobId, "Draft the original listing. This row is a duplicate.");

  const existing = await admin.from("applications").select("id").eq("job_id", jobId).maybeSingle();
  if (existing.error) jobError(jobId, existing.error.message);
  if (existing.data) redirect("/queue?notice=An application already exists for this job.");

  const [{ data: profile, error: profileError }, { data: rules, error: rulesError }] = await Promise.all([
    admin.from("candidate_profiles").select("display_name, facts, qualifications_absent, years_customer_facing").eq("user_id", user.id).maybeSingle(),
    admin.from("writing_rules").select("rule_key, instruction, severity, applies_to").eq("user_id", user.id),
  ]);
  if (profileError) jobError(jobId, profileError.message);
  if (rulesError) jobError(jobId, rulesError.message);

  const label = cvLabelForJob(job.title ?? "", job.description_text ?? "");
  const cv = await admin.from("cvs").select("id, plain_text, is_approved").eq("user_id", user.id).eq("label", label).maybeSingle();
  if (cv.error) jobError(jobId, cv.error.message);
  if (!cv.data?.is_approved || !cv.data.plain_text.trim()) {
    jobError(jobId, `Approve the ${CV_LABEL_TITLE[label]} CV before drafting. The CV is chosen from the job category.`);
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
  if (inserted.error || !inserted.data) jobError(jobId, inserted.error?.message ?? "The application could not be stored.");

  const validation = await admin.from("validation_results").insert({
    application_id: inserted.data.id,
    body_hash: draft.validation.bodyHash,
    passed: draft.validation.passed,
    method: "deterministic",
    findings: draft.validation.findings,
    requires_manual_review: draft.validation.requiresManualReview,
  });
  if (validation.error) jobError(jobId, validation.error.message);

  revalidatePath("/");
  revalidatePath("/queue");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/queue#${inserted.data.id}`);
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

function ruleFromRow(rule: { rule_key: string; instruction: string; severity: string; applies_to: string }): WritingRuleSeed {
  return {
    ruleKey: rule.rule_key,
    instruction: rule.instruction,
    severity: rule.severity === "rewrite" ? "rewrite" : "block",
    appliesTo: rule.applies_to === "internal_only" ? "internal_only" : "employer_text",
  };
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

