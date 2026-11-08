/** Public board tokens checked live on 8 November 2026. A 404 means the company moved ATS, and that board is skipped. */

export const GREENHOUSE_BOARDS = [
  "gitlab",
  "stripe",
  "discord",
  "cloudflare",
  "mongodb",
  "elastic",
  "datadog",
  "intercom",
  "twilio",
  "dropbox",
  "airtable",
  "figma",
] as const;

export const LEVER_SITES = ["spotify"] as const;

export const ASHBY_BOARDS = ["ashby", "notion", "linear", "ramp"] as const;

export const GREENHOUSE_DETAILS_PER_BOARD = 6;
export const GREENHOUSE_DETAILS_PER_RUN = 36;
