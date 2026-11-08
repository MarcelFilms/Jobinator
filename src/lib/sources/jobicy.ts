import { htmlToText } from "@/lib/text";
import { asNumber, asString, extractApplicationEmail, extractSalaryPhrase, parseDate } from "@/lib/sources/extract";
import { fetchSource, SourceError, type ParsedListing } from "@/lib/sources/types";

export const JOBICY_JOBS = "https://jobicy.com/api/jobs";
export const JOBICY_STATUS = "https://jobicy.com/api/jobs/status";

export type JobicyPage = {
  status: number;
  listings: ParsedListing[];
  nextCursor: string | null;
  hasMore: boolean;
};

type JobicyJob = Record<string, unknown>;

function listText(value: unknown): string | null {
  if (Array.isArray(value)) {
    const joined = value.map((item) => asString(item)).filter(Boolean).join(", ");
    return joined || null;
  }
  const text = asString(value);
  return text || null;
}

export function parseJobicyJobs(payload: unknown): { listings: ParsedListing[]; nextCursor: string | null; hasMore: boolean } {
  if (!payload || typeof payload !== "object") {
    throw new SourceError("Jobicy did not return JSON.");
  }
  const body = payload as Record<string, unknown>;
  if (!Array.isArray(body.jobs)) {
    throw new SourceError("Jobicy response had no jobs array.");
  }
  const listings: ParsedListing[] = [];
  for (const entry of body.jobs as JobicyJob[]) {
    const url = asString(entry.url);
    const id = asString(entry.id);
    const title = asString(entry.jobTitle);
    if (!url || !id || !title) continue;
    const descriptionHtml = asString(entry.jobDescription);
    const descriptionText = htmlToText(descriptionHtml || asString(entry.jobExcerpt));
    const salaryMin = asNumber(entry.salaryMin);
    const salaryMax = asNumber(entry.salaryMax);
    const salaryCurrency = asString(entry.salaryCurrency) || null;
    const salaryPeriod = asString(entry.salaryPeriod) || null;
    const hasStructured = salaryMin !== null || salaryMax !== null;
    const phrase = hasStructured ? null : extractSalaryPhrase(descriptionText);
    listings.push({
      source: "jobicy",
      externalId: id,
      canonicalUrl: url,
      companyName: asString(entry.companyName),
      title,
      descriptionHtml,
      descriptionText,
      locationText: asString(entry.jobGeo),
      countryText: null,
      jobLevel: asString(entry.jobLevel) || null,
      remoteSignalHint: null,
      salaryMin,
      salaryMax,
      salaryCurrency,
      salaryPeriod,
      salaryText: phrase,
      salaryIsAdvertised: hasStructured || Boolean(phrase),
      employmentType: listText(entry.jobType),
      applicationUrl: url,
      applicationEmail: extractApplicationEmail(`${descriptionHtml}\n${descriptionText}`),
      publishedAt: parseDate(asString(entry.pubDate)),
      expiresAt: null,
      raw: entry,
    });
  }
  const nextCursor = asString(body.nextCursor) || null;
  return { listings, nextCursor, hasMore: body.hasMore === true && Boolean(nextCursor) };
}

export function jobicyJobsUrl(cursor?: string | null, industry = "supporting"): string {
  const params = new URLSearchParams({
    geo: "uk",
    industry,
    count: "100",
  });
  if (cursor) params.set("cursor", cursor);
  return `${JOBICY_JOBS}?${params.toString()}`;
}

async function fetchJobicyPage(url: string): Promise<JobicyPage> {
  const response = await fetchSource(url);
  if (response.status === 429) {
    throw new SourceError("Jobicy rate limited the jobs feed.", response.status, response.retryAfter);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SourceError(`Jobicy returned HTTP ${response.status}.`, response.status);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    throw new SourceError("Jobicy returned invalid JSON.", response.status);
  }
  const parsed = parseJobicyJobs(payload);
  return { status: response.status, ...parsed };
}

export async function fetchJobicy(cursor?: string | null): Promise<JobicyPage> {
  const primary = await fetchJobicyPage(jobicyJobsUrl(cursor, "supporting"));
  let technical: JobicyPage | null = null;
  try {
    technical = await fetchJobicyPage(jobicyJobsUrl(null, "technical-support"));
  } catch {
    technical = null;
  }
  const seen = new Set(primary.listings.map((listing) => listing.externalId));
  const listings = [...primary.listings];
  for (const listing of technical?.listings ?? []) {
    if (seen.has(listing.externalId)) continue;
    seen.add(listing.externalId);
    listings.push(listing);
  }
  return { status: primary.status, listings, nextCursor: primary.nextCursor, hasMore: primary.hasMore };
}

export async function fetchJobicyStatuses(ids: string[]): Promise<Map<string, "active" | "closed" | "unknown">> {
  const result = new Map<string, "active" | "closed" | "unknown">();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let index = 0; index < unique.length; index += 40) {
    const batch = unique.slice(index, index + 40);
    const response = await fetchSource(`${JOBICY_STATUS}?ids=${batch.map(encodeURIComponent).join(",")}`);
    if (response.status === 429) {
      throw new SourceError("Jobicy rate limited the status feed.", response.status, response.retryAfter);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new SourceError(`Jobicy status returned HTTP ${response.status}.`, response.status);
    }
    const payload = JSON.parse(response.body) as { jobs?: Array<{ id?: unknown; status?: unknown }> };
    for (const job of payload.jobs ?? []) {
      const id = asString(job.id);
      const status = asString(job.status).toLowerCase();
      if (!id) continue;
      if (status === "active" || status === "closed" || status === "unknown") result.set(id, status);
      else result.set(id, "unknown");
    }
  }
  return result;
}
