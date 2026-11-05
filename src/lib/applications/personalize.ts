export const PERSONALIZED_DISABLED_REASON = "AI is off";

export function personalizedDraftDecision(): {
  allowed: false;
  reason: typeof PERSONALIZED_DISABLED_REASON;
  model: null;
  callsModel: false;
} {
  return { allowed: false, reason: PERSONALIZED_DISABLED_REASON, model: null, callsModel: false };
}
