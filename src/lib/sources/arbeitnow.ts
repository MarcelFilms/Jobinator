import { asString } from "@/lib/sources/extract";
import { readPublicPage } from "@/lib/sources/html-page";
import { isSupportTitle, listingFromText } from "@/lib/sources/support";
import type { ParsedListing } from "@/lib/sources/types";

export const ARBEITNOW_URL = "https://www.arbeitnow.com/api/job-board-api";

export function parseArbeitnow(payload: unknown): ParsedListing[] {
  const jobs = payload && typeof payload === "object" ? (payload as { data?: unknown }).data : null;
  if (!Array.isArray(jobs)) return [];
  const listings: ParsedListing[] = [];
  for (const entry of jobs) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const title = asString(row.title);
    const slug = asString(row.slug);
    const url = asString(row.url) || (slug ? `https://www.arbeitnow.com/view/${slug}` : "");
    if (!title || !url || !isSupportTitle(title)) continue;
    const remote = row.remote === true;
    listings.push(
      listingFromText({
        source: "arbeitnow",
        externalId: slug || url,
        canonicalUrl: url,
        companyName: asString(row.company_name),
        title,
        descriptionHtml: asString(row.description),
        locationText: remote ? `${asString(row.location) || "Remote"} remote` : asString(row.location),
        publishedAt: asString(row.created_at) || null,
        raw: { slug, remote },
      }),
    );
  }
  return listings;
}

export async function fetchArbeitnow(): Promise<{ status: number; listings: ParsedListing[] }> {
  const page = await readPublicPage(ARBEITNOW_URL, 20_000);
  return { status: page.status, listings: parseArbeitnow(JSON.parse(page.body)) };
}
