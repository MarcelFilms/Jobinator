import { extractApplicationEmail } from "@/lib/sources/extract";

export type AutoSendInput = {
  gmailConnected: boolean;
  autoSendEnabled: boolean;
  requireApproval: boolean;
  fitScore: number | null;
  minFitScore: number;
  validationPassed: boolean;
  duplicate: boolean;
  applicationEmail: string | null;
  sentToday: number;
  dailyCap: number;
};

export type AutoSendDecision = { send: false; reason: string } | { send: true };

/**
 * A send is allowed only when every gate holds. Callers must still refuse to
 * write sent_at until Gmail itself accepts the message. This function does not
 * send anything.
 */
export function decideAutoSend(input: AutoSendInput): AutoSendDecision {
  if (!input.gmailConnected) return { send: false, reason: "Gmail is not connected." };
  if (!input.autoSendEnabled) return { send: false, reason: "Automatic sending is off." };
  if (input.requireApproval) return { send: false, reason: "Approval is still required." };
  if (input.duplicate) return { send: false, reason: "This job is a duplicate." };
  if (input.fitScore === null || input.fitScore < input.minFitScore) {
    return { send: false, reason: "The fit score is below the minimum." };
  }
  if (!input.validationPassed) return { send: false, reason: "The validator has not passed." };
  const email = input.applicationEmail ? extractApplicationEmail(input.applicationEmail) : null;
  if (!email) return { send: false, reason: "This job uses a web form." };
  if (input.dailyCap <= 0 || input.sentToday >= input.dailyCap) {
    return { send: false, reason: "The daily application cap is reached." };
  }
  return { send: true };
}
