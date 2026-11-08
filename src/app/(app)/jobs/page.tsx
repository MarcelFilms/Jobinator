import Link from "next/link";
import { DISCOVERY_SOURCES, eligibilityLabel, formatSalary, remoteLabel, sourceLabel, statusLabel } from "@/lib/format";
import { requireOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

type Search = { q?: string; status?: string; source?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const { supabase } = await requireOwner();
  const q = (params.q ?? "").trim();
  const status = params.status ?? "all";
  const source = params.source ?? "all";

  let query = supabase
    .from("jobs")
    .select(
      "id, company_name, title, salary_min, salary_max, salary_currency, salary_period, salary_text, salary_is_advertised, status, remote_signal, uk_eligibility, source, canonical_url, application_email, filter_reason, duplicate_of, content_hash, location_text",
    )
    .order("first_seen_at", { ascending: false })
    .limit(300);
  if (status === "duplicate") query = query.eq("status", "duplicate");
  else if (status !== "all") query = query.eq("status", status).is("duplicate_of", null);
  else query = query.is("duplicate_of", null);
  if (source !== "all") query = query.eq("source", source);
  if (q) {
    const safe = q.replace(/[%_,.()]/g, " ").trim();
    if (safe) query = query.or(`company_name.ilike.%${safe}%,title.ilike.%${safe}%`);
  }

  const { data: jobs } = await query;
  const ids = (jobs ?? []).map((job) => job.id);
  const { data: scores } = ids.length
    ? await supabase.from("job_scores").select("job_id, fit_score, fit_status, oe_score, oe_status, content_hash").in("job_id", ids)
    : { data: [] };
  const scoreByJob = new Map((scores ?? []).map((score) => [score.job_id, score]));
  const { data: settings } = await supabase.from("settings").select("min_fit_score").limit(1).maybeSingle();
  const minFit = settings?.min_fit_score ?? 55;

  return (
    <main>
      <h1 className="font-serif text-4xl">Jobs</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink/70">
        Each row links back to the board it came from. Duplicates stay stored and are hidden here so the older listing
        keeps the attribution. OE is a private column on your dashboard.
      </p>
      <form className="mt-5 flex flex-wrap gap-2" action="/jobs">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search company or role"
          className="min-w-56 flex-1 rounded-xl border border-line bg-card px-3 py-2"
        />
        <select name="status" defaultValue={status} className="rounded-xl border border-line bg-card px-3 py-2">
          <option value="all">All except duplicates</option>
          <option value="shortlisted">Shortlisted</option>
          <option value="discovered">Discovered</option>
          <option value="filtered_out">Filtered out</option>
          <option value="expired">Expired</option>
          <option value="duplicate">Duplicates</option>
        </select>
        <select name="source" defaultValue={source} className="rounded-xl border border-line bg-card px-3 py-2">
          <option value="all">All sources</option>
          {DISCOVERY_SOURCES.map((item) => (
            <option key={item} value={item}>
              {sourceLabel(item)}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-xl bg-ink px-4 py-2 font-semibold text-paper">
          Search
        </button>
      </form>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-card shadow-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/55">
            <tr>
              <th className="px-3 py-3">Company</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Salary</th>
              <th className="px-3 py-3">Fit</th>
              <th className="px-3 py-3">OE</th>
              <th className="px-3 py-3">Remote / UK</th>
              <th className="px-3 py-3">Apply</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(jobs ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-ink/65">
                  No listings match. Run discovery from the overview. Sample jobs are never inserted.
                </td>
              </tr>
            ) : (
              (jobs ?? []).map((job) => {
                const score = scoreByJob.get(job.id);
                const stale = score && score.content_hash !== job.content_hash;
                const under =
                  job.status === "discovered" && score?.fit_status === "scored" && (score.fit_score ?? 0) < minFit;
                return (
                  <tr key={job.id} className="border-t border-line align-top">
                    <td className="px-3 py-3 font-medium">{job.company_name || "—"}</td>
                    <td className="px-3 py-3">
                      <Link href={`/jobs/${job.id}`} className="font-semibold text-mossdeep">
                        {job.title}
                      </Link>
                      <p className="mt-1 text-xs text-ink/55">{sourceLabel(job.source)}</p>
                      {job.filter_reason ? <p className="mt-1 max-w-xs text-xs text-clay">{job.filter_reason}</p> : null}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatSalary(job)}</td>
                    <td className="px-3 py-3">
                      {score?.fit_status === "scored" ? score.fit_score : "Unknown"}
                      {stale ? <span className="block text-xs text-clay">Stale</span> : null}
                      {under ? <span className="block text-xs text-ink/55">Under threshold</span> : null}
                    </td>
                    <td className="px-3 py-3">{score?.oe_status === "scored" ? score.oe_score : "Unknown"}</td>
                    <td className="px-3 py-3">
                      <span className="block">{remoteLabel(job.remote_signal)}</span>
                      <span className="block text-ink/60">{eligibilityLabel(job.uk_eligibility)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <a href={job.canonical_url} className="text-mossdeep">
                        {sourceLabel(job.source)}
                      </a>
                      {job.application_email ? <span className="mt-1 block text-xs">{job.application_email}</span> : null}
                    </td>
                    <td className="px-3 py-3">{statusLabel(job.status)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
