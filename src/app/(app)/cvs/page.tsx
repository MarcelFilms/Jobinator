import { setCvApproval, uploadCv } from "@/app/(app)/cvs/actions";
import { CV_LABELS, CV_LABEL_TITLE } from "@/lib/applications/cv-label";
import { requireOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function CvsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const { supabase, user } = await requireOwner();
  const { data: cvs } = await supabase.from("cvs").select("label, plain_text, is_approved, created_at").eq("user_id", user.id);
  const byLabel = new Map((cvs ?? []).map((row) => [row.label, row]));

  return (
    <main className="max-w-3xl">
      <h1 className="font-serif text-4xl">CVs</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        Four files, one for each label. Upload a PDF, DOCX, or TXT file. The text extracted here is what the checker can use. A file is not used until you mark it approved. Replacing a file clears that approval. The assistant picks the label from the job category and does not rotate files.
      </p>
      {params.error ? <p className="mt-4 text-sm text-clay">{params.error}</p> : null}
      {params.saved ? <p className="mt-4 text-sm text-mossdeep">Saved.</p> : null}
      <div className="mt-6 space-y-5">
        {CV_LABELS.map((label) => {
          const row = byLabel.get(label);
          return (
            <section key={label} className="rounded-2xl border border-line bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-2xl">{CV_LABEL_TITLE[label]}</h2>
                <p className="text-sm">{row?.is_approved ? "Approved" : row ? "Uploaded, not approved" : "No file yet"}</p>
              </div>
              <form action={uploadCv} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="label" value={label} />
                <input name="file" type="file" accept=".pdf,.docx,.txt,.md,text/plain" required className="text-sm" />
                <button type="submit" className="rounded-xl bg-moss px-3 py-2 text-sm font-semibold text-white">
                  {row ? "Replace file" : "Upload"}
                </button>
              </form>
              {row ? (
                <>
                  <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3 text-sm leading-relaxed">
                    {row.plain_text || "No text could be stored for this file."}
                  </pre>
                  <form action={setCvApproval} className="mt-3">
                    <input type="hidden" name="label" value={label} />
                    <input type="hidden" name="approved" value={row.is_approved ? "false" : "true"} />
                    <button type="submit" className="rounded-xl border border-line px-3 py-2 text-sm font-semibold">
                      {row.is_approved ? "Remove approval" : "Mark approved"}
                    </button>
                  </form>
                </>
              ) : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}
