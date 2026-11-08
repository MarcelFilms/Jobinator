import { asString } from "@/lib/sources/extract";
import { ASHBY_BOARDS } from "@/lib/sources/boards";
import { isSupportTitle, listingFromText } from "@/lib/sources/support";
import { fetchSource, SourceError, type ParsedListing } from "@/lib/sources/types";

export function parseAshbyBoard(board: string, payload: unknown): ParsedListing[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { jobs?: unknown }).jobs)) {
    throw new SourceError("Ashby did not return a jobs array.");
  }
  const listings: ParsedListing[] = [];
  for (const entry of (payload as { jobs: unknown[] }).jobs) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const title = asString(row.title);
    const id = asString(row.id);
    const url = asString(row.jobUrl);
    if (!title || !id || !url || !isSupportTitle(title)) continue;
    const description = asString(row.descriptionHtml) || asString(row.descriptionPlain);
    listings.push(
      listingFromText({
        source: "ashby",
        externalId: `${board}:${id}`,
        canonicalUrl: url,
        companyName: board,
        title,
        descriptionHtml: description,
        locationText: asString(row.location),
        employmentType: asString(row.employmentType) || null,
        applicationUrl: asString(row.applyUrl) || url,
        publishedAt: asString(row.publishedAt) || null,
        raw: { board, id, title, isRemote: row.isRemote ?? null, workplaceType: row.workplaceType ?? null },
      }),
    );
  }
  return listings;
}

export async function fetchAshby(): Promise<{ status: number; listings: ParsedListing[] }> {
  const listings: ParsedListing[] = [];
  let boardsOk = 0;
  for (const board of ASHBY_BOARDS) {
    const response = await fetchSource(`https://api.ashbyhq.com/posting-api/job-board/${board}`);
    if (response.status === 429) {
      throw new SourceError("Ashby rate limited a board.", response.status, response.retryAfter);
    }
    if (response.status === 404) continue;
    if (response.status < 200 || response.status >= 300) continue;
    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      continue;
    }
    boardsOk += 1;
    listings.push(...parseAshbyBoard(board, payload));
  }
  if (boardsOk === 0) throw new SourceError("Ashby returned no board.");
  return { status: 200, listings };
}
