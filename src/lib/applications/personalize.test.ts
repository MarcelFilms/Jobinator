import { describe, expect, it } from "vitest";
import { PERSONALIZED_DISABLED_REASON, personalizedDraftDecision } from "@/lib/applications/personalize";

describe("personalized draft", () => {
  it("stays off without a model", () => {
    const decision = personalizedDraftDecision();
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("AI is off");
    expect(decision.reason).toBe(PERSONALIZED_DISABLED_REASON);
    expect(decision.model).toBeNull();
    expect(decision.callsModel).toBe(false);
  });
});
