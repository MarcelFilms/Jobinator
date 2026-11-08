import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCORING_PROFILE, SEEDED_FACTS, SEEDED_RULES } from "@/lib/profile-defaults";
import { contentHash } from "@/lib/scoring/hash";
import { evaluateListing, scoreOe } from "@/lib/scoring/evaluate";

const profile = DEFAULT_SCORING_PROFILE;

function filler(body: string): string {
  return `${body}\n${"Customer work continues. ".repeat(30)}`;
}

describe("UK eligibility", () => {
  it("rejects Europe when the listing never mentions the UK", () => {
    const decision = evaluateListing({
      source: "jobicy",
      title: "Customer Support",
      descriptionText: filler("Answer customer tickets by email."),
      locationText: "Europe",
      profile,
    });
    expect(decision.ukEligibility).toBe("rejected");
    expect(decision.status).toBe("filtered_out");
    expect(decision.filterReason).toMatch(/^uk_rejected:/);
    expect(decision.fitScore).toBeNull();
  });

  it("accepts a worldwide listing that does not exclude the UK", () => {
    const decision = evaluateListing({
      source: "weworkremotely",
      title: "Customer Support",
      descriptionText: filler("Reply to customers by email and in the ticket queue."),
      locationText: "Anywhere in the World",
      countryText: "",
      profile,
    });
    expect(decision.ukEligibility).toBe("worldwide");
    expect(decision.status).not.toBe("filtered_out");
  });

  it("rejects a country list that omits the UK", () => {
    const decision = evaluateListing({
      source: "weworkremotely",
      title: "Customer Support",
      descriptionText: filler("Work permit from Canada, Finland, or Spain."),
      locationText: "Anywhere in the World",
      countryText: "Canada",
      profile,
    });
    expect(decision.ukEligibility).toBe("rejected");
  });

  it("rejects USA Only", () => {
    const decision = evaluateListing({
      source: "weworkremotely",
      title: "Customer Support",
      descriptionText: filler("Email support for a software product."),
      locationText: "USA Only",
      profile,
    });
    expect(decision.ukEligibility).toBe("rejected");
  });

  it("treats an explicit UK location as eligible", () => {
    const decision = evaluateListing({
      source: "jobicy",
      title: "Customer Support",
      descriptionText: filler("Email and ticket support for a SaaS product."),
      locationText: "UK",
      profile,
    });
    expect(decision.ukEligibility).toBe("explicit_uk");
  });

  it("lets a Reed row in London through when eligibility would otherwise be unknown", () => {
    const decision = evaluateListing({
      source: "reed",
      title: "Customer Support",
      descriptionText: filler("Email support."),
      locationText: "London",
      profile,
    });
    expect(decision.status).not.toBe("filtered_out");
  });

  it("rejects a worldwide role that requires another country", () => {
    const decision = evaluateListing({
      source: "weworkremotely",
      title: "Customer Support",
      descriptionText: filler("Applicants must be based in Germany."),
      locationText: "Anywhere in the World",
      profile,
    });
    expect(decision.ukEligibility).toBe("rejected");
  });
});

describe("stage 1", () => {
  it("does not reject Senior Customer Support as leadership", () => {
    const decision = evaluateListing({
      source: "jobicy",
      title: "Senior Customer Support",
      descriptionText: filler("Handle customer emails and tickets for a software product. Written communication matters."),
      locationText: "UK",
      jobLevel: "Senior",
      profile,
    });
    expect(decision.filterReason ?? "").not.toMatch(/^seniority:/);
    expect(decision.fitReasons.some((reason) => reason.rule === "senior_title" && reason.points === -8)).toBe(true);
  });

  it("rejects Head and Director", () => {
    const head = evaluateListing({
      source: "jobicy",
      title: "Head of Global Support",
      descriptionText: filler("Lead the support organisation."),
      locationText: "UK",
      profile,
    });
    expect(head.filterReason).toMatch(/^seniority:/);
    const director = evaluateListing({
      source: "jobicy",
      title: "Customer Success Manager",
      descriptionText: filler("Own a book of customers."),
      locationText: "UK",
      jobLevel: "Director",
      profile,
    });
    expect(director.filterReason).toMatch(/^seniority:/);
  });

  it("keeps support engineer and rejects a software engineer", () => {
    const support = evaluateListing({
      source: "jobicy",
      title: "Technical Support Engineer",
      descriptionText: filler("Troubleshoot customer tickets by email."),
      locationText: "UK",
      profile,
    });
    expect(support.filterReason ?? "").not.toMatch(/^engineering:/);
    const engineer = evaluateListing({
      source: "jobicy",
      title: "Software Engineer",
      descriptionText: filler("Build the product."),
      locationText: "UK",
      profile,
    });
    expect(engineer.filterReason).toMatch(/^engineering:/);
  });

  it("ignores a preferred degree and rejects a required one", () => {
    const preferred = evaluateListing({
      source: "jobicy",
      title: "Customer Support",
      descriptionText: filler("Requirements\nReply to email tickets.\n\nPreferred\nBachelor's degree"),
      locationText: "UK",
      profile,
    });
    expect(preferred.filterReason ?? "").not.toMatch(/^qualification:/);
    const required = evaluateListing({
      source: "jobicy",
      title: "Customer Support",
      descriptionText: filler("Requirements\nMust have a bachelor's degree.\nReply to email tickets."),
      locationText: "UK",
      profile,
    });
    expect(required.filterReason).toMatch(/^qualification:/);
  });

  it("rejects a required language the profile does not have", () => {
    const decision = evaluateListing({
      source: "jobicy",
      title: "Strategic Customer Success Manager - Italian Speaking",
      descriptionText: filler("Email and tickets."),
      locationText: "UK",
      profile,
    });
    expect(decision.filterReason).toMatch(/Italian/);
  });

  it("rejects a blocked category from the title", () => {
    const decision = evaluateListing({
      source: "jobicy",
      title: "Pastry Chef",
      descriptionText: filler("Kitchen work."),
      locationText: "UK",
      profile,
    });
    expect(decision.filterReason).toMatch(/^category:/);
  });
});

describe("fit and OE", () => {
  it("scores a written support role and leaves OE unknown below two signals", () => {
    const decision = evaluateListing({
      source: "jobicy",
      title: "Customer Support",
      descriptionText: filler("You will answer questions."),
      locationText: "UK",
      profile,
    });
    expect(decision.fitStatus).toBe("scored");
    expect(decision.fitScore).toBe(40);
    expect(decision.oeStatus).toBe("unknown");
    expect(decision.oeScore).toBeNull();
    expect(decision.status).toBe("discovered");
  });

  it("shortlists when the rules clear the minimum and quotes the listing", () => {
    const decision = evaluateListing({
      source: "jobicy",
      title: "Customer Support",
      descriptionText: filler(
        "This SaaS company needs written English. You will answer customer emails and tickets, use Zendesk, and live chat. Troubleshooting is part of the work.",
      ),
      locationText: "UK",
      profile,
    });
    expect(decision.fitScore).toBeGreaterThanOrEqual(55);
    expect(decision.status).toBe("shortlisted");
    expect(decision.fitReasons.every((reason) => reason.quote.length > 0)).toBe(true);
    expect(decision.oeStatus).toBe("scored");
    expect(decision.oeConfidence).toBe("low");
  });

  it("clamps penalties at zero and does not read OE from the title", () => {
    const decision = evaluateListing({
      source: "jobicy",
      title: "Senior Phone Support",
      descriptionText: filler("Night shifts, a quota, and cold calling. Calls are taken on a dialler."),
      locationText: "UK",
      profile,
    });
    expect(decision.fitScore).toBe(0);
    const fromTitleOnly = scoreOe("The team collaborates.");
    expect(fromTitleOnly.status).toBe("unknown");
  });

  it("leaves both scores unknown when the description is thin", () => {
    const decision = evaluateListing({
      source: "jobicy",
      title: "Customer Support",
      descriptionText: "Short advert.",
      locationText: "UK",
      profile,
    });
    expect(decision.fitStatus).toBe("unknown");
    expect(decision.oeStatus).toBe("unknown");
    expect(decision.fitScore).toBeNull();
  });

  it("uses two or more description signals for OE and lowers the score for sync work", () => {
    const text = filler("Reply by email and in the ticket queue. The rota includes phone calls and daily meetings. Webcam on. Time tracking is used.");
    const oe = scoreOe(text);
    expect(oe.status).toBe("scored");
    expect(oe.confidence).toBe("normal");
    expect(oe.score).toBeLessThan(5);
    expect(oe.reasons.every((reason) => reason.quote.length > 0)).toBe(true);
  });
});

describe("new remote boards", () => {
  it("treats Working Nomads as a remote board and leaves an ATS board to the listing text", () => {
    const nomad = evaluateListing({
      source: "workingnomads",
      title: "Customer Support",
      descriptionText: filler("Reply to customers by email and in the ticket queue."),
      locationText: "Anywhere in the World",
      profile,
    });
    expect(nomad.remoteSignal).toBe("board_remote");
    const board = evaluateListing({
      source: "greenhouse",
      title: "Customer Support",
      descriptionText: filler("Reply to customers by email and in the ticket queue."),
      locationText: "Remote, United Kingdom",
      profile,
    });
    expect(board.remoteSignal).toBe("unknown");
    expect(board.ukEligibility).toBe("explicit_uk");
    expect(board.status).not.toBe("filtered_out");
  });
});

describe("content hash", () => {
  it("ignores salary, source, and insignificant whitespace", () => {
    const left = contentHash("Acme", "Customer Support", "<p>Email   support</p>");
    const right = contentHash("Acme", "Customer Support", "email support");
    expect(left).toBe(right);
    expect(left).not.toBe(contentHash("Acme", "Customer Support", "phone support"));
  });
});

describe("seeded profile", () => {
  it("stores the required facts and employer-facing blocks", () => {
    const facts = SEEDED_FACTS.map((fact) => fact.text).join(" ");
    expect(facts).toMatch(/customer support/i);
    expect(facts).toMatch(/Arbonomics/);
    expect(facts).toMatch(/digital marketing/i);
    expect(facts).toMatch(/customer-facing management/i);
    expect(facts).toMatch(/booking systems/i);
    expect(facts).toMatch(/written English/i);
    const rules = SEEDED_RULES.map((rule) => rule.instruction).join(" ");
    expect(rules).toMatch(/do not invent/i);
    expect(rules).toMatch(/Telegram/);
    expect(rules).toMatch(/town, county, or LinkedIn/i);
    expect(rules).toMatch(/overemployment/i);
    expect(SEEDED_RULES.every((rule) => rule.severity === "block" && rule.appliesTo === "employer_text")).toBe(true);
  });

  it("does not add town, county, or LinkedIn columns", () => {
    const sql = readFileSync("supabase/migrations/0001_milestone1.sql", "utf8");
    expect(sql).not.toMatch(/\b(town|county|linkedin_url)\s+text/i);
    expect(sql).toMatch(/create table if not exists public\.jobs/i);
    expect(sql).toMatch(/create table if not exists public\.ai_daily/i);
    expect(sql).toMatch(/ai_enabled = false/);
  });
});
