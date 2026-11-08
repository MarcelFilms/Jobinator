import { absentQualification, prohibitedFinding } from "@/lib/applications/validate";
import type { ProfileFact, WritingRuleSeed } from "@/lib/profile-defaults";
import { jobKeywords, keywordScore, type Keyword } from "@/lib/cv/keywords";
import { parseCv, splitSentences, type ParsedCv } from "@/lib/cv/parse";
import { withoutPlaces } from "@/lib/cv/places";
import { rewordLine } from "@/lib/cv/reword";

export type CvLineKind = "name" | "contact" | "heading" | "summary" | "header" | "bullet" | "skill" | "education" | "language";

export type TailoredSection = {
  heading: string;
  kind: "summary" | "skills" | "experience" | "education" | "languages" | "other";
  entries: Array<{ header: string[]; bullets: string[] }>;
  items: string[];
};

export type TailoredCv = {
  name: string | null;
  contact: string[];
  sections: TailoredSection[];
};

export type Omission = { line: string; reason: string };

export type TailorInput = {
  baseCvText: string;
  facts: ProfileFact[];
  displayName: string;
  contactEmail: string | null;
  rules: WritingRuleSeed[];
  qualificationsAbsent: string[];
  jobTitle: string;
  jobDescription: string;
};

export type TailorResult = {
  cv: TailoredCv;
  keywords: Keyword[];
  omitted: Omission[];
};

const MAX_SUMMARY = 4;
const MAX_BULLETS = 6;
const MIN_BULLETS = 2;
const MAX_SKILLS = 14;

export function tailorCv(input: TailorInput): TailorResult {
  const keywords = jobKeywords(input.jobTitle, input.jobDescription);
  const parsed = parseCv(input.baseCvText);
  const omitted: Omission[] = [];
  const allowed = (line: string): boolean => {
    const prohibited = prohibitedFinding(line, input.rules);
    if (prohibited) {
      omitted.push({ line, reason: `Left out under the writing rule ${prohibited.ruleKey}.` });
      return false;
    }
    if (absentQualification(line, input.qualificationsAbsent)) {
      omitted.push({ line, reason: "Left out because the profile says this qualification is absent." });
      return false;
    }
    return true;
  };
  const placeless = (lines: string[]): string[] =>
    lines.flatMap((line) => {
      const kept = withoutPlaces(line);
      if (kept !== line) omitted.push({ line, reason: "A town, county, or postcode was taken out." });
      return kept ? [kept] : [];
    });
  const rank = <T>(items: T[], text: (item: T) => string): T[] =>
    items
      .map((item, index) => ({ item, index, score: keywordScore(text(item), keywords) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.item);

  const sections: TailoredSection[] = [];

  const summaryPool = [
    ...parsed.sections.filter((section) => section.kind === "summary").flatMap((section) => section.items),
    ...input.facts.map((fact) => fact.text.trim()).filter(Boolean),
  ];
  const summary = dedupe(rank(summaryPool.filter(allowed), (line) => line))
    .slice(0, MAX_SUMMARY)
    .map(rewordLine);
  if (summary.length > 0) sections.push({ heading: "Profile", kind: "summary", entries: [], items: summary });

  const baseSkills = parsed.sections.filter((section) => section.kind === "skills").flatMap((section) => section.items);
  const skillPool = baseSkills.length > 0 ? baseSkills : skillsFromFacts(input.facts);
  const skills = dedupe(rank(skillPool.filter(allowed), (item) => item)).slice(0, MAX_SKILLS);
  if (skills.length > 0) sections.push({ heading: "Key skills", kind: "skills", entries: [], items: skills });

  const experience = experienceEntries(parsed, input.facts)
    .map((entry) => ({
      header: placeless(entry.header).filter(allowed),
      bullets: entry.bullets.filter(allowed),
    }))
    .filter((entry) => entry.header.length > 0 || entry.bullets.length > 0)
    .map((entry) => {
      const ranked = rank(entry.bullets, (line) => line);
      const matching = ranked.filter((line) => keywordScore(line, keywords) > 0).length;
      const keep = Math.min(MAX_BULLETS, Math.max(MIN_BULLETS, matching));
      for (const dropped of ranked.slice(keep)) omitted.push({ line: dropped, reason: "Left out as less relevant to this job." });
      return { header: entry.header, bullets: ranked.slice(0, keep).map(rewordLine) };
    });
  if (experience.length > 0) sections.push({ heading: "Experience", kind: "experience", entries: experience, items: [] });

  const education = parsed.sections.filter((section) => section.kind === "education").flatMap((section) => placeless(section.items)).filter(allowed);
  if (education.length > 0) sections.push({ heading: "Education and training", kind: "education", entries: [], items: education });

  const languages = parsed.sections.filter((section) => section.kind === "languages").flatMap((section) => section.items).filter(allowed);
  if (languages.length > 0) sections.push({ heading: "Languages", kind: "languages", entries: [], items: languages });

  for (const section of parsed.sections.filter((item) => item.kind === "other")) {
    const entries = section.entries
      .map((entry) => ({ header: placeless(entry.header).filter(allowed), bullets: entry.bullets.filter(allowed).map(rewordLine) }))
      .filter((entry) => entry.header.length > 0 || entry.bullets.length > 0);
    if (entries.length > 0) sections.push({ heading: section.heading, kind: "other", entries, items: [] });
  }

  const name = input.displayName.trim() || parsed.name;
  const contact = dedupe([...(input.contactEmail ? [input.contactEmail] : []), ...parsed.contact]).filter(allowed);
  return { cv: { name: name && allowed(name) ? name : null, contact, sections }, keywords, omitted };
}

function experienceEntries(parsed: ParsedCv, facts: ProfileFact[]): Array<{ header: string[]; bullets: string[] }> {
  const fromCv = parsed.sections.filter((section) => section.kind === "experience").flatMap((section) => section.entries);
  if (fromCv.some((entry) => entry.bullets.length > 0)) return fromCv;
  return facts
    .filter((fact) => fact.kind === "employment" && fact.text.trim())
    .map((fact) => ({
      header: [fact.organisation, [fact.start, fact.end].filter(Boolean).join(" – ")].filter((part): part is string => Boolean(part && part.trim())),
      bullets: splitSentences(fact.text.trim()),
    }));
}

function skillsFromFacts(facts: ProfileFact[]): string[] {
  return facts.filter((fact) => fact.kind === "skill" && fact.text.trim()).map((fact) => fact.text.trim().replace(/\.$/, ""));
}

function dedupe(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export function cvLines(cv: TailoredCv): Array<{ kind: CvLineKind; text: string; section: string | null }> {
  const lines: Array<{ kind: CvLineKind; text: string; section: string | null }> = [];
  if (cv.name) lines.push({ kind: "name", text: cv.name, section: null });
  for (const item of cv.contact) lines.push({ kind: "contact", text: item, section: null });
  for (const section of cv.sections) {
    lines.push({ kind: "heading", text: section.heading, section: section.heading });
    const itemKind: CvLineKind =
      section.kind === "summary" ? "summary" : section.kind === "skills" ? "skill" : section.kind === "languages" ? "language" : "education";
    for (const item of section.items) lines.push({ kind: itemKind, text: item, section: section.heading });
    for (const entry of section.entries) {
      for (const header of entry.header) lines.push({ kind: "header", text: header, section: section.heading });
      for (const bullet of entry.bullets) lines.push({ kind: "bullet", text: bullet, section: section.heading });
    }
  }
  return lines;
}

export function cvPlainText(cv: TailoredCv): string {
  const out: string[] = [];
  if (cv.name) out.push(cv.name);
  if (cv.contact.length) out.push(cv.contact.join(" · "));
  for (const section of cv.sections) {
    out.push("", section.heading.toUpperCase());
    if (section.kind === "summary") out.push(section.items.join(" "));
    else if (section.kind === "skills" || section.kind === "languages") out.push(section.items.join(" · "));
    else for (const item of section.items) out.push(item);
    for (const entry of section.entries) {
      out.push("", ...entry.header);
      for (const bullet of entry.bullets) out.push(`• ${bullet}`);
    }
  }
  return out.join("\n").trim();
}
