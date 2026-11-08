import { words } from "@/lib/applications/words";

/**
 * Meaning-preserving verb swaps. Each group is treated as equivalent by the CV
 * validator, so a reworded line still has to match the owner's own text.
 * The first entry in a group is the wording the tailor writes.
 */
export const REWORD_GROUPS: string[][] = [
  ["supported", "helped", "assisted"],
  ["handled", "dealt with"],
  ["collaborated with", "worked with", "worked alongside"],
  ["managed", "looked after", "oversaw"],
  ["owned", "was responsible for", "responsible for"],
  ["communicated with", "talked to", "spoke with"],
  ["resolved", "sorted out", "fixed"],
  ["delivered", "carried out"],
];

const CANONICAL = new Map<string, string>();
REWORD_GROUPS.forEach((group, index) => {
  for (const phrase of group) CANONICAL.set(phrase, `§${index}`);
});
const PHRASE_TOKENS = [...CANONICAL.keys()]
  .map((phrase) => ({ phrase, tokens: words(phrase) }))
  .sort((a, b) => b.tokens.length - a.tokens.length);

/** Words with every equivalent verb phrase collapsed onto one token. */
export function canonicalWords(text: string): string[] {
  const tokens = words(text);
  const out: string[] = [];
  for (let index = 0; index < tokens.length; ) {
    const match = PHRASE_TOKENS.find(({ tokens: phrase }) => phrase.every((token, offset) => tokens[index + offset] === token));
    if (match) {
      out.push(CANONICAL.get(match.phrase) as string);
      index += match.tokens.length;
    } else {
      out.push(tokens[index]);
      index += 1;
    }
  }
  return out;
}

function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Rules-based rewording: drop a leading "I", swap to the stronger verb, tidy the ending. */
export function rewordLine(line: string): string {
  let text = line.replace(/\s+/g, " ").trim();
  text = text.replace(/^I\s+(?:was\s+)?/i, "");
  for (const group of REWORD_GROUPS) {
    const target = group[0];
    for (const phrase of group.slice(1)) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      text = text.replace(new RegExp(`\\b${escaped}\\b(?!-)`, "gi"), target);
    }
  }
  text = capitalise(text.replace(/[;,]\s*$/, ""));
  return text;
}
