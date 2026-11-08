import type { ProfileFact } from "@/lib/profile-defaults";

export type FormAnswer = { field: string; answer: string };

/**
 * Answers the owner can paste into a public application form.
 * Every experience sentence is a stored fact. This does not open a browser,
 * log in, or submit the form.
 */
export function formAnswers(input: { title: string; company: string; facts: ProfileFact[] }): FormAnswer[] {
  const facts = input.facts.map((fact) => fact.text.trim()).filter(Boolean);
  const experience = facts.join(" ");
  const company = input.company.trim() || "the company";
  return [
    {
      field: "Why this role",
      answer: `I am applying for ${input.title} at ${company}. ${experience}`.trim(),
    },
    {
      field: "Relevant experience",
      answer: experience || "No approved facts are stored yet.",
    },
    {
      field: "How to send this",
      answer: "Paste these answers into the form on the source page. Jobinator does not submit the form.",
    },
  ];
}
