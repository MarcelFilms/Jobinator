export const SOURCE_LABEL: Record<string, string> = {
  weworkremotely: "We Work Remotely",
  jobicy: "Jobicy",
  reed: "Reed",
  workingnomads: "Working Nomads",
  remotive: "Remotive",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
};

export const DISCOVERY_SOURCES = [
  "weworkremotely",
  "jobicy",
  "workingnomads",
  "remotive",
  "greenhouse",
  "lever",
  "ashby",
] as const;

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

const JOB_STATUS: Record<string, string> = {
  discovered: "Discovered",
  shortlisted: "Shortlisted",
  filtered_out: "Filtered out",
  expired: "Expired",
  duplicate: "Duplicate",
};

const APPLICATION_STATUS: Record<string, string> = {
  drafted: "Drafted",
  needs_review: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  sent: "Sent",
  replied: "Replied",
  interview: "Interview",
  rejected_by_employer: "Rejected",
  offer: "Offer",
};

export function statusLabel(status: string): string {
  return APPLICATION_STATUS[status] ?? JOB_STATUS[status] ?? status;
}

export function formatMoneyGbp(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

type SalaryJob = {
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_text: string | null;
  salary_is_advertised: boolean;
};

export function formatSalary(job: SalaryJob): string {
  if (job.salary_text && job.salary_min === null && job.salary_max === null) return job.salary_text;
  if (!job.salary_is_advertised) return "Not advertised";
  const currency = job.salary_currency ? `${job.salary_currency} ` : "";
  const period = job.salary_period ? ` ${job.salary_period}` : "";
  const min = job.salary_min;
  const max = job.salary_max;
  if (min !== null && max !== null && min !== max) return `${currency}${trimNumber(min)}–${trimNumber(max)}${period}`;
  if (min !== null) return `${currency}${trimNumber(min)}${period}`;
  if (max !== null) return `${currency}up to ${trimNumber(max)}${period}`;
  return job.salary_text || "Not advertised";
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("en-GB") : String(value);
}

export function fitBand(score: number | null, bands: { excellent: number; good: number; stretch: number }): string {
  if (score === null) return "Unknown";
  if (score >= bands.excellent) return "Excellent";
  if (score >= bands.good) return "Good";
  if (score >= bands.stretch) return "Stretch";
  return "Below threshold";
}

export function eligibilityLabel(value: string): string {
  switch (value) {
    case "explicit_uk":
      return "UK explicit";
    case "worldwide":
      return "Worldwide";
    case "rejected":
      return "Not UK";
    default:
      return "UK unknown";
  }
}

export function remoteLabel(value: string): string {
  switch (value) {
    case "board_remote":
      return "Remote board";
    case "explicit_remote":
      return "Remote";
    case "onsite":
      return "On-site";
    default:
      return "Remote unknown";
  }
}
