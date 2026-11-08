import { createHash } from "crypto";
import { absentQualification, prohibitedFinding, type ValidationFinding } from "@/lib/applications/validate";
import { words } from "@/lib/applications/words";
import type { ProfileFact, WritingRuleSeed } from "@/lib/profile-defaults";
import { contactSegments, splitSentences, stripBullet } from "@/lib/cv/parse";
import { isPlaceOnly } from "@/lib/cv/places";
import { canonicalWords } from "@/lib/cv/reword";
import { cvLines, cvPlainText, type CvLineKind, type TailoredCv } from "@/lib/cv/tailor";

export type CvValidationInput = {
  cv: TailoredCv;
  baseCvText: string;
  facts: ProfileFact[];
  displayName: string;
  contactEmail: string | null;
  rules: WritingRuleSeed[];
  qualificationsAbsent: string[];
};

export type CvValidationResult = {
  cv: TailoredCv;
  plainText: string;
  textHash: string;
  passed: boolean;
  method: "deterministic";
  findings: ValidationFinding[];
  callsModel: false;
};

export const FIXED_HEADINGS = ["Profile", "Key skills", "Experience", "Education and training", "Languages"];

/** Tone words a reworded line may add. They describe manner, never an outcome, a number, or a credential. */
export const FRAMING_WORDS = new Set(["effectively", "proactively", "promptly", "clearly", "confidently", "carefully"]);

const LEADING = new Set(["i", "was"]);
const EMAIL = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PHONE = /^\+?[\d\s().-]{9,20}$/;

type Sources = {
  exact: Set<string>;
  claims: Map<string, string>;
  baseText: string;
  headings: Set<string>;
};

function key(tokens: string[]): string {
  return tokens.join(" ");
}

function claimKey(text: string): string {
  const tokens = canonicalWords(text).filter((token) => !FRAMING_WORDS.has(token));
  while (tokens.length > 0 && LEADING.has(tokens[0])) tokens.shift();
  return key(tokens);
}

function segments(line: string): string[] {
  return [line, ...line.split(/\s*[,;|•·]\s*/)].map((part) => part.replace(/\.$/, "").trim()).filter(Boolean);
}

function buildSources(input: CvValidationInput): Sources {
  const exact = new Set<string>();
  const claims = new Map<string, string>();
  const headings = new Set<string>();
  const addClaim = (text: string) => {
    const k = claimKey(text);
    if (k && !claims.has(k)) claims.set(k, text);
  };
  const addExact = (text: string) => {
    for (const part of segments(text)) {
      const k = key(words(part));
      if (k) exact.add(k);
    }
  };
  for (const raw of input.baseCvText.split(/\r?\n/)) {
    const line = stripBullet(raw.replace(/\s+/g, " ").trim());
    if (!line) continue;
    addExact(line);
    addClaim(line);
    for (const sentence of splitSentences(line)) addClaim(sentence);
    headings.add(key(words(line.replace(/[:\s]+$/, ""))));
  }
  for (const fact of input.facts) {
    const text = fact.text.trim();
    if (!text) continue;
    addExact(text);
    addClaim(text);
    for (const sentence of splitSentences(text)) addClaim(sentence);
    if (fact.organisation) addExact(fact.organisation);
    const dates = [fact.start, fact.end].filter(Boolean).join(" – ");
    if (dates) addExact(dates);
  }
  if (input.displayName.trim()) addExact(input.displayName.trim());
  return { exact, claims, baseText: input.baseCvText, headings };
}

function judge(kind: CvLineKind, text: string, input: CvValidationInput, sources: Sources): ValidationFinding {
  const prohibited = prohibitedFinding(text, input.rules);
  if (prohibited) return prohibited;
  if (absentQualification(text, input.qualificationsAbsent)) {
    return { claim: text, verdict: "unsupported", span: null, ruleKey: "no_invented_facts" };
  }
  const unsupported: ValidationFinding = { claim: text, verdict: "unsupported", span: null, ruleKey: "no_invented_facts" };
  const tokens = key(words(text));
  switch (kind) {
    case "heading":
      return FIXED_HEADINGS.includes(text) || sources.headings.has(tokens) ? { claim: text, verdict: "supported", span: null, ruleKey: null } : unsupported;
    case "contact": {
      const isEmail = EMAIL.test(text);
      if (!isEmail && !PHONE.test(text)) return { claim: text, verdict: "prohibited", span: null, ruleKey: "no_town_county_linkedin" };
      if (isEmail && input.contactEmail && text.toLowerCase() === input.contactEmail.toLowerCase()) {
        return { claim: text, verdict: "supported", span: "profile contact email", ruleKey: null };
      }
      const inBase = isEmail
        ? sources.baseText.toLowerCase().includes(text.toLowerCase())
        : contactSegments(sources.baseText.replace(/\n/g, " | ")).some((segment) => segment.replace(/\D/g, "") === text.replace(/\D/g, ""));
      return inBase ? { claim: text, verdict: "supported", span: text, ruleKey: null } : unsupported;
    }
    case "header":
    case "education": {
      if (text.split(/\s*[|·•]\s*|,\s+/).some((part) => isPlaceOnly(part))) {
        return { claim: text, verdict: "prohibited", span: null, ruleKey: "no_town_county_linkedin" };
      }
      const parts = sources.exact.has(tokens) ? [text] : text.split(/\s+·\s+/);
      return parts.every((part) => sources.exact.has(key(words(part))))
        ? { claim: text, verdict: "supported", span: text, ruleKey: null }
        : unsupported;
    }
    case "name":
    case "skill":
    case "language":
      return sources.exact.has(tokens) ? { claim: text, verdict: "supported", span: text, ruleKey: null } : unsupported;
    case "summary":
    case "bullet": {
      const source = sources.claims.get(claimKey(text));
      return source ? { claim: text, verdict: "supported", span: source.slice(0, 200), ruleKey: null } : unsupported;
    }
  }
}

/** A reusable check, so model rewording can be accepted or reverted line by line. */
export function createCvJudge(input: Omit<CvValidationInput, "cv">): (kind: CvLineKind, text: string) => boolean {
  const full: CvValidationInput = { ...input, cv: { name: null, contact: [], sections: [] } };
  const sources = buildSources(full);
  return (kind, text) => judge(kind, text, full, sources).verdict === "supported";
}

export function validateTailoredCv(input: CvValidationInput): CvValidationResult {
  const sources = buildSources(input);
  const findings: ValidationFinding[] = [];
  const failed = new Set<string>();
  for (const line of cvLines(input.cv)) {
    const finding = judge(line.kind, line.text, input, sources);
    findings.push(finding);
    if (finding.verdict !== "supported") failed.add(`${line.kind}\u0000${line.text}`);
  }
  const keep = (kind: CvLineKind, text: string) => !failed.has(`${kind}\u0000${text}`);
  const itemKind = (sectionKind: TailoredCv["sections"][number]["kind"]): CvLineKind =>
    sectionKind === "summary" ? "summary" : sectionKind === "skills" ? "skill" : sectionKind === "languages" ? "language" : "education";
  const cleaned: TailoredCv = {
    name: input.cv.name && keep("name", input.cv.name) ? input.cv.name : null,
    contact: input.cv.contact.filter((item) => keep("contact", item)),
    sections: input.cv.sections
      .filter((section) => keep("heading", section.heading))
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => keep(itemKind(section.kind), item)),
        entries: section.entries
          .map((entry) => ({
            header: entry.header.filter((line) => keep("header", line)),
            bullets: entry.bullets.filter((line) => keep("bullet", line)),
          }))
          .filter((entry) => entry.header.length > 0 || entry.bullets.length > 0),
      }))
      .filter((section) => section.items.length > 0 || section.entries.length > 0),
  };
  const plainText = cvPlainText(cleaned);
  const hasBody = cleaned.sections.some((section) => section.kind !== "summary");
  if (!hasBody) {
    findings.push({ claim: "The CV has no skills or experience left after checking.", verdict: "unsupported", span: null, ruleKey: null });
  }
  return {
    cv: cleaned,
    plainText,
    textHash: createHash("sha256").update(plainText, "utf8").digest("hex"),
    passed: failed.size === 0 && hasBody,
    method: "deterministic",
    findings,
    callsModel: false,
  };
}
