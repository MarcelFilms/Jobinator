import { extractApplicationEmail } from "@/lib/sources/extract";
import { decodeEntities, firstCompanySite, pause, readPublicPage } from "@/lib/sources/html-page";
import { isSupportTitle, listingFromText } from "@/lib/sources/support";
import { fetchSource, type ParsedListing } from "@/lib/sources/types";

const QUERIES = [
  "customer support",
  "customer service home based",
  "helpdesk",
  "customer success",
  "live chat support",
  "onboarding specialist",
];

export function reedRssUrl(keywords: string): string {
  return `https://www.reed.co.uk/jobs/rss?keywords=${encodeURIComponent(keywords)}`;
}

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decodeEntities(match[1]).trim() : "";
}

export function reedCompany(description: string): string {
  const text = description.replace(/\s+/g, " ").trim();
  const match = text.match(/\b([A-Z][\w&.'’-]{1,40}(?: [\w&.'’-]{1,40}){0,3}) (?:are|is) currently\b/);
  return match?.[1]?.trim() ?? "";
}

export function parseReedRss(xml: string): ParsedListing[] {
  const listings: ParsedListing[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const id = tag(block, "guid");
    const title = tag(block, "title");
    const link = tag(block, "link").replace(/^http:\/\//i, "https://");
    const description = tag(block, "description");
    if (!id || !title || !link || !isSupportTitle(title)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    listings.push(
      listingFromText({
        source: "reed",
        externalId: id,
        canonicalUrl: link,
        companyName: reedCompany(description),
        title,
        descriptionHtml: description,
        locationText: "United Kingdom",
        countryText: "United Kingdom",
        publishedAt: tag(block, "a10:updated") || null,
        raw: { id, title },
      }),
    );
  }
  return listings;
}

async function addMissingEmails(listings: ParsedListing[]): Promise<void> {
  let looked = 0;
  for (const listing of listings) {
    if (listing.applicationEmail || looked >= 3) continue;
    const site = firstCompanySite(listing.descriptionHtml);
    if (!site) continue;
    looked += 1;
    await pause(800);
    try {
      const page = await fetchSource(site, 8_000);
      if (page.status < 200 || page.status >= 300) continue;
      const email = extractApplicationEmail(page.body);
      if (email) listing.applicationEmail = email;
    } catch {
      continue;
    }
  }
}

export async function fetchReed(): Promise<{ status: number; listings: ParsedListing[] }> {
  const byId = new Map<string, ParsedListing>();
  let status = 200;
  for (const keywords of QUERIES) {
    await pause(800);
    const page = await readPublicPage(reedRssUrl(keywords), 15_000);
    status = page.status;
    for (const listing of parseReedRss(page.body)) byId.set(listing.externalId, listing);
  }
  const listings = [...byId.values()];
  await addMissingEmails(listings);
  return { status, listings };
}

export function reedKeywords(): string[] {
  return [...QUERIES];
}
