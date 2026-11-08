import { runDiscoveryAction } from "@/app/(app)/actions";
import { DISCOVERY_SOURCES, sourceLabel } from "@/lib/format";
import { requireOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const { supabase } = await requireOwner();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: jobs }, { data: applications }, { data: runs }] = await Promise.all([
    supabase.from("jobs").select("status, first_seen_at, duplicate_of"),
    supabase.from("applications").select("status"),
    supabase.from("source_runs").select("source, finished_at, ok, jobs_fetched, jobs_inserted, jobs_filtered, error").order("finished_at", { ascending: false }).limit(20),
  ]);

  const rows = jobs ?? [];
  const visible = rows.filter((job) => !job.duplicate_of);
  const fresh = visible.filter((job) => job.first_seen_at >= since);
  const apps = applications ?? [];
  const countStatus = (values: string[]) => apps.filter((app) => values.includes(app.status)).length;

  const stats = [
    ["New in 24 hours", fresh.length],
    ["Suitable", visible.filter((job) => job.status === "shortlisted").length],
    ["Awaiting approval", countStatus(["drafted", "needs_review"])],
    ["Sent", countStatus(["sent"])],
    ["Replies", countStatus(["replied"])],
    ["Interviews", countStatus(["interview"])],
    ["Rejections", countStatus(["rejected", "rejected_by_employer"])],
  ];

  const latest = new Map<string, NonNullable<typeof runs>[number]>();
  for (const run of runs ?? []) {
    if (!latest.has(run.source)) latest.set(run.source, run);
  }

  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl">Overview</h1>
          <p className="mt-2 max-w-2xl text-ink/75">
            {visible.length} stored listings, excluding cross-board duplicates. Nothing here is a sample job.
          </p>
        </div>
        <form action={runDiscoveryAction}>
          <button type="submit" className="rounded-xl bg-moss px-4 py-2.5 font-semibold text-white">
            Run discovery
          </button>
        </form>
      </div>
      {notice ? <p className="mt-4 rounded-xl border border-line bg-card px-4 py-3 text-sm">{notice}</p> : null}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <article key={String(label)} className="rounded-2xl border border-line bg-card px-4 py-4 shadow-card">
            <p className="text-sm text-ink/60">{label}</p>
            <p className="mt-1 font-serif text-3xl">{value}</p>
          </article>
        ))}
      </section>
      <section className="mt-8">
        <h2 className="font-serif text-2xl">Sources</h2>
        <p className="mt-1 text-sm text-ink/65">
          Public feeds and UK board pages. A board that answers with a login wall or a CAPTCHA is skipped. Automatic
          email sending stays off until Gmail is connected. Web forms are not submitted.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {DISCOVERY_SOURCES.map((source) => {
            const run = latest.get(source);
            return (
              <article key={source} className="rounded-2xl border border-line bg-card p-4 shadow-card">
                <h3 className="font-semibold">{sourceLabel(source)}</h3>
                {run ? (
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink/60">Last run</dt>
                      <dd>{run.ok ? "Succeeded" : "Failed"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink/60">Finished</dt>
                      <dd>{run.finished_at ? new Date(run.finished_at).toLocaleString("en-GB") : "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink/60">Fetched / inserted / filtered</dt>
                      <dd>
                        {run.jobs_fetched} / {run.jobs_inserted} / {run.jobs_filtered}
                      </dd>
                    </div>
                    {run.error ? <p className="pt-2 text-clay">{run.error}</p> : null}
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-ink/65">No run yet. The table stays empty until a real fetch writes rows.</p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
