import { evaluateListing } from "../src/lib/scoring/evaluate";
import { DEFAULT_SCORING_PROFILE } from "../src/lib/profile-defaults";
import { fetchJobicy } from "../src/lib/sources/jobicy";
import { fetchWeworkremotely } from "../src/lib/sources/weworkremotely";
import type { ParsedListing } from "../src/lib/sources/types";

type Summary = {
  source: string;
  httpStatus: number;
  parsed: number;
  eligibility: Record<string, number>;
  statuses: Record<string, number>;
  scored: number;
  unknownFit: number;
  examples: Array<{ company: string; title: string; location: string; status: string; fit: number | null; oe: number | null; reason: string | null }>;
};

function summarise(source: string, httpStatus: number, listings: ParsedListing[]): Summary {
  const eligibility: Record<string, number> = {};
  const statuses: Record<string, number> = {};
  let scored = 0;
  let unknownFit = 0;
  const examples: Summary["examples"] = [];
  for (const listing of listings) {
    const decision = evaluateListing({
      source: listing.source,
      title: listing.title,
      descriptionText: listing.descriptionText,
      locationText: listing.locationText,
      countryText: listing.countryText,
      jobLevel: listing.jobLevel,
      expiresAt: listing.expiresAt,
      profile: DEFAULT_SCORING_PROFILE,
    });
    eligibility[decision.ukEligibility] = (eligibility[decision.ukEligibility] ?? 0) + 1;
    const key = decision.filterReason?.split(":")[0] ?? decision.status;
    statuses[key] = (statuses[key] ?? 0) + 1;
    if (decision.fitStatus === "scored") scored += 1;
    if (decision.fitStatus === "unknown" && decision.status !== "filtered_out" && decision.status !== "expired") unknownFit += 1;
    if (examples.length < 5) {
      examples.push({
        company: listing.companyName,
        title: listing.title,
        location: listing.locationText,
        status: decision.status,
        fit: decision.fitScore,
        oe: decision.oeScore,
        reason: decision.filterReason,
      });
    }
  }
  return { source, httpStatus, parsed: listings.length, eligibility, statuses, scored, unknownFit, examples };
}

async function main() {
  const failures: string[] = [];
  const summaries: Summary[] = [];
  try {
    const wwr = await fetchWeworkremotely();
    if (wwr.listings.length === 0) failures.push("We Work Remotely parsed zero listings.");
    summaries.push(summarise("weworkremotely", wwr.status, wwr.listings));
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "We Work Remotely fetch failed");
  }
  try {
    const jobicy = await fetchJobicy();
    if (jobicy.listings.length === 0) failures.push("Jobicy parsed zero listings.");
    summaries.push(summarise("jobicy", jobicy.status, jobicy.listings));
  } catch (error) {
    failures.push(error instanceof Error ? error.message : "Jobicy fetch failed");
  }
  console.log(JSON.stringify({ summaries, failures }, null, 2));
  if (failures.length > 0) process.exit(1);
}

main();
