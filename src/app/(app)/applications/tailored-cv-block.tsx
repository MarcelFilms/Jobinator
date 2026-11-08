import { regenerateTailoredCv } from "@/app/(app)/applications/actions";
import { missingTable } from "@/lib/cv/generate";
import { requireOwner } from "@/lib/owner";

type Finding = { claim?: string; verdict?: string; span?: string | null; ruleKey?: string | null };
type Omission = { line?: string; reason?: string };

export async function TailoredCvBlock({ applicationId, locked, back }: { applicationId: string; locked: boolean; back: "job" | "queue" }) {
  const { supabase } = await requireOwner();
  const { data: row, error } = await supabase
    .from("tailored_cvs")
    .select("passed, method, model, plain_text, findings, omitted, keywords, updated_at")
    .eq("application_id", applicationId)
    .maybeSingle();

  if (error) {
    return (
      <div className="mt-4 rounded-xl border border-line bg-paper p-3 text-sm">
        <p className="font-semibold">Tailored CV</p>
        <p className="mt-1 text-ink/70">
          {missingTable(error.message)
            ? "Not available until supabase/migrations/0005_tailored_cvs.sql is run in the Supabase SQL editor."
            : error.message}
        </p>
      </div>
    );
  }

  const findings = ((row?.findings ?? []) as Finding[]).filter((finding) => finding.verdict !== "supported");
  const omitted = (row?.omitted ?? []) as Omission[];
  return (
    <div className="mt-4 rounded-xl border border-line bg-paper p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Tailored CV</p>
        {row ? (
          <p>
            {row.passed ? "Check passed" : "Needs review"} · {row.method === "model" ? `Reworded with ${row.model}` : "Rules-based, £0"}
          </p>
        ) : null}
      </div>
      {row ? (
        <>
          <p className="mt-2">
            <a href={`/api/tailored-cv/${applicationId}`} target="_blank" rel="noreferrer" className="font-semibold text-mossdeep">
              Open the PDF
            </a>
            <span className="text-ink/60"> · updated {new Date(row.updated_at).toLocaleString("en-GB")}</span>
          </p>
          {row.keywords?.length ? <p className="mt-2 text-ink/70">Matched to: {row.keywords.slice(0, 12).join(", ")}</p> : null}
          {findings.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {findings.map((finding, index) => (
                <li key={`${finding.claim}-${index}`}>
                  <span className="font-semibold">{finding.verdict}</span>
                  {finding.ruleKey ? ` · ${finding.ruleKey}` : ""} — {finding.claim}
                </li>
              ))}
            </ul>
          ) : null}
          <details className="mt-2">
            <summary className="cursor-pointer font-semibold">CV text</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">{row.plain_text}</pre>
          </details>
          {omitted.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-semibold">Left out of this CV ({omitted.length})</summary>
              <ul className="mt-2 space-y-1 text-ink/70">
                {omitted.map((item, index) => (
                  <li key={`${item.line}-${index}`}>
                    {item.reason} “{item.line}”
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : (
        <p className="mt-1 text-ink/70">No tailored CV yet.</p>
      )}
      {locked ? null : (
        <form action={regenerateTailoredCv} className="mt-3">
          <input type="hidden" name="application_id" value={applicationId} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className="rounded-xl border border-line px-3 py-2 font-semibold">
            {row ? "Rebuild the tailored CV" : "Build the tailored CV"}
          </button>
        </form>
      )}
    </div>
  );
}
