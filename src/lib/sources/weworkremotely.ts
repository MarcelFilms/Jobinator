import { XMLParser } from "fast-xml-parser";
import { htmlToText } from "@/lib/text";
import { asString, extractApplicationEmail, extractSalaryPhrase, parseDate } from "@/lib/sources/extract";
import { fetchSource, SourceError, type ParsedListing } from "@/lib/sources/types";

export const WEWORKREMOTELY_RSS = "https://weworkremotely.com/categories/remote-customer-support-jobs.rss";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  trimValues: true,
  isArray: (tagName) => tagName === "item",
});

function splitTitle(raw: string): { company: string; title: string } {
  const index = raw.indexOf(":");
  if (index === -1) return { company: "", title: raw.trim() };
  const company = raw.slice(0, index).trim();
  const title = raw.slice(index + 1).trim();
  return { company, title: title || raw.trim() };
}

function textField(item: Record<string, unknown>, key: string): string {
  return asString(item[key]);
}

export function parseWeworkremotelyRss(xml: string): ParsedListing[] {
  if (!xml.includes("<rss")) {
    throw new SourceError("We Work Remotely did not return an RSS document.");
  }
  const document = parser.parse(xml) as { rss?: { channel?: { item?: Record<string, unknown>[] } } };
  const items = document.rss?.channel?.item;
  if (!Array.isArray(items)) {
    throw new SourceError("We Work Remotely RSS had no items.");
  }
  const listings: ParsedListing[] = [];
  for (const item of items) {
    const link = textField(item, "link");
    const guid = textField(item, "guid") || link;
    const rawTitle = textField(item, "title");
    if (!link || !rawTitle) continue;
    const { company, title } = splitTitle(rawTitle);
    const descriptionHtml = textField(item, "description");
    const descriptionText = htmlToText(descriptionHtml);
    const region = textField(item, "region");
    const country = textField(item, "country");
    const location = [region, country].filter(Boolean).join(" · ");
    const phrase = extractSalaryPhrase(descriptionText);
    listings.push({
      source: "weworkremotely",
      externalId: guid,
      canonicalUrl: link,
      companyName: company,
      title,
      descriptionHtml,
      descriptionText,
      locationText: location,
      countryText: country || null,
      jobLevel: null,
      remoteSignalHint: null,
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      salaryText: phrase,
      salaryIsAdvertised: Boolean(phrase),
      employmentType: textField(item, "type") || null,
      applicationUrl: link,
      applicationEmail: extractApplicationEmail(descriptionHtml),
      publishedAt: parseDate(textField(item, "pubDate")),
      expiresAt: parseDate(textField(item, "expires_at")),
      raw: {
        title: rawTitle,
        link,
        guid,
        region,
        country,
        state: textField(item, "state"),
        category: textField(item, "category"),
        type: textField(item, "type"),
        skills: textField(item, "skills"),
        pubDate: textField(item, "pubDate"),
        expires_at: textField(item, "expires_at"),
      },
    });
  }
  return listings;
}

export async function fetchWeworkremotely(): Promise<{ status: number; listings: ParsedListing[] }> {
  const response = await fetchSource(WEWORKREMOTELY_RSS);
  if (response.status === 429) {
    throw new SourceError("We Work Remotely rate limited the feed.", response.status, response.retryAfter);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SourceError(`We Work Remotely returned HTTP ${response.status}.`, response.status);
  }
  return { status: response.status, listings: parseWeworkremotelyRss(response.body) };
}
