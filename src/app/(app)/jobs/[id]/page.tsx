import Link from "next/link";
import { notFound } from "next/navigation";
import { eligibilityLabel, fitBand, formatSalary, remoteLabel, sourceLabel, statusLabel } from "@/lib/format";
import { DEFAULT_FIT_BANDS } from "@/lib/profile-defaults";
import { requireOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

type Reason = { rule?: string; points?: number; quote?: string; signal?: string; direction?: string };

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const { supabase } = await requireOwner();
  const { data: job } = await supabase.from("jobs").select("*").eq("id", id).maybeSingle();
  if (!job) notFound();
  const [{ data: score }, { data: settings }, { data: application }, { data: siblings }] = await Promise.all([
    supabase.from("job_scores").select("*").eq("job_id", id).maybeSingle(),
    supabase.from("settings").select("min_fit_score, fit_bands").limit(1).maybeSingle(),
    supabase.from("applications").select("status").eq("job_id", id).maybeSingle(),
    supabase.from("jobs").select("id, source, canonical_url, duplicate_of").or(`duplicate_of.eq.${id}${job.duplicate_of ? `,id.eq.${job.duplicate_of}` : ""}`),
  ]);
  const bands = { ...DEFAULT_FIT_BANDS, ...(settings?.fit_bands ?? {}) };
  const minFit = settings?.min_fit_score ?? bands.stretch;
  const fitReasons = (score?.fit_reasons ?? []) as Reason[];
  const oeReasons = (score?.oe_reasons ?? []) as Reason[];
  const stale = score && score.content_hash !== job.content_hash;
  const pipeline = application?.status ? statusLabel(application.status) : statusLabel(job.status);

  return (
    <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <article>
        <p className="text-sm text-ink/55">
          <Link href="/jobs" className="text-mossdeep">
            Jobs
          </Link>
        </p>
        <h1 className="mt-2 font-serif text-4xl">{job.title}</h1>
        <p className="mt-2 text-lg">{job.company_name || "Company not named"}</p>
        <p className="mt-3 text-sm">
          Source:{" "}
          <a href={job.canonical_url} className="font-semibold text-mossdeep">
            {sourceLabel(job.source)}
          </a>
          . The link is the board listing, which is how this row is attributed.
        </p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <Info label="Salary" value={formatSalary(job)} />
          <Info label="Status" value={pipeline} />
          <Info label="Remote" value={remoteLabel(job.remote_signal)} />
          <Info label="UK" value={eligibilityLabel(job.uk_eligibility)} />
          <Info label="Location text" value={job.location_text || "—"} />
          <Info label="Employment" value={job.employment_type || "—"} />
          <Info label="Application" value={job.application_email || job.application_url || job.canonical_url} />
        </dl>
        {job.filter_reason ? (
          <p className="mt-4 rounded-xl border border-clay/30 bg-white px-4 py-3 text-sm text-clay">{job.filter_reason}</p>
        ) : null}
        {(siblings ?? []).length > 0 ? (
          <ul className="mt-4 text-sm">
            {(siblings ?? []).map((other) => (
              <li key={other.id}>
                Also on{" "}
                <a href={other.canonical_url} className="text-mossdeep">
                  {sourceLabel(other.source)}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <h2 className="mt-8 font-serif text-2xl">Listing</h2>
        <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-line bg-card p-4 text-sm leading-relaxed">
          {job.description_text || "The source did not include a description."}
        </div>
      </article>
      <aside className="space-y-4">
        <section className="rounded-2xl border border-line bg-card p-4 shadow-card">
          <h2 className="font-serif text-2xl">Candidate fit</h2>
          <p className="mt-2 font-serif text-4xl">
            {score?.fit_status === "scored" ? score.fit_score : "Unknown"}
          </p>
          <p className="text-sm text-ink/65">
            {score?.fit_status === "scored" ? fitBand(score.fit_score, bands) : "The description is too thin to score."}
            {score?.fit_status === "scored" && job.status === "discovered" && (score.fit_score ?? 0) < minFit
              ? " Under the current minimum."
              : ""}
          </p>
          {stale ? <p className="mt-2 text-sm text-clay">This score was computed for an older description.</p> : null}
          <ul className="mt-4 space-y-3 text-sm">
            {fitReasons.length === 0 ? <li className="text-ink/60">No rule matched.</li> : null}
            {fitReasons.map((reason) => (
              <li key={`${reason.rule}-${reason.quote}`}>
                <span className="font-semibold">
                  {reason.rule} {reason.points && reason.points > 0 ? `+${reason.points}` : reason.points}
                </span>
                <span className="mt-1 block text-ink/70">“{reason.quote}”</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink/55">
            No application letter is generated in this milestone.
          </p>
        </section>
        <section className="rounded-2xl border border-privatedeep/20 bg-private p-4" aria-label="Private OE suitability">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-privatedeep">Private</p>
          <h2 className="mt-1 font-serif text-2xl text-privatedeep">OE suitability</h2>
          <p className="mt-2 font-serif text-4xl text-ink">
            {score?.oe_status === "scored" ? score.oe_score : "Unknown"}
          </p>
          <p className="text-sm text-ink/70">
            {score?.oe_confidence === "low" ? "Low confidence. " : ""}
            This block is not part of the listing. It is never copied into an application, a template, or a prompt.
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {oeReasons.length === 0 ? <li>Fewer than two signals, so the score stays Unknown.</li> : null}
            {oeReasons.map((reason) => (
              <li key={`${reason.signal}-${reason.quote}`}>
                <span className="font-semibold">
                  {reason.signal} · {reason.direction}
                </span>
                <span className="mt-1 block text-ink/70">“{reason.quote}”</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink/50">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
