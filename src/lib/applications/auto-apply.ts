export type AutoApplyInput = {
  autoSendEnabled: boolean;
  requireApproval: boolean;
  fitScore: number | null;
  minFitScore: number;
  validationPassed: boolean;
  tailoredCvPassed: boolean;
  duplicate: boolean;
  alreadySent: boolean;
  sentToday: number;
  dailyCap: number;
  source: string;
};

export type AutoApplyDecision = { submit: false; reason: string } | { submit: true };

const ATS = new Set(["greenhouse", "lever", "ashby"]);

/**
 * Whether an ATS form may be submitted. This does not submit anything.
 * A CAPTCHA is a separate check on the form itself.
 */
export function decideAutoApply(input: AutoApplyInput): AutoApplyDecision {
  if (!ATS.has(input.source)) return { submit: false, reason: "This job is not a Greenhouse, Lever, or Ashby form." };
  if (!input.autoSendEnabled) return { submit: false, reason: "Automatic sending is off." };
  if (input.requireApproval) return { submit: false, reason: "Approval is still required." };
  if (input.duplicate) return { submit: false, reason: "This job is a duplicate." };
  if (input.alreadySent) return { submit: false, reason: "This job was already submitted." };
  if (input.fitScore === null || input.fitScore < input.minFitScore) {
    return { submit: false, reason: "The fit score is below the minimum." };
  }
  if (!input.validationPassed) return { submit: false, reason: "The cover letter has not passed the validator." };
  if (!input.tailoredCvPassed) return { submit: false, reason: "The tailored CV has not passed the validator." };
  if (input.dailyCap <= 0 || input.sentToday >= input.dailyCap) {
    return { submit: false, reason: "The daily application cap is reached." };
  }
  return { submit: true };
}

export function splitName(displayName: string): { first: string; last: string } | null {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export function formHasCaptcha(html: string): boolean {
  return /recaptcha|hcaptcha|h-captcha|turnstile|cf-challenge|g-recaptcha/i.test(html);
}

export function boardConfirmed(status: number, body: string): boolean {
  if (status < 200 || status >= 300) return false;
  const text = body.trim();
  if (!text) return false;
  if (/captcha|hcaptcha|recaptcha/i.test(text)) return false;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.success === false || parsed.error || parsed.errors) return false;
    if (parsed.success === true || parsed.id || parsed.application_id || parsed.application) return true;
    return false;
  } catch {
    return /thank you for applying|application (has been |was )?received|successfully submitted/i.test(text);
  }
}
