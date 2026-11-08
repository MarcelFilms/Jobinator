import type { SupabaseClient } from "@supabase/supabase-js";
import { londonDay } from "@/lib/london";
import { DEFAULT_CATEGORY_BLOCKLIST, DEFAULT_MIN_FIT, DEFAULT_SCORING_PROFILE, type ScoringProfile } from "@/lib/profile-defaults";
import { evaluateListing, type Decision } from "@/lib/scoring/evaluate";
import { contentHash } from "@/lib/scoring/hash";
import { fetchArbeitnow } from "@/lib/sources/arbeitnow";
import { fetchAshby } from "@/lib/sources/ashby";
import { fetchGreenhouse } from "@/lib/sources/greenhouse";
import { fetchJobicy, fetchJobicyStatuses } from "@/lib/sources/jobicy";
import { fetchLever } from "@/lib/sources/lever";
import { fetchLinkedIn } from "@/lib/sources/linkedin";
import { fetchPublicBoard } from "@/lib/sources/public-boards";
import { fetchReed } from "@/lib/sources/reed";
import { fetchRemoteOk } from "@/lib/sources/remoteok";
import { fetchRemotive } from "@/lib/sources/remotive";
import { SourceError, type ParsedListing, type SourceId } from "@/lib/sources/types";
import { fetchWeworkremotely } from "@/lib/sources/weworkremotely";
import { fetchWorkingNomads } from "@/lib/sources/workingnomads";
import { thresholdForDailyTarget } from "@/lib/scoring/threshold";

export type DiscoverSource = Exclude<SourceId, never>;

export type SourceReport = {
  source: DiscoverSource;
  ok: boolean;
  httpStatus: number | null;
  jobsFetched: number;
  jobsInserted: number;
  jobsFiltered: number;
  error: string | null;
  skipped: string | null;
};

export type DiscoverReport = {
  day: string;
  spendGbp: number;
  modelCalls: number;
  sources: SourceReport[];
  dailyFit: { threshold: number; passing: number; considered: number } | null;
};

type ExistingJob = {
  id: string;
  external_id: string;
  content_hash: string;
  status: string;
  first_seen_at: string;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function loadProfile(supabase: SupabaseClient): Promise<ScoringProfile> {
  const { data: settings, error: settingsError } = await supabase
    .from("settings")
    .select("min_fit_score, category_blocklist")
    .limit(1)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);
  const { data: profile, error: profileError } = await supabase
    .from("candidate_profiles")
    .select("years_customer_facing, languages")
    .limit(1)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  return {
    yearsCustomerFacing:
      profile?.years_customer_facing === null || profile?.years_customer_facing === undefined
        ? null
        : Number(profile.years_customer_facing),
    languages: profile?.languages?.length ? profile.languages : DEFAULT_SCORING_PROFILE.languages,
    categoryBlocklist: settings?.category_blocklist?.length ? settings.category_blocklist : DEFAULT_CATEGORY_BLOCKLIST,
    minFitScore: typeof settings?.min_fit_score === "number" ? settings.min_fit_score : DEFAULT_MIN_FIT,
  };
}

function listingHash(listing: ParsedListing): string {
  return contentHash(listing.companyName, listing.title, listing.descriptionText);
}

function decisionFor(listing: ParsedListing, profile: ScoringProfile, jobicyStatus: "active" | "closed" | "unknown" | null): Decision {
  return evaluateListing({
    source: listing.source,
    title: listing.title,
    descriptionText: listing.descriptionText,
    locationText: listing.locationText,
    countryText: listing.countryText,
    jobLevel: listing.jobLevel,
    expiresAt: listing.expiresAt,
    jobicyStatus,
    profile,
  });
}

export async function runDiscover(supabase: SupabaseClient): Promise<DiscoverReport> {
  const profile = await loadProfile(supabase);
  const day = londonDay();
  const totals = { seen: 0, rejected: 0, scored: 0, unknown: 0 };
  const sources: SourceReport[] = [];

  sources.push(await runSource(supabase, "weworkremotely", profile, totals, null));
  const jobicyCursor = await jobicyCursorIfFresh(supabase);
  sources.push(await runSource(supabase, "jobicy", profile, totals, jobicyCursor));
  sources.push(await runOpen(supabase, "workingnomads", profile, totals, fetchWorkingNomads));
  sources.push(await runOpen(supabase, "remotive", profile, totals, fetchRemotive));
  sources.push(await runOpen(supabase, "greenhouse", profile, totals, fetchGreenhouse));
  sources.push(await runOpen(supabase, "lever", profile, totals, fetchLever));
  sources.push(await runOpen(supabase, "ashby", profile, totals, fetchAshby));
  sources.push(await runOpen(supabase, "reed", profile, totals, fetchReed));
  sources.push(await runOpen(supabase, "linkedin", profile, totals, fetchLinkedIn));
  sources.push(await runOpen(supabase, "indeed", profile, totals, fetchPublicBoard("indeed")));
  sources.push(await runOpen(supabase, "cvlibrary", profile, totals, fetchPublicBoard("cvlibrary")));
  sources.push(await runOpen(supabase, "totaljobs", profile, totals, fetchPublicBoard("totaljobs")));
  sources.push(await runOpen(supabase, "adzuna", profile, totals, fetchPublicBoard("adzuna")));
  sources.push(await runOpen(supabase, "glassdoor", profile, totals, fetchPublicBoard("glassdoor")));
  sources.push(await runOpen(supabase, "arbeitnow", profile, totals, fetchArbeitnow));
  sources.push(await runOpen(supabase, "remoteok", profile, totals, fetchRemoteOk));

  const dailyFit = await tuneDailyThreshold(supabase);
  await writeUsage(supabase, day, totals);
  return { day, spendGbp: 0, modelCalls: 0, sources, dailyFit };
}

async function jobicyCursorIfFresh(supabase: SupabaseClient): Promise<string | null> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data } = await supabase
    .from("source_runs")
    .select("next_cursor, finished_at")
    .eq("source", "jobicy")
    .eq("ok", true)
    .gt("finished_at", since)
    .not("next_cursor", "is", null)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.next_cursor ?? null;
}

async function tuneDailyThreshold(
  supabase: SupabaseClient,
): Promise<{ threshold: number; passing: number; considered: number } | null> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data: settings } = await supabase.from("settings").select("daily_application_limit").limit(1).maybeSingle();
  const high = typeof settings?.daily_application_limit === "number" ? settings.daily_application_limit : 15;
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select("id, status")
    .gte("first_seen_at", since)
    .in("status", ["discovered", "shortlisted"]);
  if (error) throw new Error(error.message);
  const ids = (jobs ?? []).map((job) => job.id as string);
  if (ids.length === 0) return null;
  const { data: scores, error: scoreError } = await supabase
    .from("job_scores")
    .select("job_id, fit_score, fit_status")
    .in("job_id", ids);
  if (scoreError) throw new Error(scoreError.message);
  const ranked = (scores ?? [])
    .filter((row) => row.fit_status === "scored" && typeof row.fit_score === "number")
    .sort((a, b) => Number(b.fit_score) - Number(a.fit_score));
  const tuned = thresholdForDailyTarget(ranked.map((row) => Number(row.fit_score)), high);
  if (!tuned) return null;
  await supabase.from("settings").update({ min_fit_score: tuned.threshold }).not("min_fit_score", "is", null);
  const passing = new Set(
    ranked.filter((row) => Number(row.fit_score) >= tuned.threshold).map((row) => row.job_id as string),
  );
  const promote = (jobs ?? []).filter((job) => passing.has(job.id as string) && job.status !== "shortlisted").map((job) => job.id as string);
  const demote = (jobs ?? []).filter((job) => !passing.has(job.id as string) && job.status === "shortlisted").map((job) => job.id as string);
  if (promote.length > 0) {
    await supabase.from("jobs").update({ status: "shortlisted", filter_reason: null }).in("id", promote);
  }
  if (demote.length > 0) {
    await supabase.from("jobs").update({ status: "discovered" }).in("id", demote);
  }
  return { threshold: tuned.threshold, passing: passing.size, considered: ranked.length };
}

async function lastSuccessfulJobicy(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("source_runs")
    .select("finished_at, jobs_fetched")
    .eq("source", "jobicy")
    .eq("ok", true)
    .gt("jobs_fetched", 0)
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.finished_at ?? null;
}

async function runOpen(
  supabase: SupabaseClient,
  source: DiscoverSource,
  profile: ScoringProfile,
  totals: { seen: number; rejected: number; scored: number; unknown: number },
  load: () => Promise<{ status: number; listings: ParsedListing[] }>,
): Promise<SourceReport> {
  const started = new Date().toISOString();
  try {
    const fetched = await load();
    const listings = fetched.listings;
    const outcome =
      listings.length === 0
        ? { inserted: 0, filtered: 0 }
        : await storeListings(supabase, listings, profile, new Map(), totals);
    await supabase.from("source_runs").insert({
      source,
      started_at: started,
      finished_at: new Date().toISOString(),
      ok: true,
      http_status: fetched.status,
      jobs_fetched: listings.length,
      jobs_inserted: outcome.inserted,
      jobs_filtered: outcome.filtered,
      error: null,
      next_cursor: null,
    });
    return {
      source,
      ok: true,
      httpStatus: fetched.status,
      jobsFetched: listings.length,
      jobsInserted: outcome.inserted,
      jobsFiltered: outcome.filtered,
      error: null,
      skipped: null,
    };
  } catch (error) {
    const httpStatus = error instanceof SourceError ? error.httpStatus : null;
    const message = error instanceof Error ? error.message : "Source failed";
    await supabase.from("source_runs").insert({
      source,
      started_at: started,
      finished_at: new Date().toISOString(),
      ok: false,
      http_status: httpStatus,
      jobs_fetched: 0,
      jobs_inserted: 0,
      jobs_filtered: 0,
      error: message.slice(0, 500),
      next_cursor: null,
    });
    return {
      source,
      ok: false,
      httpStatus,
      jobsFetched: 0,
      jobsInserted: 0,
      jobsFiltered: 0,
      error: message,
      skipped: null,
    };
  }
}

async function runSource(
  supabase: SupabaseClient,
  source: "weworkremotely" | "jobicy",
  profile: ScoringProfile,
  totals: { seen: number; rejected: number; scored: number; unknown: number },
  cursor: string | null,
): Promise<SourceReport> {
  const started = new Date().toISOString();
  if (source === "jobicy") {
    const last = await lastSuccessfulJobicy(supabase);
    if (last && Date.now() - new Date(last).getTime() < HOUR_MS) {
      return {
        source,
        ok: true,
        httpStatus: null,
        jobsFetched: 0,
        jobsInserted: 0,
        jobsFiltered: 0,
        error: null,
        skipped: "Jobicy's last successful sync was under an hour ago.",
      };
    }
  }

  try {
    const fetched =
      source === "weworkremotely" ? await fetchWeworkremotely() : await fetchJobicy(cursor);
    const listings = fetched.listings;
    if (listings.length === 0) {
      throw new SourceError(`${source} returned no listings.`, fetched.status);
    }
    let statuses = new Map<string, "active" | "closed" | "unknown">();
    if (source === "jobicy") {
      const { data: stored } = await supabase.from("jobs").select("external_id").eq("source", "jobicy");
      const ids = [...listings.map((listing) => listing.externalId), ...(stored ?? []).map((row) => row.external_id as string)];
      statuses = await fetchJobicyStatuses(ids);
      await applyClosedStatuses(supabase, statuses);
    }
    const outcome = await storeListings(supabase, listings, profile, statuses, totals);
    const report: SourceReport = {
      source,
      ok: true,
      httpStatus: fetched.status,
      jobsFetched: listings.length,
      jobsInserted: outcome.inserted,
      jobsFiltered: outcome.filtered,
      error: null,
      skipped: null,
    };
    await supabase.from("source_runs").insert({
      source,
      started_at: started,
      finished_at: new Date().toISOString(),
      ok: true,
      http_status: fetched.status,
      jobs_fetched: listings.length,
      jobs_inserted: outcome.inserted,
      jobs_filtered: outcome.filtered,
      error: null,
      next_cursor:
        source === "jobicy" && "hasMore" in fetched && fetched.hasMore === true && "nextCursor" in fetched
          ? fetched.nextCursor
          : null,
    });
    return report;
  } catch (error) {
    const httpStatus = error instanceof SourceError ? error.httpStatus : null;
    const message = error instanceof Error ? error.message : "Source failed";
    await supabase.from("source_runs").insert({
      source,
      started_at: started,
      finished_at: new Date().toISOString(),
      ok: false,
      http_status: httpStatus,
      jobs_fetched: 0,
      jobs_inserted: 0,
      jobs_filtered: 0,
      error: message.slice(0, 500),
      next_cursor: null,
    });
    return {
      source,
      ok: false,
      httpStatus,
      jobsFetched: 0,
      jobsInserted: 0,
      jobsFiltered: 0,
      error: message,
      skipped: null,
    };
  }
}

async function applyClosedStatuses(
  supabase: SupabaseClient,
  statuses: Map<string, "active" | "closed" | "unknown">,
): Promise<void> {
  const closed = [...statuses.entries()].filter(([, status]) => status === "closed").map(([id]) => id);
  if (closed.length === 0) return;
  await supabase
    .from("jobs")
    .update({
      status: "expired",
      filter_reason: "closed: Jobicy reports this listing as closed.",
      last_seen_at: new Date().toISOString(),
    })
    .eq("source", "jobicy")
    .in("external_id", closed)
    .neq("status", "expired");
}

async function storeListings(
  supabase: SupabaseClient,
  listings: ParsedListing[],
  profile: ScoringProfile,
  statuses: Map<string, "active" | "closed" | "unknown">,
  totals: { seen: number; rejected: number; scored: number; unknown: number },
): Promise<{ inserted: number; filtered: number }> {
  const source = listings[0]?.source;
  if (!source) return { inserted: 0, filtered: 0 };
  const ids = listings.map((listing) => listing.externalId);
  const { data: existingRows, error: existingError } = await supabase
    .from("jobs")
    .select("id, external_id, content_hash, status, first_seen_at")
    .eq("source", source)
    .in("external_id", ids);
  if (existingError) throw new Error(existingError.message);
  const existing = new Map<string, ExistingJob>((existingRows ?? []).map((row) => [row.external_id as string, row as ExistingJob]));

  const now = new Date().toISOString();
  const unchanged: string[] = [];
  const fresh: Array<{ listing: ParsedListing; hash: string; decision: Decision }> = [];
  const changed: Array<{ row: ExistingJob; listing: ParsedListing; hash: string; decision: Decision }> = [];
  const bucketByJobId = new Map<string, "rejected" | "scored" | "unknown">();
  let filtered = 0;

  const bucketFor = (decision: Decision): "rejected" | "scored" | "unknown" => {
    if (decision.status === "filtered_out" || decision.status === "expired" || decision.status === "duplicate") {
      return "rejected";
    }
    return decision.fitStatus === "scored" ? "scored" : "unknown";
  };

  for (const listing of listings) {
    totals.seen += 1;
    const hash = listingHash(listing);
    const jobicyStatus = listing.source === "jobicy" ? (statuses.get(listing.externalId) ?? null) : null;
    const current = existing.get(listing.externalId);
    if (current && current.content_hash === hash) {
      unchanged.push(current.id);
      if (jobicyStatus === "closed" && current.status !== "expired") {
        bucketByJobId.set(current.id, "rejected");
        filtered += 1;
      }
      continue;
    }
    const decision = decisionFor(listing, profile, jobicyStatus);
    if (bucketFor(decision) === "rejected") filtered += 1;
    if (current) {
      changed.push({ row: current, listing, hash, decision });
      bucketByJobId.set(current.id, bucketFor(decision));
    } else fresh.push({ listing, hash, decision });
  }

  if (unchanged.length > 0) {
    await supabase.from("jobs").update({ last_seen_at: now }).in("id", unchanged);
  }

  const scoreRows: Array<Record<string, unknown>> = [];
  const clearScoreIds: string[] = [];

  for (const item of changed) {
    const { error } = await supabase
      .from("jobs")
      .update(jobUpdate(item.listing, item.hash, item.decision, now))
      .eq("id", item.row.id);
    if (error) throw new Error(error.message);
    if (keepsScore(item.decision)) scoreRows.push(scoreRow(item.row.id, item.hash, item.decision));
    else clearScoreIds.push(item.row.id);
  }

  let inserted = 0;
  for (let index = 0; index < fresh.length; index += 40) {
    const batch = fresh.slice(index, index + 40);
    const { data, error } = await supabase
      .from("jobs")
      .insert(batch.map((item) => jobInsert(item.listing, item.hash, item.decision, now)))
      .select("id, external_id");
    if (error) throw new Error(error.message);
    inserted += data?.length ?? 0;
    const byExternal = new Map((data ?? []).map((row) => [row.external_id as string, row.id as string]));
    for (const item of batch) {
      const id = byExternal.get(item.listing.externalId);
      if (!id) continue;
      bucketByJobId.set(id, bucketFor(item.decision));
      if (keepsScore(item.decision)) scoreRows.push(scoreRow(id, item.hash, item.decision));
    }
  }

  if (scoreRows.length > 0) {
    const { error } = await supabase.from("job_scores").upsert(scoreRows, { onConflict: "job_id" });
    if (error) throw new Error(error.message);
  }
  if (clearScoreIds.length > 0) {
    await supabase.from("job_scores").delete().in("job_id", clearScoreIds);
  }

  const hashes = [...fresh, ...changed].map((item) => item.hash);
  const newlyDuplicate = await linkDuplicates(supabase, hashes);
  for (const id of newlyDuplicate) {
    if (bucketByJobId.get(id) !== "rejected") filtered += 1;
    bucketByJobId.set(id, "rejected");
  }
  for (const bucket of bucketByJobId.values()) {
    if (bucket === "rejected") totals.rejected += 1;
    else if (bucket === "scored") totals.scored += 1;
    else totals.unknown += 1;
  }
  return { inserted, filtered };
}

function keepsScore(decision: Decision): boolean {
  return decision.status === "discovered" || decision.status === "shortlisted";
}

function jobInsert(listing: ParsedListing, hash: string, decision: Decision, now: string) {
  return {
    ...jobFields(listing, hash, decision),
    first_seen_at: now,
    last_seen_at: now,
  };
}

function jobUpdate(listing: ParsedListing, hash: string, decision: Decision, now: string) {
  return {
    ...jobFields(listing, hash, decision),
    last_seen_at: now,
  };
}

function jobFields(listing: ParsedListing, hash: string, decision: Decision) {
  return {
    source: listing.source,
    external_id: listing.externalId,
    canonical_url: listing.canonicalUrl,
    company_name: listing.companyName,
    title: listing.title,
    description_html: listing.descriptionHtml,
    description_text: listing.descriptionText,
    location_text: listing.locationText,
    remote_signal: decision.remoteSignal,
    uk_eligibility: decision.ukEligibility,
    salary_min: listing.salaryMin,
    salary_max: listing.salaryMax,
    salary_currency: listing.salaryCurrency,
    salary_period: listing.salaryPeriod,
    salary_text: listing.salaryText,
    salary_is_advertised: listing.salaryIsAdvertised,
    employment_type: listing.employmentType,
    application_url: listing.applicationUrl,
    application_email: listing.applicationEmail,
    published_at: listing.publishedAt,
    expires_at: listing.expiresAt,
    content_hash: hash,
    status: decision.status,
    filter_reason: decision.filterReason,
    raw: listing.raw,
  };
}

function scoreRow(jobId: string, hash: string, decision: Decision) {
  return {
    job_id: jobId,
    content_hash: hash,
    fit_score: decision.fitScore,
    fit_status: decision.fitStatus,
    fit_reasons: decision.fitReasons,
    oe_score: decision.oeScore,
    oe_status: decision.oeStatus,
    oe_confidence: decision.oeConfidence,
    oe_reasons: decision.oeReasons,
    scorer: "rules_v1",
    model: null,
    created_at: new Date().toISOString(),
  };
}

async function linkDuplicates(supabase: SupabaseClient, hashes: string[]): Promise<string[]> {
  const unique = [...new Set(hashes)];
  if (unique.length === 0) return [];
  const { data, error } = await supabase
    .from("jobs")
    .select("id, content_hash, first_seen_at, status")
    .in("content_hash", unique);
  if (error) throw new Error(error.message);
  const groups = new Map<string, Array<{ id: string; first_seen_at: string; status: string }>>();
  for (const row of data ?? []) {
    const list = groups.get(row.content_hash as string) ?? [];
    list.push({ id: row.id as string, first_seen_at: row.first_seen_at as string, status: row.status as string });
    groups.set(row.content_hash as string, list);
  }
  const marked: string[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.first_seen_at.localeCompare(b.first_seen_at) || a.id.localeCompare(b.id));
    const primary = group[0];
    const rest = group.slice(1).filter((row) => row.status !== "duplicate");
    if (rest.length === 0) continue;
    const ids = rest.map((row) => row.id);
    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        duplicate_of: primary.id,
        status: "duplicate",
        filter_reason: "duplicate: Same advert as an earlier listing.",
      })
      .in("id", ids);
    if (updateError) throw new Error(updateError.message);
    await supabase.from("job_scores").delete().in("job_id", ids);
    marked.push(...ids);
  }
  return marked;
}

async function writeUsage(
  supabase: SupabaseClient,
  day: string,
  totals: { seen: number; rejected: number; scored: number; unknown: number },
): Promise<void> {
  const { data: existing } = await supabase.from("ai_daily").select("*").eq("day", day).maybeSingle();
  const row = {
    day,
    jobs_seen: (existing?.jobs_seen ?? 0) + totals.seen,
    jobs_rejected_without_model: (existing?.jobs_rejected_without_model ?? 0) + totals.rejected,
    jobs_scored_without_model: (existing?.jobs_scored_without_model ?? 0) + totals.scored,
    jobs_unknown_without_model: (existing?.jobs_unknown_without_model ?? 0) + totals.unknown,
    model_calls: existing?.model_calls ?? 0,
    cache_hits: existing?.cache_hits ?? 0,
    input_tokens: existing?.input_tokens ?? 0,
    output_tokens: existing?.output_tokens ?? 0,
    spend_gbp: existing?.spend_gbp ?? 0,
    paused: existing?.paused ?? false,
  };
  const { error } = await supabase.from("ai_daily").upsert(row, { onConflict: "day" });
  if (error) throw new Error(error.message);
  const { error: usageError } = await supabase.from("ai_usage").insert({
    day,
    task: "discover",
    job_id: null,
    model: null,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_gbp: 0,
    cache_hit: false,
    outcome: "no_model",
  });
  if (usageError) throw new Error(usageError.message);
}
