import { describe, expect, it } from "vitest";
import { formAnswers } from "@/lib/applications/form-answers";
import { blockReason } from "@/lib/sources/html-page";
import { parseLinkedInCards, parseLinkedInDetail } from "@/lib/sources/linkedin";
import { parsePublicJobLinks } from "@/lib/sources/public-boards";
import { parseReedRss, reedCompany } from "@/lib/sources/reed";
import { parseRemoteOk } from "@/lib/sources/remoteok";
import { scoreFit } from "@/lib/scoring/evaluate";
import { thresholdForDailyTarget } from "@/lib/scoring/threshold";

const RSS = `<?xml version="1.0"?><rss><channel>
<item><guid>10</guid><title>Customer Support Agent</title>
<link>http://www.reed.co.uk/jobs/customer-support-agent/10</link>
<description>Evlo are currently recruiting. Reply to customers by email at jobs@evlo.example. Home based in the UK.</description>
<a10:updated>2026-11-08T12:00:00Z</a10:updated></item>
<item><guid>11</guid><title>Software Engineer</title>
<link>https://www.reed.co.uk/jobs/software-engineer/11</link>
<description>Build services.</description></item>
</channel></rss>`;

describe("Reed public RSS", () => {
  it("keeps support roles, marks them as UK, and finds a hiring address", () => {
    const [listing] = parseReedRss(RSS);
    expect(parseReedRss(RSS)).toHaveLength(1);
    expect(listing.externalId).toBe("10");
    expect(listing.canonicalUrl).toBe("https://www.reed.co.uk/jobs/customer-support-agent/10");
    expect(listing.companyName).toBe("Evlo");
    expect(listing.locationText).toBe("United Kingdom");
    expect(listing.applicationEmail).toBe("jobs@evlo.example");
    expect(reedCompany("Are you looking for a fresh start?")).toBe("");
  });
});

describe("LinkedIn guest cards", () => {
  const html = `
    <div data-entity-urn="urn:li:jobPosting:99">
      <a href="https://uk.linkedin.com/jobs/view/customer-support-at-acme-99?position=1">
        <span class="sr-only">Customer Support</span>
      </a>
      <h3 class="base-search-card__title">Customer Support Agent</h3>
      <h4 class="base-search-card__subtitle"><a href="/company/acme">Acme</a></h4>
      <span class="job-search-card__location">London, England, United Kingdom</span>
    </div>`;

  it("reads the public card", () => {
    const [card] = parseLinkedInCards(html);
    expect(card.id).toBe("99");
    expect(card.title).toBe("Customer Support Agent");
    expect(card.company).toBe("Acme");
    expect(card.location).toContain("United Kingdom");
  });

  it("reads a public description and stops when the description is missing", () => {
    const card = parseLinkedInCards(html)[0];
    const description = `<div class="show-more-less-html__markup"><p>${"Reply to customers by email. ".repeat(20)}</p></div><button>`;
    const listing = parseLinkedInDetail(description, card);
    expect(listing?.descriptionText).toMatch(/email/i);
    expect(parseLinkedInDetail("<html>sign in</html>", card)).toBeNull();
  });
});

describe("blocked public pages", () => {
  it("stops on a block and does not treat a long page that mentions sign-in as a wall", () => {
    expect(blockReason(403, "no")).toBe("HTTP 403");
    expect(blockReason(200, "please solve the captcha")).toBe("CAPTCHA");
    expect(blockReason(200, `${"job ".repeat(2000)} sign in`)).toBeNull();
  });

  it("pulls support titles from a readable listing page", () => {
    const html = `<a href="/job/customer-support-1">Customer Support Agent</a><a href="/job/engineer">Backend Engineer</a>`;
    const listings = parsePublicJobLinks("indeed", html, "https://uk.indeed.com/jobs");
    expect(listings).toHaveLength(1);
    expect(listings[0].canonicalUrl).toContain("indeed.com/job/customer-support-1");
  });
});

describe("other public feeds", () => {
  it("skips the Remote OK legal header and keeps a support role", () => {
    const listings = parseRemoteOk([
      { legal: "link back" },
      { id: "5", position: "Customer Support", company: "North", description: "<p>Email support.</p>", location: "", url: "https://remoteok.com/remote-jobs/5" },
    ]);
    expect(listings).toHaveLength(1);
    expect(listings[0].locationText).toBe("Worldwide");
  });
});

describe("daily fit target", () => {
  it("keeps the 15th score when more than 15 clear the floor", () => {
    const scores = [90, 80, 70, 60, 55, 50, 48, 46, 44, 42, 40, 40, 40, 36, 32, 28, 10];
    expect(thresholdForDailyTarget(scores)).toEqual({ threshold: 32, passing: 15 });
  });

  it("passes every job at or above 28 when fewer than 15 exist", () => {
    expect(thresholdForDailyTarget([70, 40, 20])).toEqual({ threshold: 40, passing: 2 });
    expect(thresholdForDailyTarget([10, 0])).toBeNull();
  });
});

describe("widened titles and form answers", () => {
  it("gives a moderator title the support points", () => {
    const fit = scoreFit("Content Moderator", "Reply to customers by email and in the ticket queue.");
    expect(fit.reasons.some((reason) => reason.rule === "title_support" && reason.points === 40)).toBe(true);
  });

  it("copies stored facts and does not invent a job history", () => {
    const answers = formAnswers({
      title: "Customer Support",
      company: "Acme",
      facts: [{ kind: "skill", text: "Customer support and customer-facing experience.", organisation: null, start: null, end: null }],
    });
    expect(answers[1].answer).toBe("Customer support and customer-facing experience.");
    expect(answers.map((answer) => answer.answer).join(" ")).not.toMatch(/years at|I led a team of \d+/i);
  });
});
