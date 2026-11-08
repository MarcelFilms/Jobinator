import { asString } from "@/lib/sources/extract";
import { GREENHOUSE_BOARDS, GREENHOUSE_DETAILS_PER_BOARD, GREENHOUSE_DETAILS_PER_RUN } from "@/lib/sources/boards";
import { isSupportTitle, listingFromText, locationRank } from "@/lib/sources/support";
import { fetchSource, SourceError, type ParsedListing } from "@/lib/sources/types";

type GreenhouseListJob = {
  id?: unknown;
  title?: unknown;
  location?: { name?: unknown };
  absolute_url?: unknown;
};

export function parseGreenhouseJob(board: string, payload: unknown): ParsedListing | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const id = asString(row.id);
  const title = asString(row.title);
  const url = asString(row.absolute_url);
  if (!id || !title || !url || !isSupportTitle(title)) return null;
  const location = row.location && typeof row.location === "object" ? asString((row.location as { name?: unknown }).name) : "";
  return listingFromText({
    source: "greenhouse",
    externalId: `${board}:${id}`,
    canonicalUrl: url,
    companyName: asString(row.company_name) || board,
    title,
    descriptionHtml: asString(row.content),
    locationText: location,
    publishedAt: asString(row.first_published) || asString(row.updated_at) || null,
    raw: { board, id, title, location },
  });
}

async function readJson(url: string): Promise<{ status: number; payload: unknown } | null> {
  const response = await fetchSource(url);
  if (response.status === 404) return null;
  if (response.status === 429) {
    throw new SourceError("Greenhouse rate limited a board.", response.status, response.retryAfter);
  }
  if (response.status < 200 || response.status >= 300) return null;
  try {
    return { status: response.status, payload: JSON.parse(response.body) };
  } catch {
    return null;
  }
}

export async function fetchGreenhouse(): Promise<{ status: number; listings: ParsedListing[] }> {
  const chosen: Array<{ board: string; id: string }> = [];
  let boardsOk = 0;
  for (const board of GREENHOUSE_BOARDS) {
    const list = await readJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs`);
    if (!list || !list.payload || typeof list.payload !== "object") continue;
    boardsOk += 1;
    const jobs = ((list.payload as { jobs?: GreenhouseListJob[] }).jobs ?? []).filter((job) => isSupportTitle(asString(job.title)));
    jobs.sort((a, b) => locationRank(asString(a.location?.name)) - locationRank(asString(b.location?.name)));
    for (const job of jobs.slice(0, GREENHOUSE_DETAILS_PER_BOARD)) {
      const id = asString(job.id);
      if (id) chosen.push({ board, id });
    }
  }
  if (boardsOk === 0) {
    throw new SourceError("Greenhouse returned no board.");
  }
  const limited = chosen.slice(0, GREENHOUSE_DETAILS_PER_RUN);
  const listings: ParsedListing[] = [];
  for (let index = 0; index < limited.length; index += 4) {
    const batch = limited.slice(index, index + 4);
    const details = await Promise.all(
      batch.map((item) => readJson(`https://boards-api.greenhouse.io/v1/boards/${item.board}/jobs/${item.id}`)),
    );
    for (let inner = 0; inner < batch.length; inner += 1) {
      const detail = details[inner];
      if (!detail) continue;
      const listing = parseGreenhouseJob(batch[inner].board, detail.payload);
      if (listing) listings.push(listing);
    }
  }
  return { status: 200, listings };
}
