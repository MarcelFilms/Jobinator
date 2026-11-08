import Link from "next/link";
import { draftTemplate, requestPersonalizedDraft } from "@/app/(app)/applications/actions";
import { TailoredCvBlock } from "@/app/(app)/applications/tailored-cv-block";
import { CV_LABEL_TITLE, cvLabelForJob } from "@/lib/applications/cv-label";
import { PERSONALIZED_DISABLED_REASON } from "@/lib/applications/personalize";
import { statusLabel } from "@/lib/format";
import { requireOwner } from "@/lib/owner";

const LOCKED = new Set(["sent", "replied", "interview", "rejected_by_employer", "offer"]);

export async function ApplicationPanel({
  jobId,
  title,
  description,
  company,
  status,
  duplicateOf,
}: {
  jobId: string;
  title: string;
  description: string;
  company: string;
  status: string;
  duplicateOf: string | null;
}) {
  const { supabase, user } = await requireOwner();
  const label = cvLabelForJob(title, description);
  const [{ data: cv }, { data: application }] = await Promise.all([
    supabase.from("cvs").select("id, is_approved, plain_text").eq("user_id", user.id).eq("label", label).maybeSingle(),
    supabase.from("applications").select("id, status, subject, body, kind").eq("job_id", jobId).maybeSingle(),
  ]);
  const duplicate = Boolean(duplicateOf) || status === "duplicate";
  const ready = Boolean(cv?.is_approved && cv.plain_text.trim());

  return (
    <section className="mt-8 rounded-2xl border border-line bg-card p-4 shadow-card">
      <h2 className="font-serif text-2xl">Application</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        The CV for this job is {CV_LABEL_TITLE[label]}. That follows the job category. It is not chosen at random.
        {company ? ` The letter can name ${company} and this role, plus approved facts.` : " The letter uses approved facts and this role."}
      </p>
      <p className="mt-2 text-sm">{ready ? "The matching CV is approved." : "The matching CV is not approved yet."}</p>
      {!ready ? (
        <p className="mt-2 text-sm">
          <Link href="/cvs" className="font-semibold text-mossdeep">
            Upload and approve the {CV_LABEL_TITLE[label]} CV
          </Link>
        </p>
      ) : null}
      {application ? (
        <div className="mt-4">
          <p className="text-sm">
            {statusLabel(application.status)} · {application.kind === "template" ? "Standard template" : application.kind}
          </p>
          <p className="mt-2 text-sm font-semibold">{application.subject}</p>
          <div className="mt-2 whitespace-pre-wrap rounded-xl bg-paper p-3 text-sm leading-relaxed">{application.body}</div>
          <TailoredCvBlock applicationId={application.id} locked={LOCKED.has(application.status)} back="job" />
          <p className="mt-3 text-sm">
            <Link href={`/queue#${application.id}`} className="font-semibold text-mossdeep">
              Open in the queue
            </Link>
          </p>
        </div>
      ) : duplicate ? (
        <p className="mt-4 text-sm">This row is a duplicate. Draft the original listing.</p>
      ) : ready ? (
        <form action={draftTemplate} className="mt-4">
          <input type="hidden" name="job_id" value={jobId} />
          <button type="submit" className="rounded-xl bg-moss px-3 py-2 text-sm font-semibold text-white">
            Draft a standard application and a tailored CV
          </button>
        </form>
      ) : null}
      <form action={requestPersonalizedDraft} className="mt-4">
        <input type="hidden" name="job_id" value={jobId} />
        <button type="submit" disabled className="cursor-not-allowed rounded-xl border border-line px-3 py-2 text-sm text-ink/50">
          Personalized draft
        </button>
        <p className="mt-2 text-sm">{PERSONALIZED_DISABLED_REASON}</p>
      </form>
    </section>
  );
}
