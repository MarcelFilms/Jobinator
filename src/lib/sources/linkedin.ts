import { extractApplicationEmail } from "@/lib/sources/extract";
import { decodeEntities, firstCompanySite, pause, readPublicPage } from "@/lib/sources/html-page";
import { isSupportTitle, listingFromText } from "@/lib/sources/support";
import { fetchSource, SourceError, type ParsedListing } from "@/lib/sources/types";

export const LINKEDIN_SEARCH =
  "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=customer%20support&location=United%20Kingdom&start=0";

export type LinkedInCard = {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
};

export function parseLinkedInCards(html: string): LinkedInCard[] {
  const cards: LinkedInCard[] = [];
  const seen = new Set<string>();
  for (const chunk of html.split('data-entity-urn="urn:li:jobPosting:').slice(1)) {
    const id = chunk.match(/^(\d+)/)?.[1] ?? "";
    if (!id || seen.has(id)) continue;
    const title = decodeEntities(chunk.match(/base-search-card__title[^>]*>\s*([^<]+)/)?.[1] ?? "").trim();
    const company = decodeEntities(
      chunk.match(/base-search-card__subtitle[\s\S]*?<a[^>]*>\s*([^<]+)/)?.[1] ??
        chunk.match(/base-search-card__subtitle[^>]*>\s*([^<]+)/)?.[1] ??
        "",
    ).trim();
    const location = decodeEntities(chunk.match(/job-search-card__location[^>]*>\s*([^<]+)/)?.[1] ?? "").trim();
    const href = decodeEntities(chunk.match(/href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"]+)"/)?.[1] ?? "");
    if (!title) continue;
    seen.add(id);
    cards.push({
      id,
      title,
      company,
      location,
      url: href ? href.split("?")[0] : `https://www.linkedin.com/jobs/view/${id}`,
    });
  }
  return cards;
}

export function parseLinkedInDetail(html: string, card: LinkedInCard): ParsedListing | null {
  if (!isSupportTitle(card.title)) return null;
  const markup = html.match(/show-more-less-html__markup[^>]*>([\s\S]{80,}?)<\/div>\s*(?:<button|<\/div>)/);
  if (!markup) return null;
  return listingFromText({
    source: "linkedin",
    externalId: card.id,
    canonicalUrl: card.url,
    companyName: card.company,
    title: card.title,
    descriptionHtml: markup[1],
    locationText: card.location || "United Kingdom",
    countryText: "United Kingdom",
    raw: { id: card.id, title: card.title },
  });
}

export async function fetchLinkedIn(): Promise<{ status: number; listings: ParsedListing[] }> {
  const search = await readPublicPage(LINKEDIN_SEARCH, 15_000);
  const cards = parseLinkedInCards(search.body).filter((card) => isSupportTitle(card.title)).slice(0, 8);
  if (cards.length === 0 && /authwall|sign in to linkedin/i.test(search.body.slice(0, 3000))) {
    throw new SourceError("LinkedIn guest search is a login wall. Stopped.", search.status);
  }
  const listings: ParsedListing[] = [];
  for (const card of cards) {
    await pause(900);
    const detail = await readPublicPage(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${card.id}`, 12_000);
    const listing = parseLinkedInDetail(detail.body, card);
    if (!listing) continue;
    if (!listing.applicationEmail) {
      const site = firstCompanySite(listing.descriptionHtml);
      if (site) {
        await pause(800);
        try {
          const page = await fetchSource(site, 8_000);
          if (page.status >= 200 && page.status < 300) {
            listing.applicationEmail = extractApplicationEmail(page.body);
          }
        } catch {
          listing.applicationEmail = null;
        }
      }
    }
    listings.push(listing);
  }
  return { status: search.status, listings };
}
