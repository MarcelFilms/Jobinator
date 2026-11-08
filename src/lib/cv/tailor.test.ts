import { describe, expect, it } from "vitest";
import { DEFAULT_QUALIFICATIONS_ABSENT, SEEDED_FACTS, SEEDED_RULES } from "@/lib/profile-defaults";
import { aiRewriteGate, applyRewrites, requestRewrites, rewriteCandidates, type AiSettings } from "@/lib/cv/ai-rewrite";
import { renderCvPdf } from "@/lib/cv/render-pdf";
import { rewordLine } from "@/lib/cv/reword";
import { cvPlainText, tailorCv, type TailoredCv } from "@/lib/cv/tailor";
import { createCvJudge, validateTailoredCv } from "@/lib/cv/validate-cv";

const BASE = `Sam Carter
Leeds | 07700 900123 | sam.carter@example.org | linkedin.com/in/samcarter

PROFILE
Friendly customer support specialist with a calm approach to busy inboxes.

EXPERIENCE
Customer Support Advisor | Brightdesk Ltd | Leeds
March 2021 – Present
• Helped customers by email and live chat through a Zendesk ticket queue.
• Dealt with billing and subscription questions for small businesses.
• Ran the weekly stock count for the office.
• Fixed login problems with clear written guides.

Shop Assistant | Corner Books
2018 – 2021
• Served customers at the till.
• Looked after online orders and returns.

KEY SKILLS
Zendesk, Live chat, Email support, Stock control, Troubleshooting

EDUCATION
BTEC Level 3 Business, Park Lane College

INTERESTS
Running, Telegram groups`;

const JOB = {
  jobTitle: "Customer Support Specialist",
  jobDescription:
    "Answer customer questions by email and live chat in Zendesk. Help with billing and subscription issues and troubleshooting login problems. Written English matters.",
};

const context = {
  baseCvText: BASE,
  facts: SEEDED_FACTS,
  displayName: "",
  contactEmail: null,
  rules: SEEDED_RULES,
  qualificationsAbsent: DEFAULT_QUALIFICATIONS_ABSENT,
};

function tailored() {
  return tailorCv({ ...context, ...JOB });
}

describe("tailored CV", () => {
  it("reorders and rewords the owner's own bullets for the job and passes the validator", () => {
    const { cv, keywords } = tailored();
    expect(keywords.map((k) => k.term)).toContain("zendesk");
    const experience = cv.sections.find((section) => section.kind === "experience");
    const first = experience?.entries[0];
    expect(first?.header[0]).toBe("Customer Support Advisor · Brightdesk Ltd");
    expect(first?.header[1]).toBe("March 2021 – Present");
    expect(first?.bullets[0]).toMatch(/^Supported customers by email and live chat/);
    expect(first?.bullets).toContain("Handled billing and subscription questions for small businesses.");
    expect(first?.bullets).not.toContain("Ran the weekly stock count for the office.");
    const skills = cv.sections.find((section) => section.kind === "skills");
    const order = skills?.items ?? [];
    expect(order.indexOf("Zendesk")).toBeLessThan(order.indexOf("Stock control"));
    expect(order.indexOf("Live chat")).toBeLessThan(order.indexOf("Stock control"));
    expect(order[order.length - 1]).toBe("Stock control");
    const result = validateTailoredCv({ ...context, cv });
    expect(result.passed).toBe(true);
    expect(result.callsModel).toBe(false);
    expect(result.textHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the email and phone and drops the town, LinkedIn, and Telegram", () => {
    const { cv, omitted } = tailored();
    expect(cv.name).toBe("Sam Carter");
    expect(cv.contact).toEqual(["07700 900123", "sam.carter@example.org"]);
    const text = cvPlainText(cv);
    expect(text).not.toMatch(/leeds|linkedin|telegram/i);
    expect(omitted.some((item) => /town, county/.test(item.reason))).toBe(true);
  });

  it("uses the Arbonomics fact when the base CV has no experience bullets", () => {
    const { cv } = tailorCv({ ...context, baseCvText: "Sam Carter\nsam.carter@example.org", ...JOB });
    const experience = cv.sections.find((section) => section.kind === "experience");
    expect(experience?.entries.some((entry) => entry.header[0] === "Arbonomics")).toBe(true);
    expect(validateTailoredCv({ ...context, baseCvText: "Sam Carter\nsam.carter@example.org", cv }).passed).toBe(true);
  });

  it("renders a PDF", async () => {
    const bytes = await renderCvPdf(tailored().cv, "CV");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("CV validator", () => {
  const withLine = (mutate: (cv: TailoredCv) => void) => {
    const cv = structuredClone(tailored().cv);
    mutate(cv);
    return validateTailoredCv({ ...context, cv });
  };
  const firstEntry = (cv: TailoredCv) => cv.sections.find((section) => section.kind === "experience")!.entries[0];

  it("rejects an invented employer, title, or date", () => {
    expect(withLine((cv) => firstEntry(cv).header.push("Senior Support Lead | Google")).passed).toBe(false);
    expect(withLine((cv) => (firstEntry(cv).header[1] = "March 2015 – Present")).passed).toBe(false);
  });

  it("rejects an invented achievement or a stretched bullet", () => {
    const invented = withLine((cv) => firstEntry(cv).bullets.push("Cut response times by 40%."));
    expect(invented.passed).toBe(false);
    expect(invented.cv.sections.flatMap((s) => s.entries.flatMap((e) => e.bullets))).not.toContain("Cut response times by 40%.");
    expect(withLine((cv) => firstEntry(cv).bullets.push("Successfully handled billing and subscription questions for small businesses.")).passed).toBe(false);
    expect(withLine((cv) => firstEntry(cv).bullets.push("Handled billing and subscription questions for 500 businesses.")).passed).toBe(false);
    expect(withLine((cv) => firstEntry(cv).bullets.push("Handled billing questions")).passed).toBe(false);
  });

  it("allows a manner word that adds no fact", () => {
    expect(withLine((cv) => firstEntry(cv).bullets.push("Promptly handled billing and subscription questions for small businesses.")).passed).toBe(true);
  });

  it("rejects qualifications the profile says are absent", () => {
    const result = withLine((cv) => cv.sections.find((s) => s.kind === "education")!.items.push("BSc degree in Computing"));
    expect(result.passed).toBe(false);
  });

  it("blocks Telegram, user counts, AI tools, LinkedIn, and an unnamed software business", () => {
    const cases = [
      "Ran Telegram groups for Arbonomics.",
      "Grew Arbonomics to 4,000 users.",
      "Built websites with GitHub Copilot.",
      "Running a subscription-based software business.",
    ];
    for (const line of cases) {
      const result = withLine((cv) => firstEntry(cv).bullets.push(line));
      expect(result.passed, line).toBe(false);
      expect(result.findings.some((f) => f.claim === line && f.verdict !== "supported"), line).toBe(true);
    }
    expect(withLine((cv) => cv.contact.push("linkedin.com/in/samcarter")).passed).toBe(false);
    expect(withLine((cv) => firstEntry(cv).header.push("Brightdesk Ltd · West Yorkshire")).passed).toBe(false);
  });

  it("only rewords with the listed verb swaps", () => {
    expect(rewordLine("I helped customers")).toBe("Supported customers");
    expect(rewordLine("Worked on a fixed-term contract")).toBe("Worked on a fixed-term contract");
  });
});

describe("optional AI rewording", () => {
  const on: AiSettings = {
    ai_enabled: true,
    daily_spend_cap_gbp: 1,
    monthly_spend_cap_gbp: 10,
    provider_base_url: "https://provider.test/v1",
    cheap_model: "small-model",
    model_prices: { "small-model": { input_gbp_per_mtok: 0.1, output_gbp_per_mtok: 0.4 } },
  };

  it("stays off unless AI is on, both caps are above 0, and a key and price exist", () => {
    expect(aiRewriteGate(null, "key", 0, 0)).toMatchObject({ allowed: false, reason: "AI is off" });
    expect(aiRewriteGate({ ...on, ai_enabled: false }, "key", 0, 0)).toMatchObject({ allowed: false, reason: "AI is off" });
    expect(aiRewriteGate({ ...on, daily_spend_cap_gbp: 0 }, "key", 0, 0)).toMatchObject({ allowed: false });
    expect(aiRewriteGate(on, undefined, 0, 0)).toMatchObject({ allowed: false });
    expect(aiRewriteGate({ ...on, model_prices: {} }, "key", 0, 0)).toMatchObject({ allowed: false });
    expect(aiRewriteGate(on, "key", 0.9999, 0)).toMatchObject({ allowed: false, outcome: "blocked_cap" });
    expect(aiRewriteGate(on, "key", 0, 0)).toMatchObject({ allowed: true, model: "small-model" });
  });

  it("keeps a model line only when the validator accepts it", async () => {
    const gate = aiRewriteGate(on, "key", 0, 0);
    if (!gate.allowed) throw new Error("gate should be open");
    const { cv, keywords } = tailored();
    const lines = rewriteCandidates(cv);
    const bullet = lines.find((line) => line.text.startsWith("Handled billing"))!;
    const other = lines.find((line) => line.id !== bullet.id && line.id.includes(".e"))!;
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  lines: [
                    { id: bullet.id, text: `Proactively ${bullet.text.charAt(0).toLowerCase()}${bullet.text.slice(1)}` },
                    { id: other.id, text: "Led a team of 12 and won employee of the year." },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 800, completion_tokens: 200 },
        }),
        { status: 200 },
      )) as typeof fetch;
    const outcome = await requestRewrites(gate, lines, keywords, fakeFetch);
    expect(outcome.costGbp).toBeCloseTo((800 * 0.1 + 200 * 0.4) / 1_000_000);
    const judge = createCvJudge(context);
    const accepted = new Map([...outcome.rewrites].filter(([, text]) => judge("bullet", text)));
    expect([...accepted.keys()]).toEqual([bullet.id]);
    const merged = applyRewrites(cv, accepted);
    expect(validateTailoredCv({ ...context, cv: merged }).passed).toBe(true);
  });
});
