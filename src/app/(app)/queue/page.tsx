import Link from "next/link";
import { decideApplication, saveApplication } from "@/app/(app)/applications/actions";
import { CV_LABEL_TITLE, type CvLabel } from "@/lib/applications/cv-label";
import { PERSONALIZED_DISABLED_REASON } from "@/lib/applications/personalize";
import { statusLabel } from "@/lib/format";
import { requireOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

type Finding = { claim?: string; verdict?: string; span?: string | null; ruleKey?: string | null };

const LOCKED = new Set(["sent", "replied", "interview", "rejected_by_employer", "offer"]);

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const { data: applications } = await supabase
    .from("applications")
    .select("id, job_id, cv_id, kind, status, subject, body, owner_edited, jobs(title, company_name, canonical_url), cvs(label, plain_text, is_approved)");
  const ids = (applications ?? []).map((row) => row.id);
  const { data: validations } = ids.length
    ? await supabase
        .from("validation_results")
        .select("application_id, passed, method, findings, requires_manual_review, created_at, body_hash")
        .in("application_id", ids)
        .order("created_at", { ascending: false })
    : { data: [] };
  const latest = new Map<string, NonNullable<typeof validations>[number]>();
  for (const row of validations ?? []) {
    if (!latest.has(row.application_id)) latest.set(row.application_id, row);
  }
  const rows = [...(applications ?? [])].sort((a, b) => {
    const aName = jobOf(a).company_name ?? "";
    const bName = jobOf(b).company_name ?? "";
    return aName.localeCompare(bName);
  });

  return (
    <main>
      <h1 className="font-serif text-4xl">Queue</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink/70">
        Preview, edit, approve, or reject a letter. Nothing on this page sends an email or marks an application as sent.
      </p>
      <div className="mt-4 rounded-2xl border border-line bg-card px-4 py-3">
        <button type="button" disabled className="cursor-not-allowed rounded-xl border border-line px-3 py-2 text-sm text-ink/50">
          Personalized draft
        </button>
        <p className="mt-2 text-sm">{PERSONALIZED_DISABLED_REASON}</p>
      </div>
      {params.error ? <p className="mt-4 text-sm text-clay">{params.error}</p> : null}
      {params.notice ? <p className="mt-4 text-sm text-mossdeep">{params.notice}</p> : null}
      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink/70">
          No applications yet. Open a job and draft a standard letter. This queue does not create sample applications.
        </p>
      ) : null}
      <div className="mt-6 space-y-6">
        {rows.map((row) => {
          const job = jobOf(row);
          const cv = cvOf(row);
          const validation = latest.get(row.id);
          const findings = (validation?.findings ?? []) as Finding[];
          const label = cv?.label && cv.label in CV_LABEL_TITLE ? CV_LABEL_TITLE[cv.label as CvLabel] : "No CV";
          const locked = LOCKED.has(row.status);
          return (
            <article key={row.id} id={row.id} className="rounded-2xl border border-line bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-2xl">
                  <Link href={`/jobs/${row.job_id}`} className="text-mossdeep">
                    {job.title || "Role"}
                  </Link>
                </h2>
                <p className="text-sm">{statusLabel(row.status)}</p>
              </div>
              <p className="mt-1 text-sm text-ink/70">
                {job.company_name || "Company not named"} · {label} · {row.kind === "template" ? "Standard template" : row.kind}
                {row.owner_edited ? " · Edited" : ""}
              </p>
              {job.canonical_url ? (
                <p className="mt-2 text-sm">
                  Listing:{" "}
                  <a href={job.canonical_url} className="text-mossdeep">
                    {job.canonical_url}
                  </a>
                </p>
              ) : null}
              <p className="mt-3 text-sm">
                Check: {validation ? (validation.passed ? "Passed" : "Needs review") : "No validation row"} ·{" "}
                {validation?.method === "deterministic" ? "Deterministic" : validation?.method || "Not checked"}
              </p>
              <h3 className="mt-4 text-sm font-semibold">Preview</h3>
              <p className="mt-1 text-sm font-semibold">{row.subject}</p>
              <div className="mt-2 whitespace-pre-wrap rounded-xl bg-paper p-3 text-sm leading-relaxed">{row.body}</div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold">Selected CV</summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3">{cv?.plain_text || "No CV text stored."}</pre>
              </details>
              {findings.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {findings.map((finding, index) => (
                    <li key={`${finding.claim}-${index}`}>
                      <span className="font-semibold">{finding.verdict}</span>
                      {finding.ruleKey ? ` · ${finding.ruleKey}` : ""}
                      <span className="mt-1 block text-ink/75">{finding.claim}</span>
                      {finding.span ? <span className="mt-1 block text-ink/60">“{finding.span}”</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {locked ? null : (
                <form action={saveApplication} className="mt-4 space-y-2">
                  <input type="hidden" name="application_id" value={row.id} />
                  <label className="block text-sm font-semibold">
                    Subject
                    <input name="subject" defaultValue={row.subject} className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" />
                  </label>
                  <label className="block text-sm font-semibold">
                    Letter
                    <textarea name="body" rows={12} defaultValue={row.body} className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" />
                  </label>
                  <button type="submit" className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">
                    Save edit
                  </button>
                </form>
              )}
              {locked ? null : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.status === "drafted" || row.status === "needs_review" ? (
                    <form action={decideApplication}>
                      <input type="hidden" name="application_id" value={row.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <button type="submit" className="rounded-xl bg-moss px-3 py-2 text-sm font-semibold text-white">
                        Approve
                      </button>
                    </form>
                  ) : null}
                  {row.status === "rejected" ? null : (
                    <form action={decideApplication}>
                      <input type="hidden" name="application_id" value={row.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <button type="submit" className="rounded-xl border border-clay/40 px-3 py-2 text-sm font-semibold text-clay">
                        Reject
                      </button>
                    </form>
                  )}
                </div>
              )}
              {row.status === "needs_review" ? (
                <p className="mt-3 text-sm text-ink/70">Approving this letter does not send it. The last check did not pass.</p>
              ) : null}
            </article>
          );
        })}
      </div>
    </main>
  );
}

function jobOf(row: { jobs: { title: string; company_name: string | null; canonical_url: string } | { title: string; company_name: string | null; canonical_url: string }[] | null }): {
  title: string;
  company_name: string | null;
  canonical_url: string;
} {
  const job = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
  return job ?? { title: "", company_name: null, canonical_url: "" };
}

function cvOf(row: { cvs: { label: string; plain_text: string; is_approved: boolean } | { label: string; plain_text: string; is_approved: boolean }[] | null }): {
  label: string;
  plain_text: string;
  is_approved: boolean;
} | null {
  const cv = Array.isArray(row.cvs) ? row.cvs[0] : row.cvs;
  return cv ?? null;
}
