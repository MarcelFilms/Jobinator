import { htmlToText } from "@/lib/text";
import { extractApplicationEmail, extractSalaryPhrase, parseDate } from "@/lib/sources/extract";
import type { ParsedListing, SourceId } from "@/lib/sources/types";

const SUPPORT_TITLE =
  /\b(customer support|customer service|customer success|customer care|help ?desk|service desk|technical support|product support|support specialist|support engineer|support agent|client support|member support|customer experience)\b/i;

const SUPPORT_CATEGORY = /\b(customer support|customer service|customer success|customer care|help ?desk)\b/i;

export function isSupportTitle(title: string): boolean {
  return SUPPORT_TITLE.test(title);
}

export function isSupportCategory(category: string): boolean {
  return SUPPORT_CATEGORY.test(category);
}

/** Lower is a better use of a detail request: UK first, then remote or worldwide. */
export function locationRank(location: string): number {
  const text = location.toLowerCase();
  if (/\b(united kingdom|\buk\b|london|england|scotland|wales|manchester|edinburgh|glasgow|bristol)\b/.test(text)) return 0;
  if (/\b(worldwide|anywhere|global|remote)\b/.test(text)) return 1;
  return 2;
}

export function listingFromText(input: {
  source: SourceId;
  externalId: string;
  canonicalUrl: string;
  companyName: string;
  title: string;
  descriptionHtml: string;
  locationText: string;
  countryText?: string | null;
  employmentType?: string | null;
  applicationUrl?: string | null;
  publishedAt?: string | null;
  raw: Record<string, unknown>;
}): ParsedListing {
  const descriptionText = htmlToText(input.descriptionHtml);
  const phrase = extractSalaryPhrase(descriptionText);
  return {
    source: input.source,
    externalId: input.externalId,
    canonicalUrl: input.canonicalUrl,
    companyName: input.companyName,
    title: input.title,
    descriptionHtml: input.descriptionHtml,
    descriptionText,
    locationText: input.locationText,
    countryText: input.countryText ?? null,
    jobLevel: null,
    remoteSignalHint: null,
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
    salaryPeriod: null,
    salaryText: phrase,
    salaryIsAdvertised: Boolean(phrase),
    employmentType: input.employmentType ?? null,
    applicationUrl: input.applicationUrl || input.canonicalUrl,
    applicationEmail: extractApplicationEmail(`${input.descriptionHtml}\n${descriptionText}`),
    publishedAt: input.publishedAt ? parseDate(input.publishedAt) : null,
    expiresAt: null,
    raw: input.raw,
  };
}
