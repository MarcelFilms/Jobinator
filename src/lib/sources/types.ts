export type SourceId =
  | "weworkremotely"
  | "jobicy"
  | "reed"
  | "workingnomads"
  | "remotive"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "indeed"
  | "cvlibrary"
  | "totaljobs"
  | "linkedin"
  | "adzuna"
  | "glassdoor"
  | "arbeitnow"
  | "remoteok";

export type ParsedListing = {
  source: SourceId;
  externalId: string;
  canonicalUrl: string;
  companyName: string;
  title: string;
  descriptionHtml: string;
  descriptionText: string;
  locationText: string;
  countryText: string | null;
  jobLevel: string | null;
  remoteSignalHint: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryText: string | null;
  salaryIsAdvertised: boolean;
  employmentType: string | null;
  applicationUrl: string;
  applicationEmail: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  raw: Record<string, unknown>;
};

export class SourceError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null = null,
    readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export const USER_AGENT = "Jobinator/0.1 (private job search; +https://github.com/MarcelFilms/Jobinator)";

export async function fetchSource(
  url: string,
  timeoutMs = 25_000,
): Promise<{ status: number; body: string; retryAfter: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "*/*",
        "user-agent": USER_AGENT,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.text();
    return {
      status: response.status,
      body,
      retryAfter: response.headers.get("retry-after"),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    throw new SourceError(message);
  } finally {
    clearTimeout(timer);
  }
}
