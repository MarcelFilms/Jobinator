import { asString } from "@/lib/sources/extract";
import { isSupportCategory, listingFromText } from "@/lib/sources/support";
import { fetchSource, SourceError, type ParsedListing } from "@/lib/sources/types";

export const REMOTIVE_URL = "https://remotive.com/api/remote-jobs";

/**
 * Remotive's category query is ignored (checked 8 Nov 2026: customer-service and
 * customer-support returned the same mixed list). Keep rows whose own category
 * field is customer service or customer support, and keep the Remotive URL.
 */
export function parseRemotive(payload: unknown): ParsedListing[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { jobs?: unknown }).jobs)) {
    throw new SourceError("Remotive did not return a jobs array.");
  }
  const listings: ParsedListing[] = [];
  for (const entry of (payload as { jobs: unknown[] }).jobs) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const category = asString(row.category);
    if (!isSupportCategory(category)) continue;
    const url = asString(row.url);
    const title = asString(row.title);
    const id = asString(row.id);
    if (!url || !title || !id) continue;
    listings.push(
      listingFromText({
        source: "remotive",
        externalId: id,
        canonicalUrl: url,
        companyName: asString(row.company_name),
        title,
        descriptionHtml: asString(row.description),
        locationText: asString(row.candidate_required_location),
        employmentType: asString(row.job_type) || null,
        publishedAt: asString(row.publication_date) || null,
        raw: { ...row, attribution: "Remotive" },
      }),
    );
  }
  return listings;
}

export async function fetchRemotive(): Promise<{ status: number; listings: ParsedListing[] }> {
  const response = await fetchSource(REMOTIVE_URL);
  if (response.status === 429) {
    throw new SourceError("Remotive rate limited the feed.", response.status, response.retryAfter);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SourceError(`Remotive returned HTTP ${response.status}.`, response.status);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    throw new SourceError("Remotive returned invalid JSON.", response.status);
  }
  return { status: response.status, listings: parseRemotive(payload) };
}
