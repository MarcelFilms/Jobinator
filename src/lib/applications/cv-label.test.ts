import { describe, expect, it } from "vitest";
import { cvLabelForJob } from "@/lib/applications/cv-label";

describe("CV label", () => {
  it("follows the job title and ignores a conflicting description", () => {
    expect(cvLabelForJob("Customer Support", "This team does digital marketing for a SaaS product.")).toBe("customer_support");
    expect(cvLabelForJob("Technical Support")).toBe("saas_product_support");
    expect(cvLabelForJob("SaaS Support Specialist")).toBe("saas_product_support");
    expect(cvLabelForJob("Digital Marketing Manager")).toBe("digital_marketing");
    expect(cvLabelForJob("Head of Marketing")).toBe("digital_marketing");
    expect(cvLabelForJob("Account Executive", "Close new business.")).toBe("general");
  });

  it("uses the description only when the title has no category", () => {
    expect(cvLabelForJob("Operations Associate", "Join the customer support queue and answer email.")).toBe("customer_support");
    expect(cvLabelForJob("Operations Associate", "Own digital marketing campaigns.")).toBe("digital_marketing");
  });

  it("returns the same label every time", () => {
    const samples = [
      ["Customer Support Specialist", ""],
      ["Product Support", ""],
      ["SEO Lead", ""],
      ["Office Manager", "No category here."],
    ] as const;
    for (const [title, description] of samples) {
      expect(cvLabelForJob(title, description)).toBe(cvLabelForJob(title, description));
    }
  });
});
