import type { ProfileFact } from "@/lib/profile-defaults";
import type { WritingRuleSeed } from "@/lib/profile-defaults";
import { cvLabelForJob, type CvLabel } from "@/lib/applications/cv-label";
import { validateApplication, type ValidationResult } from "@/lib/applications/validate";
import { oneLine, wordCount } from "@/lib/applications/words";

export type TemplateInput = {
  title: string;
  description?: string;
  company: string;
  displayName?: string;
  facts: ProfileFact[];
  cvText: string;
  rules: WritingRuleSeed[];
  qualificationsAbsent?: string[];
  yearsCustomerFacing?: number | null;
};

export type TemplateDraft = {
  label: CvLabel;
  subject: string;
  body: string;
  validation: ValidationResult;
};

const FRAMES: Array<(role: string, company: string) => string> = [
  (role, company) => `I am writing to apply for the ${role} role at ${company}.`,
  (role, company) => `I would be glad to help ${company} with the ${role} role.`,
  (role, company) => `I would welcome the chance to talk about the ${role} role at ${company}.`,
  (role, company) => `I am glad to apply for the ${role} role at ${company}.`,
  (role, company) => `I would be glad to talk with the hiring team about the ${role} role.`,
  (role, company) => `I can help ${company} with the ${role} role.`,
  (role, company) => `My application is for the ${role} role at ${company}.`,
  (role, company) => `I would welcome the chance to help ${company} with this work.`,
];

export function applicationSubject(role: string, company: string): string {
  const roleText = oneLine(role) || "the role";
  const companyText = oneLine(company);
  return companyText ? `Application for ${roleText} at ${companyText}` : `Application for ${roleText}`;
}

export function relevantFacts(facts: ProfileFact[], label: CvLabel): ProfileFact[] {
  return facts.filter((fact) => {
    const text = fact.text.trim();
    if (!text) return false;
    if (label === "general") return true;
    const hay = text.toLowerCase();
    if (label === "digital_marketing") return /marketing|website|booking|written english|communication/.test(hay);
    if (label === "saas_product_support") {
      return /support|arbonimics|subscription|troubleshoot|website|booking|written english|software|customer-facing|customer facing/.test(hay);
    }
    return /support|customer-facing|customer facing|written english|website|booking|management|communication/.test(hay);
  });
}

export function prepareTemplate(input: TemplateInput): TemplateDraft {
  const label = cvLabelForJob(input.title, input.description ?? "");
  const role = oneLine(input.title) || "the role";
  const company = oneLine(input.company) || "your team";
  const name = oneLine(input.displayName ?? "");
  const subject = applicationSubject(role, company === "your team" ? "" : company);
  const body = renderBody(label, role, company, name, input.facts);
  const validation = validateApplication({
    subject,
    body,
    company,
    role,
    displayName: name,
    facts: input.facts,
    cvText: input.cvText,
    rules: input.rules,
    qualificationsAbsent: input.qualificationsAbsent ?? [],
    yearsCustomerFacing: input.yearsCustomerFacing ?? null,
    fallbackSubject: subject,
  });
  return { label, subject: validation.subject, body: validation.body, validation };
}

function renderBody(label: CvLabel, role: string, company: string, name: string, facts: ProfileFact[]): string {
  const factLines = relevantFacts(facts, label).map(
    (fact) => `For the ${role} role at ${company}, I can account for this and I am not adding to it: ${fact.text.trim()}`,
  );
  let extras = 0;
  let body = assemble(role, company, name, factLines, extras);
  while (wordCount(body) < 150 && extras < FRAMES.length) {
    extras += 1;
    body = assemble(role, company, name, factLines, extras);
  }
  while (wordCount(body) > 250 && extras > 0) {
    extras -= 1;
    body = assemble(role, company, name, factLines, extras);
  }
  return body;
}

function assemble(role: string, company: string, name: string, factLines: string[], extras: number): string {
  const lines = ["Dear hiring team,", ...FRAMES.slice(0, extras).map((frame) => frame(role, company)), ...factLines];
  lines.push(`Thank you for considering my application for the ${role} role at ${company}.`);
  lines.push("Kind regards,");
  if (name) lines.push(name);
  return lines.join("\n\n");
}
