import { createHash } from "crypto";
import { normalizeForHash } from "@/lib/text";

export function contentHash(company: string, title: string, descriptionText: string): string {
  const joined = [company, title, descriptionText].map((part) => normalizeForHash(part)).join("\n");
  return createHash("sha256").update(joined, "utf8").digest("hex");
}
