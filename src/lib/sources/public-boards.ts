import { readPublicPage } from "@/lib/sources/html-page";
import { isSupportTitle, listingFromText } from "@/lib/sources/support";
import type { ParsedListing, SourceId } from "@/lib/sources/types";

type Board = {
  source: SourceId;
  url: string;
};

const BOARDS: Board[] = [
  { source: "indeed", url: "https://uk.indeed.com/jobs?q=customer+support&l=United+Kingdom&fromage=1" },
  { source: "cvlibrary", url: "https://www.cv-library.co.uk/search-jobs?q=customer+support&geo=uk" },
  { source: "totaljobs", url: "https://www.totaljobs.com/jobs/customer-support" },
  { source: "adzuna", url: "https://www.adzuna.co.uk/search?q=customer+support&w=remote" },
  { source: "glassdoor", url: "https://www.glassdoor.co.uk/Job/customer-support-jobs-SRCH_KO0,16.htm" },
];

export function publicBoardUrl(source: SourceId): string | null {
  return BOARDS.find((board) => board.source === source)?.url ?? null;
}

/** Best-effort card links from a public HTML page. Used only after the page is readable. */
export function parsePublicJobLinks(source: SourceId, html: string, pageUrl: string): ParsedListing[] {
  const listings: ParsedListing[] = [];
  const seen = new Set<string>();
  const origin = new URL(pageUrl).origin;
  for (const match of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const title = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!title || title.length > 140 || !isSupportTitle(title)) continue;
    if (!/job/i.test(href)) continue;
    const url = href.startsWith("http") ? href.split("?")[0] : new URL(href, origin).toString().split("?")[0];
    if (seen.has(url)) continue;
    seen.add(url);
    listings.push(
      listingFromText({
        source,
        externalId: url,
        canonicalUrl: url,
        companyName: "",
        title,
        descriptionHtml: title,
        locationText: "United Kingdom",
        countryText: "United Kingdom",
        raw: { url, title },
      }),
    );
    if (listings.length >= 20) break;
  }
  return listings;
}

export function fetchPublicBoard(source: SourceId): () => Promise<{ status: number; listings: ParsedListing[] }> {
  const board = BOARDS.find((item) => item.source === source);
  if (!board) throw new Error(`No public page for ${source}`);
  return async () => {
    const page = await readPublicPage(board.url, 12_000);
    return { status: page.status, listings: parsePublicJobLinks(board.source, page.body, board.url) };
  };
}
