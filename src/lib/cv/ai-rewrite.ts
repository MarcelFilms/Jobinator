import type { Keyword } from "@/lib/cv/keywords";
import type { TailoredCv } from "@/lib/cv/tailor";

export type AiSettings = {
  ai_enabled: boolean | null;
  daily_spend_cap_gbp: number | string | null;
  monthly_spend_cap_gbp: number | string | null;
  provider_base_url: string | null;
  cheap_model: string | null;
  model_prices: Record<string, { input_gbp_per_mtok?: number; output_gbp_per_mtok?: number }> | null;
};

export type AiGate =
  | { allowed: true; model: string; baseUrl: string; apiKey: string; inputPrice: number; outputPrice: number; maxCostGbp: number }
  | { allowed: false; reason: string; outcome: "blocked_disabled" | "blocked_cap" };

export const MAX_INPUT_TOKENS = 6000;
export const MAX_OUTPUT_TOKENS = 1500;

/**
 * Optional model rewording is allowed only when AI is on, both caps are above
 * zero, a provider and price are configured, a key exists, and the worst-case
 * cost of this call fits under what is left of both caps.
 */
export function aiRewriteGate(settings: AiSettings | null, apiKey: string | undefined, spentTodayGbp: number, spentMonthGbp: number): AiGate {
  const daily = Number(settings?.daily_spend_cap_gbp ?? 0);
  const monthly = Number(settings?.monthly_spend_cap_gbp ?? 0);
  if (!settings?.ai_enabled) return { allowed: false, reason: "AI is off", outcome: "blocked_disabled" };
  if (!(daily > 0) || !(monthly > 0)) return { allowed: false, reason: "A spending cap is 0.", outcome: "blocked_disabled" };
  const model = settings.cheap_model?.trim();
  const baseUrl = settings.provider_base_url?.trim();
  if (!model || !baseUrl) return { allowed: false, reason: "No model or provider is set.", outcome: "blocked_disabled" };
  if (!apiKey) return { allowed: false, reason: "No AI_API_KEY is set on the server.", outcome: "blocked_disabled" };
  const price = settings.model_prices?.[model];
  const inputPrice = Number(price?.input_gbp_per_mtok);
  const outputPrice = Number(price?.output_gbp_per_mtok);
  if (!(inputPrice >= 0) || !(outputPrice >= 0) || !Number.isFinite(inputPrice) || !Number.isFinite(outputPrice)) {
    return { allowed: false, reason: `No price is set for ${model}, so the cap cannot be enforced.`, outcome: "blocked_disabled" };
  }
  const maxCostGbp = (MAX_INPUT_TOKENS * inputPrice + MAX_OUTPUT_TOKENS * outputPrice) / 1_000_000;
  if (spentTodayGbp + maxCostGbp > daily || spentMonthGbp + maxCostGbp > monthly) {
    return { allowed: false, reason: "This call could pass a spending cap.", outcome: "blocked_cap" };
  }
  return { allowed: true, model, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, inputPrice, outputPrice, maxCostGbp };
}

export type RewriteLine = { id: string; text: string };

export function rewriteCandidates(cv: TailoredCv): RewriteLine[] {
  const lines: RewriteLine[] = [];
  cv.sections.forEach((section, s) => {
    if (section.kind === "summary") section.items.forEach((text, i) => lines.push({ id: `s${s}.i${i}`, text }));
    section.entries.forEach((entry, e) => entry.bullets.forEach((text, b) => lines.push({ id: `s${s}.e${e}.b${b}`, text })));
  });
  return lines;
}

export function applyRewrites(cv: TailoredCv, rewrites: Map<string, string>): TailoredCv {
  return {
    ...cv,
    sections: cv.sections.map((section, s) => ({
      ...section,
      items: section.items.map((text, i) => (section.kind === "summary" ? (rewrites.get(`s${s}.i${i}`) ?? text) : text)),
      entries: section.entries.map((entry, e) => ({
        ...entry,
        bullets: entry.bullets.map((text, b) => rewrites.get(`s${s}.e${e}.b${b}`) ?? text),
      })),
    })),
  };
}

const SYSTEM = [
  "You reword CV lines for one job application.",
  "Return JSON: {\"lines\":[{\"id\":\"...\",\"text\":\"...\"}]} with the same ids.",
  "Keep every fact exactly as given. Do not add employers, job titles, dates, numbers, qualifications, tools, results, or achievements.",
  "You may only swap a verb for a close synonym, drop a leading 'I', or add one of: effectively, proactively, promptly, clearly, confidently, carefully.",
  "Do not mention a town, county, LinkedIn, Telegram, user counts, AI tools, overemployment, or a second job.",
  "Lines that cannot be improved under these limits must be returned unchanged.",
].join(" ");

export type RewriteOutcome = { rewrites: Map<string, string>; inputTokens: number; outputTokens: number; costGbp: number };

export async function requestRewrites(
  gate: Extract<AiGate, { allowed: true }>,
  lines: RewriteLine[],
  keywords: Keyword[],
  fetchImpl: typeof fetch = fetch,
): Promise<RewriteOutcome> {
  const payload = JSON.stringify({ keywords: keywords.slice(0, 15).map((k) => k.term), lines });
  if (payload.length / 3 > MAX_INPUT_TOKENS) throw new Error("The CV is too long for the token budget.");
  const response = await fetchImpl(`${gate.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${gate.apiKey}` },
    body: JSON.stringify({
      model: gate.model,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: payload },
      ],
    }),
  });
  if (!response.ok) throw new Error(`The model provider returned HTTP ${response.status}.`);
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const inputTokens = Math.min(Number(body.usage?.prompt_tokens ?? MAX_INPUT_TOKENS), MAX_INPUT_TOKENS * 2);
  const outputTokens = Math.min(Number(body.usage?.completion_tokens ?? MAX_OUTPUT_TOKENS), MAX_OUTPUT_TOKENS * 2);
  const costGbp = (inputTokens * gate.inputPrice + outputTokens * gate.outputPrice) / 1_000_000;
  const rewrites = new Map<string, string>();
  try {
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as { lines?: Array<{ id?: unknown; text?: unknown }> };
    const ids = new Set(lines.map((line) => line.id));
    for (const line of parsed.lines ?? []) {
      if (typeof line.id === "string" && typeof line.text === "string" && ids.has(line.id) && line.text.trim()) {
        rewrites.set(line.id, line.text.trim().slice(0, 400));
      }
    }
  } catch {
    // An unreadable reply leaves the rules-based wording in place.
  }
  return { rewrites, inputTokens, outputTokens, costGbp };
}
