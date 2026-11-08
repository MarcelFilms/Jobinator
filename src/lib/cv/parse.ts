export type SectionKind = "summary" | "experience" | "skills" | "education" | "languages" | "other" | "dropped";

export type ParsedEntry = { header: string[]; bullets: string[] };

export type ParsedSection = {
  heading: string;
  kind: SectionKind;
  entries: ParsedEntry[];
  items: string[];
};

export type ParsedCv = {
  name: string | null;
  contact: string[];
  sections: ParsedSection[];
};

const HEADINGS: Array<{ pattern: RegExp; kind: SectionKind }> = [
  { pattern: /^(profile|summary|personal (profile|statement)|professional (profile|summary)|about( me)?|career (profile|summary)|objective)$/i, kind: "summary" },
  {
    pattern: /^((work|professional|relevant|career|employment) (experience|history)|experience|employment|work history|career history)$/i,
    kind: "experience",
  },
  { pattern: /^((key|core|technical|relevant|professional) skills|skills( (and|&) (abilities|competencies|tools))?|competencies|tools)$/i, kind: "skills" },
  { pattern: /^(education( (and|&) (training|qualifications))?|qualifications|certifications?|training|courses)$/i, kind: "education" },
  { pattern: /^languages?$/i, kind: "languages" },
  { pattern: /^(references?|interests|hobbies( (and|&) interests)?|personal details|contact( details)?)$/i, kind: "dropped" },
  { pattern: /^(projects|achievements|volunteering|volunteer experience|awards)$/i, kind: "other" },
];

const BULLET = /^\s*(?:[•●▪◦‣∙·*\-–—]|\d+[.)])\s+/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /^\+?[\d\s().-]{9,20}$/;
const DATE_HINT = /\b(19|20)\d{2}\b|\bpresent\b|\bcurrent\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i;

export function headingKind(line: string): SectionKind | null {
  const text = line.replace(/[:\s]+$/, "").trim();
  if (!text || text.split(/\s+/).length > 5) return null;
  for (const heading of HEADINGS) {
    if (heading.pattern.test(text)) return heading.kind;
  }
  if (/^[A-Z][A-Z &/]{3,40}$/.test(text) && !/\d/.test(text)) return "other";
  return null;
}

export function contactSegments(line: string): string[] {
  return line
    .split(/\s*[|•·,]\s*|\s{3,}/)
    .map((part) => part.trim())
    .filter((part) => EMAIL.test(part) || PHONE.test(part))
    .map((part) => (EMAIL.test(part) ? (part.match(EMAIL)?.[0] ?? part) : part));
}

export function stripBullet(line: string): string {
  return line.replace(BULLET, "").trim();
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function splitItems(line: string): string[] {
  return stripBullet(line)
    .split(/\s*[,;|•·]\s*/)
    .map((item) => item.replace(/\.$/, "").trim())
    .filter((item) => item.length > 1);
}

export function parseCv(text: string): ParsedCv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let name: string | null = null;
  const contact: string[] = [];
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;

  for (const line of lines) {
    const kind = headingKind(line);
    if (kind) {
      current = { heading: line.replace(/[:\s]+$/, ""), kind, entries: [], items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      const segments = contactSegments(line);
      if (segments.length > 0) {
        contact.push(...segments);
        continue;
      }
      if (!name && line.split(/\s+/).length <= 5 && !/\d/.test(line) && !EMAIL.test(line)) {
        name = line;
        continue;
      }
      current = { heading: "Profile", kind: "summary", entries: [], items: [] };
      sections.push(current);
    }
    addLine(current, line);
  }
  return { name, contact: [...new Set(contact)], sections };
}

function addLine(section: ParsedSection, line: string) {
  if (section.kind === "dropped") return;
  if (section.kind === "skills" || section.kind === "languages") {
    section.items.push(...splitItems(line));
    return;
  }
  if (section.kind === "summary") {
    section.items.push(...splitSentences(stripBullet(line)));
    return;
  }
  if (section.kind === "education") {
    section.items.push(stripBullet(line));
    return;
  }
  const isBullet = BULLET.test(line);
  const words = line.split(/\s+/).length;
  let entry = section.entries[section.entries.length - 1];
  if (isBullet || (entry && entry.header.length > 0 && words > 14 && !DATE_HINT.test(line))) {
    if (!entry) {
      entry = { header: [], bullets: [] };
      section.entries.push(entry);
    }
    entry.bullets.push(stripBullet(line));
    return;
  }
  if (!entry || entry.bullets.length > 0 || entry.header.length >= 3) {
    entry = { header: [], bullets: [] };
    section.entries.push(entry);
  }
  entry.header.push(line);
}
