import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { SEEDED_FACTS, SEEDED_RULES } from "@/lib/profile-defaults";
import { prepareTemplate, relevantFacts } from "@/lib/applications/template";
import { validateApplication } from "@/lib/applications/validate";
import { wordCount } from "@/lib/applications/words";

const cvText = SEEDED_FACTS.map((fact) => fact.text).join("\n");

function draft(title: string, company = "Acme") {
  return prepareTemplate({
    title,
    company,
    facts: SEEDED_FACTS,
    cvText,
    rules: SEEDED_RULES,
    qualificationsAbsent: ["a university degree"],
  });
}

describe("standard templates", () => {
  it("fills company, role, and approved facts into a 150–250 word letter", () => {
    for (const title of ["Customer Support", "Technical Support", "Digital Marketing Manager", "Office Coordinator"]) {
      const result = draft(title);
      expect(result.validation.callsModel).toBe(false);
      expect(result.validation.method).toBe("deterministic");
      expect(result.validation.passed, JSON.stringify(result.validation.findings, null, 2)).toBe(true);
      expect(result.validation.status).toBe("drafted");
      expect(wordCount(result.body)).toBeGreaterThanOrEqual(150);
      expect(wordCount(result.body)).toBeLessThanOrEqual(250);
      expect(result.body).toContain("Acme");
      expect(result.body).toContain(title);
      expect(result.subject).toBe(`Application for ${title} at Acme`);
    }
  });

  it("does not pull a fact into the wrong category", () => {
    const support = draft("Customer Support");
    expect(support.label).toBe("customer_support");
    expect(support.body).toContain("Running Arbonomics");
    expect(support.body).not.toContain("Professional digital marketing experience.");
    const marketing = draft("Digital Marketing Manager");
    expect(marketing.label).toBe("digital_marketing");
    expect(marketing.body).toContain("Professional digital marketing experience.");
    expect(marketing.body).not.toContain("Running Arbonomics");
  });

  it("drops a fact the profile does not contain", () => {
    const facts = SEEDED_FACTS.filter((fact) => !/marketing/i.test(fact.text));
    expect(relevantFacts(facts, "digital_marketing").some((fact) => /marketing/i.test(fact.text))).toBe(false);
    const result = prepareTemplate({
      title: "Digital Marketing Manager",
      company: "Acme",
      facts,
      cvText: "",
      rules: SEEDED_RULES,
    });
    expect(result.body).not.toContain("Professional digital marketing experience.");
  });

  it("does not mention private or prohibited material", () => {
    const body = draft("Customer Support").body;
    expect(body).not.toMatch(/\bOE\b|overemployment|LinkedIn|Telegram|\btown\b|\bcounty\b|second job/i);
  });
});

describe("deterministic validator", () => {
  it("removes an unsupported claim and flags the letter", () => {
    const clean = draft("Customer Support");
    const dirty = editedValidation(clean.body + "\n\nI won a national award in 2019 and hold a bachelor's degree.");
    expect(dirty.body).not.toContain("national award");
    expect(dirty.body).not.toContain("bachelor");
    expect(dirty.passed).toBe(false);
    expect(dirty.status).toBe("needs_review");
    expect(dirty.requiresManualReview).toBe(true);
    expect(dirty.findings.some((finding) => finding.verdict === "unsupported" && finding.claim.includes("national award"))).toBe(true);
    expect(clean.validation.passed).toBe(true);
  });

  it("flags a prohibited OE sentence", () => {
    const base = draft("Customer Support");
    const dirty = editedValidation(base.body + "\n\nI am interested in overemployment and a second job.");
    expect(dirty.body).not.toContain("overemployment");
    expect(dirty.findings.some((finding) => finding.verdict === "prohibited")).toBe(true);
    expect(dirty.passed).toBe(false);
    expect(dirty.callsModel).toBe(false);
  });

  it("stores a support span from the profile", () => {
    const result = draft("Customer Support");
    const fact = result.validation.findings.find((finding) => finding.claim.includes("Running Arbonomics"));
    expect(fact?.verdict).toBe("supported");
    expect(fact?.span).toMatch(/arbonomics/i);
  });
});

function editedValidation(body: string) {
  return validateApplication({
    subject: "Application for Customer Support at Acme",
    body,
    company: "Acme",
    role: "Customer Support",
    displayName: "",
    facts: SEEDED_FACTS,
    cvText,
    rules: SEEDED_RULES,
    qualificationsAbsent: ["a university degree"],
    yearsCustomerFacing: null,
    fallbackSubject: "Application for Customer Support at Acme",
  });
}

describe("no model client", () => {
  it("keeps the template and validator free of a provider call", () => {
    for (const file of ["template.ts", "validate.ts", "personalize.ts"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/fetch\(|openai|anthropic|generateText|OPENAI|MODEL_API/);
    }
  });
});
