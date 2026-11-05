import { describe, expect, it } from "vitest";
import { parseJobicyJobs } from "@/lib/sources/jobicy";
import { parseWeworkremotelyRss } from "@/lib/sources/weworkremotely";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>We Work Remotely: Customer Support Jobs</title>
    <item>
      <title>Northwind: Customer Support</title>
      <region>Anywhere in the World</region>
      <country></country>
      <category>Customer Support</category>
      <type>Full-Time</type>
      <description>&lt;p&gt;Reply to customers by email. Salary £28,000 a year. Write to jobs@northwind.example.&lt;/p&gt;</description>
      <pubDate>Tue, 03 Nov 2026 12:00:00 +0000</pubDate>
      <expires_at>Thu, 03 Dec 2026 12:00:00 +0000</expires_at>
      <guid>https://weworkremotely.com/remote-jobs/northwind-customer-support</guid>
      <link>https://weworkremotely.com/remote-jobs/northwind-customer-support</link>
    </item>
  </channel>
</rss>`;

describe("source parsers", () => {
  it("reads a We Work Remotely item and keeps the raw salary phrase", () => {
    const [listing] = parseWeworkremotelyRss(RSS);
    expect(listing.companyName).toBe("Northwind");
    expect(listing.title).toBe("Customer Support");
    expect(listing.canonicalUrl).toContain("weworkremotely.com");
    expect(listing.locationText).toBe("Anywhere in the World");
    expect(listing.salaryMin).toBeNull();
    expect(listing.salaryText).toMatch(/£28,000/);
    expect(listing.salaryIsAdvertised).toBe(true);
    expect(listing.applicationEmail).toBe("jobs@northwind.example");
    expect(listing.descriptionText).toMatch(/email/i);
    expect(listing.raw.skills).toBe("");
  });

  it("keeps Jobicy salary currency and does not invent a conversion", () => {
    const parsed = parseJobicyJobs({
      jobs: [
        {
          id: 158720,
          url: "https://jobicy.com/jobs/158720-head-of-global-support",
          jobTitle: "Head of Global Support",
          companyName: "Cloudbeds",
          jobGeo: "LATAM, Canada, Europe, USA",
          jobLevel: "Senior",
          jobType: ["Full-Time"],
          jobDescription: "<p>Support the hotels.</p>",
          pubDate: "2026-11-03T15:21:44+00:00",
          salaryMin: 160000,
          salaryMax: 220000,
          salaryCurrency: "USD",
          salaryPeriod: "yearly",
        },
      ],
      nextCursor: "abc",
      hasMore: true,
    });
    expect(parsed.hasMore).toBe(true);
    expect(parsed.nextCursor).toBe("abc");
    expect(parsed.listings[0].salaryCurrency).toBe("USD");
    expect(parsed.listings[0].salaryMin).toBe(160000);
    expect(parsed.listings[0].salaryPeriod).toBe("yearly");
    expect(parsed.listings[0].applicationUrl).toBe("https://jobicy.com/jobs/158720-head-of-global-support");
  });
});
