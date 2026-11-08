import { formHasCaptcha } from "@/lib/applications/auto-apply";

export type AtsSource = "greenhouse" | "lever" | "ashby";

export type Applicant = {
  first: string;
  last: string;
  email: string;
  phone: string | null;
  letter: string;
  employer: string | null;
};

export type FormQuestion = {
  label: string;
  required?: boolean;
  fields: Array<{ name: string; type: string }>;
};

export type FormPlan =
  | { action: "skip"; reason: string }
  | { action: "submit"; url: string; kind: "greenhouse" | "lever" | "ashby"; fields: Record<string, string> };

const BASIC = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "resume",
  "resume_text",
  "cover_letter",
  "cover_letter_text",
]);

const EMPLOYER = /current or (?:most recent|previous) (?:company|employer)|most recent company|previous employer/i;

export function atsTarget(job: {
  source: string;
  external_id: string;
  application_url: string | null;
  raw: { board?: string; id?: string | number; company?: string } | null;
}): { source: AtsSource; pageUrl: string; submitUrl: string; questionsUrl: string | null } | null {
  if (job.source !== "greenhouse" && job.source !== "lever" && job.source !== "ashby") return null;
  const [boardFromId, idFromExternal] = job.external_id.split(":");
  const board = job.raw?.board || job.raw?.company || boardFromId;
  const id = String(job.raw?.id ?? idFromExternal ?? "");
  if (!board || !id) return null;
  if (job.source === "greenhouse") {
    return {
      source: "greenhouse",
      pageUrl: `https://job-boards.greenhouse.io/${board}/jobs/${id}`,
      submitUrl: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`,
      questionsUrl: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?questions=true`,
    };
  }
  if (job.source === "lever") {
    const apply = job.application_url?.includes("/apply")
      ? job.application_url
      : `https://jobs.lever.co/${board}/${id}/apply`;
    return { source: "lever", pageUrl: apply, submitUrl: apply, questionsUrl: null };
  }
  const apply = job.application_url ?? `https://jobs.ashbyhq.com/${board}/${id}/application`;
  return {
    source: "ashby",
    pageUrl: apply,
    submitUrl: `https://api.ashbyhq.com/posting-api/job-board/${board}/application`,
    questionsUrl: null,
  };
}

export function planAtsForm(input: {
  source: AtsSource;
  pageHtml: string;
  questions: FormQuestion[];
  submitUrl: string;
  applicant: Applicant;
}): FormPlan {
  if (formHasCaptcha(input.pageHtml)) {
    return {
      action: "skip",
      reason: "This form has a CAPTCHA or anti-bot check. It stays in the queue for you to submit.",
    };
  }
  if (!input.applicant.first || !input.applicant.last || !input.applicant.email) {
    return { action: "skip", reason: "The profile needs a first name, a last name, and an email before a form can be submitted." };
  }
  if (input.source === "greenhouse") return planGreenhouse(input);
  if (input.source === "lever") {
    return {
      action: "submit",
      kind: "lever",
      url: input.submitUrl,
      fields: {
        name: `${input.applicant.first} ${input.applicant.last}`,
        email: input.applicant.email,
        ...(input.applicant.phone ? { phone: input.applicant.phone } : {}),
        comments: input.applicant.letter,
      },
    };
  }
  return {
    action: "submit",
    kind: "ashby",
    url: input.submitUrl,
    fields: {
      firstName: input.applicant.first,
      lastName: input.applicant.last,
      email: input.applicant.email,
      ...(input.applicant.phone ? { phone: input.applicant.phone } : {}),
      coverLetter: input.applicant.letter,
    },
  };
}

function planGreenhouse(input: {
  questions: FormQuestion[];
  submitUrl: string;
  applicant: Applicant;
}): FormPlan {
  const fields: Record<string, string> = {
    first_name: input.applicant.first,
    last_name: input.applicant.last,
    email: input.applicant.email,
    cover_letter_text: input.applicant.letter,
  };
  if (input.applicant.phone) fields.phone = input.applicant.phone;
  for (const question of input.questions) {
    if (!question.required) continue;
    const named = question.fields.filter((field) => field.name);
    if (named.length === 0) continue;
    const unanswered = named.filter((field) => !BASIC.has(field.name) && !fields[field.name]);
    if (unanswered.length === 0) {
      if (named.some((field) => field.name === "phone") && !input.applicant.phone) {
        return { action: "skip", reason: "The form requires a phone number, and the profile does not have one." };
      }
      continue;
    }
    if (unanswered.length === 1 && unanswered[0].type === "input_text" && EMPLOYER.test(question.label) && input.applicant.employer) {
      fields[unanswered[0].name] = input.applicant.employer;
      continue;
    }
    const label = question.label.replace(/\s+/g, " ").trim();
    return {
      action: "skip",
      reason: `The form requires “${label.slice(0, 180)}”, which is not on the profile. It stays in the queue.`,
    };
  }
  return { action: "submit", kind: "greenhouse", url: input.submitUrl, fields };
}

export type BoardResponse = { status: number; body: string };

export async function postForm(
  plan: Extract<FormPlan, { action: "submit" }>,
  resume: Uint8Array,
  send: (url: string, init: RequestInit) => Promise<BoardResponse>,
): Promise<BoardResponse> {
  if (plan.kind === "ashby") {
    return send(plan.url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        ...plan.fields,
        resumeFilename: "cv.pdf",
        resumeContent: Buffer.from(resume).toString("base64"),
      }),
    });
  }
  const body = new FormData();
  for (const [key, value] of Object.entries(plan.fields)) body.set(key, value);
  body.set("resume", new Blob([Buffer.from(resume)], { type: "application/pdf" }), "cv.pdf");
  return send(plan.url, { method: "POST", body });
}
