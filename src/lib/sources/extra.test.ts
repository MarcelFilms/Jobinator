import { describe, expect, it } from "vitest";
import { decideAutoSend } from "@/lib/applications/auto-send";
import { parseAshbyBoard } from "@/lib/sources/ashby";
import { extractApplicationEmail } from "@/lib/sources/extract";
import { parseGreenhouseJob } from "@/lib/sources/greenhouse";
import { parseLeverPostings } from "@/lib/sources/lever";
import { parseRemotive } from "@/lib/sources/remotive";
import { parseWorkingNomads } from "@/lib/sources/workingnomads";

const description = "<p>Reply to customers by email about the product. Write to jobs@northwind.example.</p>";

describe("extra public sources", () => {
  it("keeps a Working Nomads customer-success row and drops a developer role", () => {
    const listings = parseWorkingNomads([
      {
        url: "https://www.workingnomads.com/job/go/1/",
        title: "Backend Engineer",
        company_name: "Example",
        category_name: "Development",
        location: "Worldwide",
        description: "<p>Build services.</p>",
        pub_date: "2026-11-01T00:00:00-04:00",
      },
      {
        url: "https://www.workingnomads.com/job/go/2/",
        title: "Customer Support Specialist",
        company_name: "Northwind",
        category_name: "Customer Success",
        location: "United Kingdom",
        description,
        pub_date: "2026-11-02T00:00:00-04:00",
      },
    ]);
    expect(listings).toHaveLength(1);
    expect(listings[0].source).toBe("workingnomads");
    expect(listings[0].externalId).toBe("https://www.workingnomads.com/job/go/2/");
    expect(listings[0].applicationEmail).toBe("jobs@northwind.example");
    expect(listings[0].canonicalUrl).toContain("workingnomads.com");
  });

  it("keeps Remotive rows only when the category itself is customer service", () => {
    const listings = parseRemotive({
      jobs: [
        {
          id: 1,
          title: "Backend Engineer",
          category: "Software Development",
          company_name: "Example",
          url: "https://remotive.com/remote-jobs/software-dev/backend",
          description: "<p>Build it.</p>",
          candidate_required_location: "Worldwide",
        },
        {
          id: 2,
          title: "Customer Service Representative",
          category: "Customer Service",
          company_name: "Northwind",
          url: "https://remotive.com/remote-jobs/customer-service/rep",
          description,
          candidate_required_location: "Worldwide",
          publication_date: "2026-11-07T01:10:55",
        },
      ],
    });
    expect(listings).toHaveLength(1);
    expect(listings[0].source).toBe("remotive");
    expect(listings[0].raw.attribution).toBe("Remotive");
    expect(listings[0].canonicalUrl).toContain("remotive.com");
  });

  it("maps a Greenhouse job onto the board and the public URL", () => {
    const listing = parseGreenhouseJob("gitlab", {
      id: 10,
      title: "Technical Support Engineer",
      company_name: "GitLab",
      absolute_url: "https://job-boards.greenhouse.io/gitlab/jobs/10",
      location: { name: "Remote, United Kingdom" },
      content: description,
      first_published: "2026-11-01T00:00:00Z",
    });
    expect(listing?.externalId).toBe("gitlab:10");
    expect(listing?.companyName).toBe("GitLab");
    expect(listing?.locationText).toBe("Remote, United Kingdom");
    expect(listing?.canonicalUrl).toContain("greenhouse.io");
  });

  it("drops a Greenhouse engineering title", () => {
    expect(
      parseGreenhouseJob("gitlab", {
        id: 11,
        title: "Backend Engineer",
        absolute_url: "https://job-boards.greenhouse.io/gitlab/jobs/11",
        content: description,
      }),
    ).toBeNull();
  });

  it("maps a Lever posting and an Ashby job", () => {
    const lever = parseLeverPostings("spotify", [
      {
        id: "abc",
        text: "Customer Support Specialist",
        hostedUrl: "https://jobs.lever.co/spotify/abc",
        applyUrl: "https://jobs.lever.co/spotify/abc/apply",
        description: description,
        categories: { location: "London", commitment: "Permanent" },
        country: "GB",
        createdAt: "1762000000000",
      },
    ]);
    expect(lever[0].externalId).toBe("spotify:abc");
    expect(lever[0].locationText).toBe("London");
    expect(lever[0].publishedAt).toMatch(/^2025-/);
    const ashby = parseAshbyBoard("notion", {
      jobs: [
        {
          id: "job-1",
          title: "Product Support Specialist",
          jobUrl: "https://jobs.ashbyhq.com/notion/job-1",
          applyUrl: "https://jobs.ashbyhq.com/notion/job-1/application",
          descriptionHtml: description,
          location: "London",
          employmentType: "FullTime",
          publishedAt: "2026-11-01T00:00:00.000Z",
          isRemote: true,
        },
      ],
    });
    expect(ashby[0].source).toBe("ashby");
    expect(ashby[0].companyName).toBe("notion");
    expect(ashby[0].applicationUrl).toContain("/application");
  });
});

describe("application inboxes", () => {
  it("skips a privacy address and keeps a hiring address", () => {
    expect(extractApplicationEmail("privacy@jumio.com or jobs@northwind.example")).toBe("jobs@northwind.example");
    expect(extractApplicationEmail("Write to reasonable-accommodations@dataiku.com")).toBeNull();
  });
});

const ready = {
  gmailConnected: true,
  autoSendEnabled: true,
  requireApproval: false,
  fitScore: 70,
  minFitScore: 55,
  validationPassed: true,
  tailoredCvPassed: true,
  duplicate: false,
  applicationEmail: "jobs@northwind.example",
  sentToday: 0,
  dailyCap: 15,
};

describe("automatic sending gates", () => {
  it("holds every send until Gmail is connected", () => {
    expect(decideAutoSend({ ...ready, gmailConnected: false })).toEqual({
      send: false,
      reason: "Gmail is not connected.",
    });
  });

  it("holds a web form, a failed validator, a low score, a duplicate, and a full day", () => {
    const reason = (input: Parameters<typeof decideAutoSend>[0]) => {
      const decision = decideAutoSend(input);
      if (decision.send) throw new Error("expected the send to be held");
      return decision.reason;
    };
    expect(reason({ ...ready, applicationEmail: null })).toMatch(/web form/);
    expect(reason({ ...ready, applicationEmail: "privacy@jumio.com" })).toMatch(/web form/);
    expect(reason({ ...ready, validationPassed: false })).toMatch(/validator/);
    expect(reason({ ...ready, tailoredCvPassed: false })).toMatch(/tailored CV/);
    expect(reason({ ...ready, fitScore: 40 })).toMatch(/fit score/);
    expect(reason({ ...ready, duplicate: true })).toMatch(/duplicate/);
    expect(reason({ ...ready, sentToday: 15 })).toMatch(/cap/);
    expect(reason({ ...ready, requireApproval: true })).toMatch(/Approval/);
    expect(reason({ ...ready, autoSendEnabled: false })).toMatch(/off/);
  });

  it("allows a send only when every gate holds, and still does not mark anything sent", () => {
    expect(decideAutoSend(ready)).toEqual({ send: true });
  });
});
