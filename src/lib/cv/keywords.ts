import { words } from "@/lib/applications/words";

const STOP = new Set(
  (
    "the and for with you your our are will that this from have has who what when where which while into about over " +
    "able must should would could also more most other some such than then them they their there these those very " +
    "work working role team teams company job jobs join help across within using use used including include based " +
    "experience years year strong great good excellent ideal candidate looking we us its it's not all any can new " +
    "per day days week weeks time full part remote anywhere world uk europe global salary benefits apply application " +
    "plus etc one two three well make makes making get gets keep keeps ensure ensuring provide providing via"
  ).split(" "),
);

/** Multi-word terms that matter more than a single shared word. */
const PHRASES = [
  "customer support",
  "customer service",
  "customer success",
  "customer experience",
  "technical support",
  "product support",
  "help desk",
  "helpdesk",
  "live chat",
  "ticket queue",
  "ticketing",
  "troubleshooting",
  "problem-solving",
  "problem solving",
  "written english",
  "written communication",
  "subscription",
  "billing",
  "onboarding",
  "escalation",
  "saas",
  "crm",
  "zendesk",
  "intercom",
  "freshdesk",
  "hubspot",
  "salesforce",
  "jira",
  "sql",
  "api",
  "digital marketing",
  "seo",
  "booking systems",
  "websites",
  "customer enquiries",
  "customer-facing",
];

export type Keyword = { term: string; weight: number };

export function jobKeywords(title: string, description: string, limit = 30): Keyword[] {
  const weights = new Map<string, number>();
  const add = (term: string, weight: number) => weights.set(term, (weights.get(term) ?? 0) + weight);
  const lowerTitle = title.toLowerCase();
  const lowerBody = description.toLowerCase();
  for (const phrase of PHRASES) {
    if (lowerTitle.includes(phrase)) add(phrase, 6);
    else if (lowerBody.includes(phrase)) add(phrase, 4);
  }
  for (const token of words(title)) {
    if (token.length >= 3 && !STOP.has(token)) add(token, 3);
  }
  const counts = new Map<string, number>();
  for (const token of words(description)) {
    if (token.length < 3 || STOP.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  for (const [token, count] of counts) add(token, Math.min(count, 4));
  return [...weights.entries()]
    .map(([term, weight]) => ({ term, weight }))
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
    .slice(0, limit);
}

export function keywordScore(text: string, keywords: Keyword[]): number {
  const lower = text.toLowerCase();
  const tokens = new Set(words(text));
  let score = 0;
  for (const keyword of keywords) {
    const hit =
      keyword.term.includes(" ") || keyword.term.includes("-")
        ? lower.includes(keyword.term)
        : tokens.has(keyword.term) || (keyword.term.length >= 6 && [...tokens].some((token) => token.length >= 6 && (token.startsWith(keyword.term) || keyword.term.startsWith(token))));
    if (hit) score += keyword.weight;
  }
  return score;
}
