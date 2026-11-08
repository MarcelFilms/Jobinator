import { asString } from "@/lib/sources/extract";
import { isSupportCategory, isSupportTitle, listingFromText } from "@/lib/sources/support";
import { fetchSource, SourceError, type ParsedListing } from "@/lib/sources/types";

export const WORKING_NOMADS_URL = "https://www.workingnomads.com/api/exposed_jobs/";

export function parseWorkingNomads(payload: unknown): ParsedListing[] {
  if (!Array.isArray(payload)) {
    throw new SourceError("Working Nomads did not return a job array.");
  }
  const listings: ParsedListing[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const url = asString(row.url);
    const title = asString(row.title);
    const category = asString(row.category_name);
    if (!url || !title) continue;
    if (!isSupportTitle(title) && !isSupportCategory(category)) continue;
    listings.push(
      listingFromText({
        source: "workingnomads",
        externalId: url,
        canonicalUrl: url,
        companyName: asString(row.company_name),
        title,
        descriptionHtml: asString(row.description),
        locationText: asString(row.location),
        publishedAt: asString(row.pub_date) || null,
        raw: row,
      }),
    );
  }
  return listings;
}

export async function fetchWorkingNomads(): Promise<{ status: number; listings: ParsedListing[] }> {
  const response = await fetchSource(WORKING_NOMADS_URL);
  if (response.status === 429) {
    throw new SourceError("Working Nomads rate limited the feed.", response.status, response.retryAfter);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SourceError(`Working Nomads returned HTTP ${response.status}.`, response.status);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    throw new SourceError("Working Nomads returned invalid JSON.", response.status);
  }
  return { status: response.status, listings: parseWorkingNomads(payload) };
}
