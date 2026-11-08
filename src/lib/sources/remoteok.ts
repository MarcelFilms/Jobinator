import { asString } from "@/lib/sources/extract";
import { readPublicPage } from "@/lib/sources/html-page";
import { isSupportTitle, listingFromText } from "@/lib/sources/support";
import type { ParsedListing } from "@/lib/sources/types";

export const REMOTEOK_URL = "https://remoteok.com/api";

export function parseRemoteOk(payload: unknown): ParsedListing[] {
  if (!Array.isArray(payload)) return [];
  const listings: ParsedListing[] = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const title = asString(row.position);
    const id = asString(row.id);
    const url = asString(row.url) || asString(row.apply_url);
    if (!title || !id || !url || !isSupportTitle(title)) continue;
    listings.push(
      listingFromText({
        source: "remoteok",
        externalId: id,
        canonicalUrl: url.startsWith("http") ? url : `https://remoteok.com${url}`,
        companyName: asString(row.company),
        title,
        descriptionHtml: asString(row.description),
        locationText: asString(row.location) || "Worldwide",
        publishedAt: asString(row.date) || null,
        raw: { id, company: asString(row.company) },
      }),
    );
  }
  return listings;
}

export async function fetchRemoteOk(): Promise<{ status: number; listings: ParsedListing[] }> {
  const page = await readPublicPage(REMOTEOK_URL, 20_000);
  return { status: page.status, listings: parseRemoteOk(JSON.parse(page.body)) };
}
