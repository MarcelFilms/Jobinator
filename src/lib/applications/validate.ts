import { createHash } from "crypto";
import type { ProfileFact, WritingRuleSeed } from "@/lib/profile-defaults";
import { words, wordCount } from "@/lib/applications/words";

export type ValidationFinding = {
  claim: string;
  verdict: "supported" | "unsupported" | "prohibited";
  span: string | null;
  ruleKey: string | null;
};

export type ValidationResult = {
  subject: string;
  body: string;
  bodyHash: string;
  passed: boolean;
  method: "deterministic";
  findings: ValidationFinding[];
  requiresManualReview: boolean;
  wordCount: number;
  status: "drafted" | "needs_review";
  callsModel: false;
};

export type ValidationInput = {
  subject: string;
  body: string;
  company: string;
  role: string;
  displayName: string;
  facts: ProfileFact[];
  cvText: string;
  rules: WritingRuleSeed[];
  qualificationsAbsent: string[];
  yearsCustomerFacing: number | null;
  fallbackSubject: string;
};

const GLUE = new Set([
  "i",
  "am",
  "writing",
  "to",
  "apply",
  "for",
  "the",
  "role",
  "at",
  "would",
  "be",
  "glad",
  "help",
  "with",
  "this",
  "work",
  "and",
  "thank",
  "you",
  "considering",
  "my",
  "application",
  "kind",
  "regards",
  "dear",
  "hiring",
  "team",
  "welcome",
  "chance",
  "talk",
  "about",
  "can",
  "account",
  "not",
  "adding",
  "it",
  "a",
  "an",
  "of",
  "in",
  "on",
  "as",
  "that",
  "only",
  "your",
  "is",
]);

const DEDICATED_PROHIBITED: { ruleKey: string; pattern: RegExp }[] = [
  { ruleKey: "no_overemployment", pattern: /\boveremployment\b|\bsecond job\b|\bOE\b|\boe score\b/i },
  { ruleKey: "no_town_county_linkedin", pattern: /\blinkedin\b|\btown\b|\bcounty\b/i },
  { ruleKey: "no_user_counts_or_telegram", pattern: /\btelegram\b|\buser counts?\b|\b\d[\d,]*\s+users\b/i },
  { ruleKey: "no_ai_tools", pattern: /\b(chatgpt|github copilot|copilot|claude|gpt-4|gpt4)\b|\bai-assisted\b/i },
];

type Source = { kind: "profile" | "cv"; text: string };

export function validateApplication(input: ValidationInput): ValidationResult {
  const extras = new Set([...words(input.company), ...words(input.role), ...words(input.displayName)]);
  const sources = sourcesFrom(input);
  const removed: ValidationFinding[] = [];
  const kept: { line: string; finding: ValidationFinding }[] = [];

  for (const line of linesOf(input.body)) {
    const finding = judgeLine(line, input, extras, sources);
    if (finding.verdict === "supported") kept.push({ line, finding });
    else removed.push(finding);
  }

  let subject = input.subject.trim();
  const subjectFinding = judgeLine(subject, input, extras, sources);
  if (subjectFinding.verdict !== "supported") {
    removed.push(subjectFinding);
    subject = input.fallbackSubject.trim();
    const fallbackFinding = judgeLine(subject, input, extras, sources);
    if (fallbackFinding.verdict !== "supported") removed.push(fallbackFinding);
  }

  const body = kept.map((item) => item.line).join("\n\n");
  const count = wordCount(body);
  const findings = [...kept.map((item) => item.finding), ...removed];
  if (count < 150 || count > 250) {
    findings.push({
      claim: `The letter is ${count} words.`,
      verdict: "unsupported",
      span: null,
      ruleKey: null,
    });
  }
  const passed = removed.length === 0 && count >= 150 && count <= 250 && findings.every((finding) => finding.verdict === "supported");
  return {
    subject,
    body,
    bodyHash: createHash("sha256").update(body, "utf8").digest("hex"),
    passed,
    method: "deterministic",
    findings,
    requiresManualReview: !passed,
    wordCount: count,
    status: passed ? "drafted" : "needs_review",
    callsModel: false,
  };
}

function sourcesFrom(input: ValidationInput): Source[] {
  const sources: Source[] = input.facts
    .filter((fact) => fact.text.trim())
    .map((fact) => ({
      kind: "profile" as const,
      text: [fact.text, fact.organisation, fact.start, fact.end].filter(Boolean).join(" "),
    }));
  if (input.cvText.trim()) sources.push({ kind: "cv", text: input.cvText });
  if (input.yearsCustomerFacing !== null) {
    sources.push({ kind: "profile", text: `${input.yearsCustomerFacing} years` });
  }
  return sources;
}

function linesOf(body: string): string[] {
  return body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function judgeLine(line: string, input: ValidationInput, extras: Set<string>, sources: Source[]): ValidationFinding {
  const prohibited = prohibitedFinding(line, input.rules);
  if (prohibited) return prohibited;
  const absent = absentQualification(line, input.qualificationsAbsent);
  if (absent) {
    return { claim: line, verdict: "unsupported", span: null, ruleKey: "no_invented_facts" };
  }
  if (inventedYears(line, input, sources)) {
    return { claim: line, verdict: "unsupported", span: null, ruleKey: "no_invented_facts" };
  }
  if (isFraming(line, extras)) {
    return { claim: line, verdict: "supported", span: framingSpan(line, input), ruleKey: null };
  }
  const support = supportingSpan(line, sources, extras);
  if (support) return { claim: line, verdict: "supported", span: support.span, ruleKey: null };
  return { claim: line, verdict: "unsupported", span: null, ruleKey: "no_invented_facts" };
}

export function prohibitedFinding(line: string, rules: WritingRuleSeed[]): ValidationFinding | null {
  for (const rule of rules) {
    if (rule.appliesTo !== "employer_text" || rule.severity !== "block") continue;
    if (rule.ruleKey === "call_it_arbonomics" || /call the software business arbonomics/i.test(rule.instruction)) {
      if (/software business|subscription-based software/i.test(line) && !/\bArbonomics\b/.test(line)) {
        return { claim: line, verdict: "prohibited", span: null, ruleKey: rule.ruleKey };
      }
    }
    for (const phrase of phrasesFrom(rule.instruction)) {
      if (phrasePresent(line, phrase)) return { claim: line, verdict: "prohibited", span: null, ruleKey: rule.ruleKey };
    }
  }
  for (const check of DEDICATED_PROHIBITED) {
    if (check.pattern.test(line)) return { claim: line, verdict: "prohibited", span: null, ruleKey: check.ruleKey };
  }
  return null;
}

function phrasesFrom(instruction: string): string[] {
  const match = instruction.match(/do not (?:mention|include) ([^.]+)/i);
  if (!match) return [];
  return match[1]
    .split(/\s*,\s*|\s+or\s+/i)
    .map((part) => part.replace(/^(and|the|a)\s+/i, "").trim())
    .filter((part) => part.length >= 4);
}

function phrasePresent(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function absentQualification(line: string, absent: string[]): string | null {
  const blob = absent.join("\n").toLowerCase();
  if (/degree|university/.test(blob) && /\b(degree|bachelor|master'?s|phd|bsc|ba hons)\b/i.test(line)) return "degree";
  if (/software-engineering|software engineering/.test(blob) && /\bsoftware[ -]engineer/i.test(line)) return "software engineering";
  if (/languages other/.test(blob) && /\b(fluent in|i speak)\b/i.test(line)) return "language";
  return null;
}

function inventedYears(line: string, input: ValidationInput, sources: Source[]): boolean {
  const match = line.match(/\b(\d+(?:\.\d+)?)\s+years?\b/i);
  if (!match) return false;
  const n = Number(match[1]);
  const inSource = sources.some((source) => source.text.includes(match[1]));
  const withinProfile = input.yearsCustomerFacing !== null && n <= input.yearsCustomerFacing;
  return !inSource && !withinProfile;
}

function isFraming(line: string, extras: Set<string>): boolean {
  const tokens = words(line);
  return tokens.length > 0 && tokens.every((token) => GLUE.has(token) || extras.has(token));
}

function framingSpan(line: string, input: ValidationInput): string | null {
  if (input.role && line.toLowerCase().includes(input.role.toLowerCase())) return input.role;
  if (input.company && line.toLowerCase().includes(input.company.toLowerCase())) return input.company;
  return null;
}

function supportingSpan(line: string, sources: Source[], extras: Set<string>): { span: string } | null {
  const hay = words(line);
  for (const source of sources) {
    const needle = words(source.text);
    if (needle.length === 0) continue;
    const min = Math.min(4, needle.length);
    const max = Math.min(needle.length, 40);
    for (let len = max; len >= min; len -= 1) {
      for (let index = 0; index + len <= needle.length; index += 1) {
        const slice = needle.slice(index, index + len);
        if (findSequence(hay, slice) < 0) continue;
        if (remainderAllowed(hay, slice, extras)) return { span: slice.join(" ") };
      }
    }
  }
  return null;
}

function findSequence(hay: string[], needle: string[]): number {
  if (needle.length === 0 || needle.length > hay.length) return -1;
  for (let index = 0; index + needle.length <= hay.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (hay[index + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

function remainderAllowed(hay: string[], slice: string[], extras: Set<string>): boolean {
  const start = findSequence(hay, slice);
  if (start < 0) return false;
  const rest = [...hay.slice(0, start), ...hay.slice(start + slice.length)];
  return rest.every((token) => GLUE.has(token) || extras.has(token));
}
