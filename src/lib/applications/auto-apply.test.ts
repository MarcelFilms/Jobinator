import { describe, expect, it } from "vitest";
import { boardConfirmed, decideAutoApply, formHasCaptcha, splitName } from "@/lib/applications/auto-apply";
import { atsTarget, planAtsForm, postForm } from "@/lib/applications/ats-form";

const ready = {
  autoSendEnabled: true,
  requireApproval: false,
  fitScore: 70,
  minFitScore: 55,
  validationPassed: true,
  tailoredCvPassed: true,
  duplicate: false,
  alreadySent: false,
  sentToday: 0,
  dailyCap: 15,
  source: "greenhouse",
};

const applicant = {
  first: "Tyg",
  last: "Wonbolt",
  email: "tygwonbolt@gmail.com",
  phone: null,
  letter: "A checked letter of real experience.",
  employer: "Arbonomics",
};

describe("decideAutoApply", () => {
  it("allows a ready Greenhouse, Lever, or Ashby form", () => {
    expect(decideAutoApply(ready)).toEqual({ submit: true });
    expect(decideAutoApply({ ...ready, source: "lever" })).toEqual({ submit: true });
    expect(decideAutoApply({ ...ready, source: "ashby" })).toEqual({ submit: true });
  });

  it("holds when sending is off, approval is required, or the day is full", () => {
    expect(decideAutoApply({ ...ready, autoSendEnabled: false }).submit).toBe(false);
    expect(decideAutoApply({ ...ready, requireApproval: true }).submit).toBe(false);
    expect(decideAutoApply({ ...ready, sentToday: 15 }).submit).toBe(false);
    expect(decideAutoApply({ ...ready, alreadySent: true }).submit).toBe(false);
    expect(decideAutoApply({ ...ready, source: "reed" }).submit).toBe(false);
  });

  it("requires a passing letter and tailored CV", () => {
    expect(decideAutoApply({ ...ready, validationPassed: false }).submit).toBe(false);
    expect(decideAutoApply({ ...ready, tailoredCvPassed: false }).submit).toBe(false);
    expect(decideAutoApply({ ...ready, fitScore: 40 }).submit).toBe(false);
  });
});

describe("form planning", () => {
  it("leaves a CAPTCHA form in the queue and does not build a post", () => {
    const plan = planAtsForm({
      source: "greenhouse",
      pageHtml: '<script src="https://www.google.com/recaptcha/enterprise.js"></script>',
      questions: [],
      submitUrl: "https://boards-api.greenhouse.io/v1/boards/stripe/jobs/1",
      applicant,
    });
    expect(plan.action).toBe("skip");
    expect(formHasCaptcha("h-captcha-response")).toBe(true);
    expect(formHasCaptcha("recaptchaUniversalPublicSiteKey")).toBe(true);
    expect(formHasCaptcha("<form><input name='email'></form>")).toBe(false);
  });

  it("skips a required question that is not on the profile", () => {
    const plan = planAtsForm({
      source: "greenhouse",
      pageHtml: "<form></form>",
      questions: [
        { label: "Will you now or in the future require visa sponsorship?", required: true, fields: [{ name: "question_1", type: "multi_value_single_select" }] },
      ],
      submitUrl: "https://boards-api.greenhouse.io/v1/boards/stripe/jobs/1",
      applicant,
    });
    expect(plan.action).toBe("skip");
  });

  it("fills the employer from a stored fact and keeps the letter", () => {
    const plan = planAtsForm({
      source: "greenhouse",
      pageHtml: "<form></form>",
      questions: [
        { label: "Current or most recent company", required: true, fields: [{ name: "question_9", type: "input_text" }] },
        { label: "Resume", required: true, fields: [{ name: "resume", type: "input_file" }] },
      ],
      submitUrl: "https://boards-api.greenhouse.io/v1/boards/stripe/jobs/1",
      applicant,
    });
    expect(plan).toMatchObject({
      action: "submit",
      fields: { first_name: "Tyg", last_name: "Wonbolt", question_9: "Arbonomics", cover_letter_text: applicant.letter },
    });
  });

  it("does not invent a surname", () => {
    expect(splitName("")).toBeNull();
    expect(splitName("Tyg")).toBeNull();
    expect(splitName("Tyg Wonbolt")).toEqual({ first: "Tyg", last: "Wonbolt" });
  });
});

describe("board confirmation", () => {
  it("accepts only a confirming response", () => {
    expect(boardConfirmed(200, "")).toBe(false);
    expect(boardConfirmed(401, '{"error":"unauthorized"}')).toBe(false);
    expect(boardConfirmed(200, '{"error":"captcha"}')).toBe(false);
    expect(boardConfirmed(200, '{"success":false}')).toBe(false);
    expect(boardConfirmed(201, '{"id":"app_1","success":true}')).toBe(true);
    expect(boardConfirmed(200, "Thank you for applying")).toBe(true);
  });

  it("posts the CV and letter only for a planned form", async () => {
    const plan = planAtsForm({
      source: "lever",
      pageHtml: "<form></form>",
      questions: [],
      submitUrl: "https://jobs.lever.co/example/1/apply",
      applicant,
    });
    expect(plan.action).toBe("submit");
    if (plan.action !== "submit") return;
    const sent = await postForm(plan, new Uint8Array([1, 2, 3]), async (_url, init) => {
      const body = init.body as FormData;
      expect(body.get("email")).toBe(applicant.email);
      expect(body.get("comments")).toBe(applicant.letter);
      expect(body.get("resume")).toBeInstanceOf(Blob);
      expect(body.get("h-captcha-response")).toBeNull();
      return { status: 200, body: '{"id":"ok","success":true}' };
    });
    expect(boardConfirmed(sent.status, sent.body)).toBe(true);
  });

  it("builds the public board addresses from the stored job", () => {
    expect(
      atsTarget({
        source: "greenhouse",
        external_id: "stripe:7737248",
        application_url: null,
        raw: { board: "stripe", id: 7737248 },
      })?.submitUrl,
    ).toBe("https://boards-api.greenhouse.io/v1/boards/stripe/jobs/7737248");
    expect(atsTarget({ source: "reed", external_id: "1", application_url: null, raw: null })).toBeNull();
  });
});
