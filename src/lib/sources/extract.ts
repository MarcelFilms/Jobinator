import { htmlToText } from "@/lib/text";

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BLOCKED_HOSTS = [
  "weworkremotely.com",
  "jobicy.com",
  "remotive.com",
  "workingnomads.com",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "example.com",
  "email.com",
  "domain.com",
];
const NON_APPLY_LOCAL =
  /(privacy|accommodation|accessibility|gdpr|\bdpo\b|legal|compliance|noreply|no-reply|donotreply)/i;

export function extractApplicationEmail(htmlOrText: string): string | null {
  const text = htmlToText(htmlOrText);
  const matches = text.match(EMAIL) ?? [];
  for (const candidate of matches) {
    const email = candidate.toLowerCase();
    const [local, host = ""] = email.split("@");
    if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) continue;
    if (host.endsWith(".png") || host.endsWith(".jpg") || host.endsWith(".gif")) continue;
    if (NON_APPLY_LOCAL.test(local)) continue;
    return email;
  }
  return null;
}

const SALARY =
  /(?:£|\$|€)\s?\d{2,3}(?:[,\s]\d{3})+(?:\.\d+)?(?:\s?[kK])?(?:\s?(?:per|a|\/)\s?(?:hour|hr|year|yr|annum|month|week|day))?|(?:£|\$|€)\s?\d{2,4}(?:\.\d+)?\s?[kK]?(?:\s?(?:per|a|\/)\s?(?:hour|hr|year|yr|annum|month|week|day))|(?:\b(?:GBP|USD|EUR|AUD|CAD)\b)\s?\d{2,3}(?:[,\s]\d{3})+(?:\.\d+)?/i;

export function extractSalaryPhrase(text: string): string | null {
  const match = text.match(SALARY);
  if (!match) return null;
  return match[0].replace(/\s+/g, " ").trim();
}

export function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function parseDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
