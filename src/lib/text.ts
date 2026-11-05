const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
    const key = body.toLowerCase();
    if (NAMED_ENTITIES[key]) return NAMED_ENTITIES[key];
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return entity;
  });
}

export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(withoutBlocks)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeForHash(value: string): string {
  return htmlToText(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function quoteSpan(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + length + 70);
  let slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) slice = `…${slice}`;
  if (end < text.length) slice = `${slice}…`;
  return slice.slice(0, 180);
}

export function firstMatch(text: string, pattern: RegExp): { index: number; length: number; value: string } | null {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const match = re.exec(text);
  if (!match || match.index === undefined) return null;
  return { index: match.index, length: match[0].length, value: match[0] };
}
