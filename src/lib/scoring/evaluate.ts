import type { ScoringProfile } from "@/lib/profile-defaults";
import { firstMatch, quoteSpan } from "@/lib/text";

export type SourceId =
  | "weworkremotely"
  | "jobicy"
  | "reed"
  | "workingnomads"
  | "remotive"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "indeed"
  | "cvlibrary"
  | "totaljobs"
  | "linkedin"
  | "adzuna"
  | "glassdoor"
  | "arbeitnow"
  | "remoteok";
export type UkEligibility = "explicit_uk" | "worldwide" | "rejected" | "unknown";
export type RemoteSignal = "board_remote" | "explicit_remote" | "onsite" | "unknown";
export type JobStatus = "discovered" | "filtered_out" | "shortlisted" | "expired" | "duplicate";

export type FitReason = { rule: string; points: number; quote: string };
export type OeReason = { signal: string; direction: "async" | "sync"; quote: string };

export type Decision = {
  ukEligibility: UkEligibility;
  remoteSignal: RemoteSignal;
  status: JobStatus;
  filterReason: string | null;
  fitScore: number | null;
  fitStatus: "scored" | "unknown";
  fitReasons: FitReason[];
  oeScore: number | null;
  oeStatus: "scored" | "unknown";
  oeConfidence: "low" | "normal" | null;
  oeReasons: OeReason[];
};

export type EvaluateInput = {
  source: SourceId;
  title: string;
  descriptionText: string;
  locationText: string;
  countryText?: string | null;
  jobLevel?: string | null;
  expiresAt?: string | null;
  jobicyStatus?: "active" | "closed" | "unknown" | null;
  isDuplicate?: boolean;
  profile: ScoringProfile;
  now?: Date;
};

const UK_TOKENS =
  /\b(uk|u\.k|united kingdom|great britain|britain|england|scotland|wales|northern ireland)\b/i;

const UK_CITIES = [
  "london",
  "manchester",
  "birmingham",
  "leeds",
  "glasgow",
  "edinburgh",
  "cardiff",
  "belfast",
  "bristol",
  "liverpool",
  "sheffield",
  "newcastle",
  "nottingham",
  "leicester",
  "southampton",
  "brighton",
  "cambridge",
  "oxford",
  "coventry",
  "aberdeen",
  "dundee",
  "swansea",
  "plymouth",
  "milton keynes",
  "northampton",
];

const US_STATES = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "district of columbia",
]);

const OTHER_PLACES =
  /\b(united states|u\.s\.a|usa|canada|mexico|brazil|argentina|germany|france|spain|italy|portugal|poland|netherlands|ireland|australia|india|singapore|philippines|south africa|nigeria|kenya|egypt|uae|dubai|latam|latin america|europe|emea|africa|asia|new zealand|sweden|norway|denmark|finland|belgium|austria|switzerland|romania|hungary|greece|turkey|japan|china|hong kong|taiwan|south korea|israel|colombia|chile|peru|north america)\b/i;

const LANGUAGES = [
  "spanish",
  "french",
  "german",
  "italian",
  "portuguese",
  "dutch",
  "polish",
  "romanian",
  "swedish",
  "danish",
  "norwegian",
  "finnish",
  "greek",
  "czech",
  "hungarian",
  "turkish",
  "arabic",
  "mandarin",
  "chinese",
  "japanese",
  "korean",
  "hindi",
  "russian",
  "ukrainian",
  "hebrew",
  "welsh",
  "irish",
  "catalan",
];

const SUPPORT_TITLE =
  /\b(customer support|customer service|customer care|help ?desk|service desk|product support|technical support|customer success|chat support|live chat|community moderator|content moderator|trust and safety|customer onboarding|client onboarding|onboarding specialist|onboarding associate)\b/i;

const EMAIL_DUTY =
  /\b(via emails?|by emails?|over emails?|through emails?|email support|e-mails?|respond(?:ing)? to emails|answer(?:ing)? emails|customer emails|email enquiries|email inquiries|email tickets|support emails|emails?\s*(?:,|&|and)\s*(?:chat|phone|tickets?))\b/i;

const TICKET = /\btickets?\b/i;
const INBOX = /\binbox(?:es)?\b/i;
const HELPDESK =
  /\b(zendesk|freshdesk|intercom|gorgias|help\s?scout|zoho desk|salesforce service cloud|kustomer|gladly|dixa|jira service management)\b/i;
const LIVE_CHAT =
  /\b(live chat|webchat|web chat|chat support|via chat|through chat|simultaneous chats|customer chats|in-app chat)\b/i;
const SOFTWARE = /\b(saas|software)\b/i;
const WRITTEN =
  /\b(written english|written communication|written communications|excellent writing|strong writing skills|writing skills)\b/i;
const TROUBLESHOOT = /\b(troubleshooting|trouble-shooting|problem-solving|problem solving)\b/i;
const PHONE_DUTY =
  /\b(phone support|telephone|inbound calls|outbound calls|on the phone|phone calls|over the phone|via phone|by phone|taking calls|dialler|dialer|call centre|call center|average handle time|\bahT\b)\b/i;
const NIGHTS = /\b(night shifts?|overnight shifts?|rotating shifts?|fixed nights?)\b/i;
const QUOTA = /\b(quota|\bote\b|cold calling|cold calls?)\b/i;

const HARD_ONSITE =
  /\b(on[- ]?site (?:role|position|job)|office[- ]based (?:role|position|job)|must (?:work|be) (?:from |in )?(?:the )?office|in[- ]office (?:role|position)|fully office[- ]based)\b/i;
const HYBRID = /\bhybrid\b/i;
const HOME_OPTION =
  /\b(work(?:ing)? from home|home[- ]based|home working|fully remote|remote-first|100% remote|can work remotely|remote option|working remotely|remote role|this is remote)\b/i;

function clean(value: string): string {
  return value.normalize("NFKC").replace(/\p{Extended_Pictographic}/gu, " ").replace(/\s+/g, " ").trim();
}

function hasUkToken(value: string): boolean {
  return UK_TOKENS.test(value.replace(/\./g, ""));
}

function hasUkCity(value: string): boolean {
  const lower = value.toLowerCase();
  return UK_CITIES.some((city) => new RegExp(`\\b${city}\\b`, "i").test(lower));
}

function splitPlaces(value: string): string[] {
  return clean(value)
    .split(/,|&|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

type RegionClass = "uk" | "world" | "europe" | "hard_reject" | "unclear";

function classifyRegion(region: string): RegionClass {
  const text = clean(region);
  if (!text) return "unclear";
  const lower = text.toLowerCase();
  if (hasUkToken(text) || hasUkCity(lower)) return "uk";
  if (/^(global|worldwide|anywhere)$/.test(lower) || /anywhere in the world|\banywhere\b|worldwide|world-wide|work from anywhere/.test(lower)) {
    return "world";
  }
  if (/^(usa|us|united states|north america|canada|latam|latin america) only$/.test(lower)) return "hard_reject";
  if (US_STATES.has(lower)) return "hard_reject";
  if (/governorate|province/.test(lower)) return "hard_reject";
  if (/^europe$/.test(lower) || /\beurope\b/.test(lower)) return "europe";
  if (/\bonly$/.test(lower)) return "hard_reject";
  const parts = splitPlaces(text);
  if (parts.length > 1) {
    if (parts.some((part) => hasUkToken(part) || hasUkCity(part))) return "uk";
    return "hard_reject";
  }
  if (lower === "emea") return "unclear";
  if (OTHER_PLACES.test(text) && !hasUkToken(text)) return "hard_reject";
  return "unclear";
}

function classifyCountry(country: string): "empty" | "uk" | "omits" {
  const text = clean(country);
  if (!text) return "empty";
  const parts = splitPlaces(text);
  if (parts.some((part) => hasUkToken(part) || hasUkCity(part))) return "uk";
  return "omits";
}

function findUkExclusion(description: string): string | null {
  const pattern =
    /not available (?:to|in|for) (?:the )?(?:uk|u\.k\.?|united kingdom)|(?:uk|united kingdom) (?:applicants|candidates|residents)[^.]{0,40}\bnot\b|excluding (?:the )?(?:uk|united kingdom)|except (?:the )?(?:uk|united kingdom)|(?:cannot|can't|must not) (?:be based|reside|live|work) in (?:the )?(?:uk|united kingdom)|not open to (?:the )?(?:uk|united kingdom)|no (?:uk|united kingdom) (?:visa|applicants|residents)/i;
  const match = firstMatch(description, pattern);
  return match ? quoteSpan(description, match.index, match.length) : null;
}

function findPermission(description: string): { acceptsUk: boolean; requiresOther: boolean; quote: string } | null {
  const pattern =
    /(?:must (?:be )?(?:based|located|living|reside|resident)|must (?:live|reside)|right to work|eligible to work|authori[sz]ed to work|work authori[sz]ation|work permit|only open to|open only to|this (?:role|position|job) is only available)[^.]{0,160}/i;
  const match = firstMatch(description, pattern);
  if (!match) return null;
  const sentence = match.value;
  const acceptsUk = hasUkToken(sentence);
  const requiresOther = OTHER_PLACES.test(sentence) && !acceptsUk;
  return {
    acceptsUk,
    requiresOther,
    quote: quoteSpan(description, match.index, match.length),
  };
}

function ukMention(text: string): string | null {
  const match = firstMatch(text, UK_TOKENS);
  return match ? quoteSpan(text, match.index, match.length) : null;
}

export function decideUkEligibility(input: {
  locationText: string;
  countryText?: string | null;
  descriptionText: string;
  title: string;
}): { eligibility: UkEligibility; quote: string | null } {
  const regionClass = classifyRegion(input.locationText);
  const countryClass = classifyCountry(input.countryText ?? "");
  const description = `${input.title}\n${input.descriptionText}`;
  const exclusion = findUkExclusion(input.descriptionText);
  const permission = findPermission(input.descriptionText);
  const mention = ukMention(description);

  if (regionClass === "hard_reject") {
    return { eligibility: "rejected", quote: clean(input.locationText) };
  }
  if (countryClass === "omits") {
    return { eligibility: "rejected", quote: clean(input.countryText ?? "") };
  }
  if (exclusion) return { eligibility: "rejected", quote: exclusion };

  if (regionClass === "uk" || countryClass === "uk" || permission?.acceptsUk) {
    return {
      eligibility: "explicit_uk",
      quote: permission?.acceptsUk ? permission.quote : mention ?? clean(input.locationText),
    };
  }
  if (regionClass === "europe") {
    if (mention) return { eligibility: "explicit_uk", quote: mention };
    return { eligibility: "rejected", quote: clean(input.locationText) || "Europe" };
  }
  if (regionClass === "world") {
    if (permission?.requiresOther) return { eligibility: "rejected", quote: permission.quote };
    return { eligibility: "worldwide", quote: clean(input.locationText) };
  }
  if (permission?.requiresOther) return { eligibility: "rejected", quote: permission.quote };
  if (mention) return { eligibility: "explicit_uk", quote: mention };
  return { eligibility: "unknown", quote: clean(input.locationText) || null };
}

function locationIsInsideUk(location: string): boolean {
  return hasUkToken(location) || hasUkCity(location);
}

export function decideRemoteSignal(input: {
  source: SourceId;
  title: string;
  descriptionText: string;
}): RemoteSignal {
  const text = `${input.title}\n${input.descriptionText}`;
  if (HARD_ONSITE.test(text)) return "onsite";
  if (HYBRID.test(text) && !HOME_OPTION.test(text) && !/\bremote\b/i.test(text)) return "onsite";
  if (HOME_OPTION.test(text) || /\bremote\b/i.test(input.title)) return "explicit_remote";
  if (
    input.source === "weworkremotely" ||
    input.source === "jobicy" ||
    input.source === "workingnomads" ||
    input.source === "remotive" ||
    input.source === "remoteok"
  ) {
    return "board_remote";
  }
  return "unknown";
}

function rejectForOnsite(title: string, description: string): string | null {
  const text = `${title}\n${description}`;
  const onsite = firstMatch(text, HARD_ONSITE);
  if (onsite) {
    return `onsite: The listing says the role is on-site or office-based. “${quoteSpan(text, onsite.index, onsite.length)}”`;
  }
  const hybrid = firstMatch(text, HYBRID);
  if (hybrid && !HOME_OPTION.test(text) && !/\bremote\b/i.test(text)) {
    return `onsite: Hybrid is listed with no home-working option. “${quoteSpan(text, hybrid.index, hybrid.length)}”`;
  }
  return null;
}

function rejectForSeniority(title: string, jobLevel: string | null, description: string): string | null {
  const leadership = /\b(director|vice president|\bvp\b|head of|chief)\b/i;
  const titleHit = firstMatch(title, leadership);
  if (titleHit) {
    return `seniority: The title “${title}” is a leadership role the profile does not target.`;
  }
  const level = (jobLevel ?? "").trim();
  if (level && /\b(director|vice president|vp|head|chief|c-level)\b/i.test(level) && !/\bsenior\b/i.test(level)) {
    return `seniority: The source level “${level}” is a leadership level the profile does not target.`;
  }
  const peopleTitle = firstMatch(title, /\b(people manager|team manager|support manager|engineering manager|team lead|team leader)\b/i);
  if (peopleTitle) {
    return `seniority: “${title}” is a people-leadership title.`;
  }
  if (/\bmanager\b/i.test(title)) {
    const duty = firstMatch(description, /\b(direct reports|people management|manage a team|managing a team|line management|people leadership)\b/i);
    if (duty) {
      return `seniority: “${title}” asks for people leadership. “${quoteSpan(description, duty.index, duty.length)}”`;
    }
  }
  return null;
}

function rejectForEngineering(title: string): string | null {
  const lower = title.toLowerCase();
  if (/\bsoftware engineers?\b/.test(lower)) {
    return `engineering: “${title}” is a software engineering role, not support.`;
  }
  if (/\bengineering managers?\b/.test(lower)) {
    return `engineering: “${title}” is an engineering manager role.`;
  }
  if (/\b(staff|principal) engineers?\b/.test(lower)) {
    return `engineering: “${title}” is a staff or principal engineer role.`;
  }
  if (/\b(front[- ]?end|back[- ]?end|full[- ]?stack|web|software|ios|android) developers?\b/.test(lower)) {
    return `engineering: “${title}” is a developer build role.`;
  }
  if (/\bdevelopers?\b/.test(lower) && !/\b(support|customer|success|service)\b/.test(lower)) {
    return `engineering: “${title}” is a developer role rather than support.`;
  }
  return null;
}

type Zone = "neutral" | "required" | "preferred";

function lineZone(line: string, current: Zone): Zone {
  const trimmed = line.trim();
  if (/^(preferred|nice to have|nice-to-have|bonus|pluses|good to have|great to have|ideally)\b/i.test(trimmed)) {
    return "preferred";
  }
  if (/^(requirements|required|must[- ]haves?|what you(?:'|’)ll need|qualifications)\b/i.test(trimmed)) {
    return "required";
  }
  return current;
}

function lineIsRequired(line: string, zone: Zone): boolean {
  if (/\b(preferred|nice to have|nice-to-have|bonus|ideally)\b/i.test(line)) return false;
  if (zone === "preferred") return false;
  if (zone === "required") return true;
  return /\b(must[- ]have|required|requirement)\b/i.test(line);
}

function rejectForQualification(input: {
  title: string;
  description: string;
  profile: ScoringProfile;
}): string | null {
  const lines = input.description.split(/\n+/);
  let zone: Zone = "neutral";
  const requiredBits: string[] = [];
  for (const line of lines) {
    zone = lineZone(line, zone);
    if (lineIsRequired(line, zone)) requiredBits.push(line);
  }
  const requiredText = requiredBits.join("\n");
  const title = input.title;

  const degree = firstMatch(
    requiredText,
    /\b(bachelor(?:'|’)?s?|master(?:'|’)?s?|university degree|undergraduate degree|graduate degree|phd|doctorate)\b/i,
  );
  if (degree) {
    return `qualification: A degree is required. “${quoteSpan(requiredText, degree.index, degree.length)}”`;
  }

  const clearance = firstMatch(
    requiredText,
    /\b(security clearance|sc clearance|baseline personnel security|developed vetting|secret clearance|top secret|ctc clearance)\b/i,
  );
  if (clearance) {
    return `qualification: A security clearance is required. “${quoteSpan(requiredText, clearance.index, clearance.length)}”`;
  }

  const licence = firstMatch(requiredText, /\b(driving licen[cs]e|driver(?:'|’)s licen[cs]e)\b/i);
  if (licence) {
    return `qualification: A driving licence is required. “${quoteSpan(requiredText, licence.index, licence.length)}”`;
  }

  const years = firstMatch(
    requiredText,
    /(\d+)\s*\+\s*years|(?:minimum of|at least)\s+(\d+)\s+years|(\d+)\s*\+?\s*years?(?:\s+of)?\s+(?:experience|customer|support|relevant)/i,
  );
  if (years) {
    const figure = Number(years.value.match(/\d+/)?.[0] ?? "0");
    const owned = input.profile.yearsCustomerFacing;
    if (owned !== null && figure > owned) {
      return `qualification: The listing requires ${figure} years and the profile has ${owned}. “${quoteSpan(requiredText, years.index, years.length)}”`;
    }
  }

  const titleLanguage = firstMatch(title, new RegExp(`\\b(${LANGUAGES.join("|")})\\b`, "i"));
  if (titleLanguage) {
    const language = titleLanguage.value.toLowerCase();
    const known = input.profile.languages.some((item) => item.toLowerCase() === language);
    if (!known) {
      return `qualification: ${language[0].toUpperCase()}${language.slice(1)} is in the title and is not on the profile. “${title}”`;
    }
  }

  const languageText = `${title}\n${requiredText}`;
  for (const language of LANGUAGES) {
    const pattern = new RegExp(
      `\\b(?:fluent in|native|proficiency in|must speak|speaking|speaker)\\s+${language}\\b|\\b${language}\\s+(?:speaking|speaker|language|required|fluency)\\b`,
      "i",
    );
    const hit = firstMatch(languageText, pattern);
    if (!hit) continue;
    const known = input.profile.languages.some((item) => item.toLowerCase() === language);
    if (!known) {
      return `qualification: ${language[0].toUpperCase()}${language.slice(1)} is required and is not on the profile. “${quoteSpan(languageText, hit.index, hit.length)}”`;
    }
  }
  return null;
}

function rejectForCategory(title: string, blocklist: string[]): string | null {
  const lower = title.toLowerCase();
  for (const term of blocklist) {
    const cleaned = term.trim().toLowerCase();
    if (!cleaned) continue;
    const pattern = new RegExp(`\\b${cleaned.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(lower)) {
      return `category: The title matches the blocked category “${cleaned}”.`;
    }
  }
  return null;
}

function addFit(
  reasons: FitReason[],
  rule: string,
  points: number,
  text: string,
  pattern: RegExp,
): void {
  const match = firstMatch(text, pattern);
  if (!match) return;
  reasons.push({ rule, points, quote: quoteSpan(text, match.index, match.length) });
}

export function scoreFit(title: string, description: string): { score: number; reasons: FitReason[] } {
  const reasons: FitReason[] = [];
  addFit(reasons, "title_support", 40, title, SUPPORT_TITLE);
  const channelText = description;
  if (EMAIL_DUTY.test(channelText) || TICKET.test(channelText) || INBOX.test(channelText) || HELPDESK.test(channelText)) {
    const match =
      firstMatch(channelText, EMAIL_DUTY) ??
      firstMatch(channelText, TICKET) ??
      firstMatch(channelText, INBOX) ??
      firstMatch(channelText, HELPDESK);
    if (match) {
      reasons.push({
        rule: "helpdesk_channel",
        points: 15,
        quote: quoteSpan(channelText, match.index, match.length),
      });
    }
  }
  addFit(reasons, "live_chat", 10, description, LIVE_CHAT);
  addFit(reasons, "software_saas", 8, description, SOFTWARE);
  addFit(reasons, "written_communication", 8, description, WRITTEN);
  addFit(reasons, "troubleshooting", 6, description, TROUBLESHOOT);
  addFit(reasons, "phone_duty", -12, description, PHONE_DUTY);
  addFit(reasons, "fixed_nights_or_rotating_shifts", -8, description, NIGHTS);
  addFit(reasons, "senior_title", -8, title, /\bsenior\b/i);
  addFit(reasons, "quota_ote_cold_call", -20, description, QUOTA);
  const total = reasons.reduce((sum, reason) => sum + reason.points, 0);
  return { score: Math.max(0, Math.min(100, total)), reasons };
}

const OE_SIGNALS: Array<{ signal: string; direction: "async" | "sync"; pattern: RegExp }> = [
  { signal: "email", direction: "async", pattern: EMAIL_DUTY },
  { signal: "ticket", direction: "async", pattern: TICKET },
  { signal: "helpdesk_tool", direction: "async", pattern: HELPDESK },
  { signal: "asynchronous", direction: "async", pattern: /\b(asynchronous|async)\b/i },
  { signal: "phone", direction: "sync", pattern: PHONE_DUTY },
  { signal: "shift", direction: "sync", pattern: /\b(shifts|shift work|shift pattern|night shift|rotating shift)\b/i },
  { signal: "rota", direction: "sync", pattern: /\brotas?\b/i },
  { signal: "on_call", direction: "sync", pattern: /\bon-?call\b/i },
  { signal: "daily_meetings", direction: "sync", pattern: /\bdaily meetings\b/i },
  { signal: "webcam", direction: "sync", pattern: /\b(webcam|webcams|camera on|cameras on)\b/i },
  { signal: "time_tracking", direction: "sync", pattern: /\b(time[- ]tracking|time tracker)\b/i },
  { signal: "fixed_hours", direction: "sync", pattern: /\b(fixed hours|fixed schedule|set hours)\b/i },
];

export function scoreOe(description: string): {
  score: number | null;
  status: "scored" | "unknown";
  confidence: "low" | "normal" | null;
  reasons: OeReason[];
} {
  const reasons: OeReason[] = [];
  for (const signal of OE_SIGNALS) {
    const match = firstMatch(description, signal.pattern);
    if (!match) continue;
    reasons.push({
      signal: signal.signal,
      direction: signal.direction,
      quote: quoteSpan(description, match.index, match.length),
    });
  }
  if (reasons.length < 2) {
    return { score: null, status: "unknown", confidence: null, reasons };
  }
  const asyncCount = reasons.filter((reason) => reason.direction === "async").length;
  const syncCount = reasons.filter((reason) => reason.direction === "sync").length;
  const score = Math.max(0, Math.min(10, 5 + asyncCount - 2 * syncCount));
  return {
    score,
    status: "scored",
    confidence: reasons.length <= 3 ? "low" : "normal",
    reasons,
  };
}

function unknownDecision(partial: Pick<Decision, "ukEligibility" | "remoteSignal" | "status" | "filterReason">): Decision {
  return {
    ...partial,
    fitScore: null,
    fitStatus: "unknown",
    fitReasons: [],
    oeScore: null,
    oeStatus: "unknown",
    oeConfidence: null,
    oeReasons: [],
  };
}

export function evaluateListing(input: EvaluateInput): Decision {
  const now = input.now ?? new Date();
  const uk = decideUkEligibility({
    locationText: input.locationText,
    countryText: input.countryText,
    descriptionText: input.descriptionText,
    title: input.title,
  });
  const remoteSignal = decideRemoteSignal(input);
  const description = input.descriptionText.trim();

  const fail = (status: JobStatus, filterReason: string): Decision =>
    unknownDecision({ ukEligibility: uk.eligibility, remoteSignal, status, filterReason });

  if (input.expiresAt) {
    const expires = new Date(input.expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires.getTime() < now.getTime()) {
      return fail("filtered_out", "expired: The listing's expiry time is in the past.");
    }
  }
  if (input.source === "jobicy" && input.jobicyStatus === "closed") {
    return fail("expired", "closed: Jobicy reports this listing as closed.");
  }
  if (uk.eligibility === "rejected") {
    return fail("filtered_out", `uk_rejected: The listing does not accept UK applicants. “${uk.quote ?? input.locationText}”`);
  }
  const ukBoardWithUkLocation = input.source === "reed" && locationIsInsideUk(input.locationText);
  if (uk.eligibility === "unknown" && !ukBoardWithUkLocation) {
    return fail(
      "filtered_out",
      `uk_unknown: The location does not explicitly accept the UK. “${uk.quote ?? input.locationText ?? "No location"}”`,
    );
  }
  const onsite = rejectForOnsite(input.title, input.descriptionText);
  if (onsite) return fail("filtered_out", onsite);
  if (input.isDuplicate) {
    return fail("duplicate", "duplicate: This is the same advert as an earlier listing.");
  }
  const seniority = rejectForSeniority(input.title, input.jobLevel ?? null, input.descriptionText);
  if (seniority) return fail("filtered_out", seniority);
  const engineering = rejectForEngineering(input.title);
  if (engineering) return fail("filtered_out", engineering);
  const qualification = rejectForQualification({
    title: input.title,
    description: input.descriptionText,
    profile: input.profile,
  });
  if (qualification) return fail("filtered_out", qualification);
  const category = rejectForCategory(input.title, input.profile.categoryBlocklist);
  if (category) return fail("filtered_out", category);

  if (description.length < 400) {
    return unknownDecision({
      ukEligibility: uk.eligibility,
      remoteSignal,
      status: "discovered",
      filterReason: null,
    });
  }

  const fit = scoreFit(input.title, description);
  const oe = scoreOe(description);
  const status: JobStatus = fit.score >= input.profile.minFitScore ? "shortlisted" : "discovered";
  return {
    ukEligibility: uk.eligibility,
    remoteSignal,
    status,
    filterReason: null,
    fitScore: fit.score,
    fitStatus: "scored",
    fitReasons: fit.reasons,
    oeScore: oe.score,
    oeStatus: oe.status,
    oeConfidence: oe.confidence,
    oeReasons: oe.reasons,
  };
}
