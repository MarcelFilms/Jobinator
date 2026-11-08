/** Aim for 10–15 fresh suitable jobs. Never drop below a support-title score after the phone penalty. */
export const FIT_FLOOR = 28;

export function thresholdForDailyTarget(
  scoresHighToLow: number[],
  high = 15,
  floor = FIT_FLOOR,
): { threshold: number; passing: number } | null {
  const eligible = scoresHighToLow.filter((score) => score >= floor);
  if (eligible.length === 0 || high < 1) return null;
  if (eligible.length <= high) {
    return { threshold: eligible[eligible.length - 1], passing: eligible.length };
  }
  const threshold = eligible[high - 1];
  return { threshold, passing: eligible.filter((score) => score >= threshold).length };
}
