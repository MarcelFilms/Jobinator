import { asString } from "@/lib/sources/extract";
import { LEVER_SITES } from "@/lib/sources/boards";
import { isSupportTitle, listingFromText } from "@/lib/sources/support";
import { fetchSource, SourceError, type ParsedListing } from "@/lib/sources/types";

function publishedFromLever(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    const ms = n < 10_000_000_000 ? n * 1000 : n;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return text;
}

export function parseLeverPostings(site: string, payload: unknown): ParsedListing[] {
  if (!Array.isArray(payload)) {
    throw new SourceError("Lever did not return a postings array.");
  }
  const listings: ParsedListing[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const title = asString(row.text);
    const id = asString(row.id);
    const url = asString(row.hostedUrl);
    if (!title || !id || !url || !isSupportTitle(title)) continue;
    const categories = row.categories && typeof row.categories === "object" ? (row.categories as Record<string, unknown>) : {};
    const description = asString(row.description) || asString(row.descriptionPlain);
    listings.push(
      listingFromText({
        source: "lever",
        externalId: `${site}:${id}`,
        canonicalUrl: url,
        companyName: site,
        title,
        descriptionHtml: description,
        locationText: asString(categories.location),
        countryText: asString(row.country) || null,
        employmentType: asString(categories.commitment) || null,
        applicationUrl: asString(row.applyUrl) || url,
        publishedAt: publishedFromLever(row.createdAt),
        raw: { site, id, title, workplaceType: row.workplaceType ?? null },
      }),
    );
  }
  return listings;
}

export async function fetchLever(): Promise<{ status: number; listings: ParsedListing[] }> {
  const listings: ParsedListing[] = [];
  let boardsOk = 0;
  for (const site of LEVER_SITES) {
    const response = await fetchSource(`https://api.lever.co/v0/postings/${site}?mode=json`);
    if (response.status === 429) {
      throw new SourceError("Lever rate limited a board.", response.status, response.retryAfter);
    }
    if (response.status === 404) continue;
    if (response.status < 200 || response.status >= 300) continue;
    boardsOk += 1;
    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      continue;
    }
    listings.push(...parseLeverPostings(site, payload));
  }
  if (boardsOk === 0) throw new SourceError("Lever returned no board.");
  return { status: 200, listings };
}
