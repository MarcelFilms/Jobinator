export function words(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return words(text).length;
}

export function oneLine(value: string, max = 160): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}
