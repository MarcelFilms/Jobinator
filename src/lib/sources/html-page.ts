import { fetchSource, SourceError } from "@/lib/sources/types";

export function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** A public page we will not try to get past. Login walls and CAPTCHAs stop the read. */
export function blockReason(status: number, body: string): string | null {
  if (status === 401 || status === 403) return `HTTP ${status}`;
  if (status === 429) return "HTTP 429";
  const head = body.slice(0, 5000).toLowerCase();
  if (head.includes("cf-challenge") || head.includes("captcha") || head.includes("just a moment")) return "CAPTCHA";
  if (body.length < 2500 && (head.includes("authwall") || head.includes("sign in to continue"))) return "login wall";
  return null;
}

export async function readPublicPage(url: string, timeoutMs = 12_000): Promise<{ status: number; body: string }> {
  const response = await fetchSource(url, timeoutMs);
  const blocked = blockReason(response.status, response.body);
  if (blocked) {
    throw new SourceError(`Stopped: ${blocked}. No login and no CAPTCHA attempt.`, response.status);
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SourceError(`HTTP ${response.status}.`, response.status);
  }
  return { status: response.status, body: response.body };
}

export function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BOARD_HOST =
  /(linkedin\.com|reed\.co\.uk|indeed\.|glassdoor|adzuna|totaljobs|cv-library|facebook\.com|twitter\.com|instagram\.com|google\.|w3\.org|schema\.org)/i;

export function firstCompanySite(htmlOrText: string): string | null {
  const links = htmlOrText.match(/https?:\/\/[^"'\s<>]+/gi) ?? [];
  for (const link of links) {
    const cleaned = link.replace(/[),.;]+$/, "");
    if (BOARD_HOST.test(cleaned)) continue;
    return cleaned;
  }
  return null;
}
