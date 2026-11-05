export type FactKind = "employment" | "skill" | "education" | "tool";

export type ProfileFact = {
  kind: FactKind;
  text: string;
  organisation: string | null;
  start: string | null;
  end: string | null;
};

export type WritingRuleSeed = {
  ruleKey: string;
  instruction: string;
  severity: "block" | "rewrite";
  appliesTo: "employer_text" | "internal_only";
};

export const SEEDED_FACTS: ProfileFact[] = [
  {
    kind: "skill",
    text: "Customer support and customer-facing experience.",
    organisation: null,
    start: null,
    end: null,
  },
  {
    kind: "employment",
    text: "Running Arbonomics, a subscription-based software business, including customer enquiries, troubleshooting and subscription support.",
    organisation: "Arbonomics",
    start: null,
    end: null,
  },
  {
    kind: "skill",
    text: "Professional digital marketing experience.",
    organisation: null,
    start: null,
    end: null,
  },
  {
    kind: "employment",
    text: "Customer-facing management experience.",
    organisation: null,
    start: null,
    end: null,
  },
  {
    kind: "skill",
    text: "Building websites, booking systems and other business software.",
    organisation: null,
    start: null,
    end: null,
  },
  {
    kind: "skill",
    text: "Excellent written English, communication and problem-solving skills.",
    organisation: null,
    start: null,
    end: null,
  },
];

export const SEEDED_RULES: WritingRuleSeed[] = [
  {
    ruleKey: "no_invented_facts",
    instruction: "Do not invent qualifications, achievements, experience, or dates.",
    severity: "block",
    appliesTo: "employer_text",
  },
  {
    ruleKey: "no_user_counts_or_telegram",
    instruction: "Do not mention Arbonomics user counts or Telegram.",
    severity: "block",
    appliesTo: "employer_text",
  },
  {
    ruleKey: "no_ai_tools",
    instruction: "Do not mention AI-assisted development tools.",
    severity: "block",
    appliesTo: "employer_text",
  },
  {
    ruleKey: "no_town_county_linkedin",
    instruction: "Do not include town, county, or LinkedIn.",
    severity: "block",
    appliesTo: "employer_text",
  },
  {
    ruleKey: "call_it_arbonomics",
    instruction: "Call the software business Arbonomics.",
    severity: "block",
    appliesTo: "employer_text",
  },
  {
    ruleKey: "no_overemployment",
    instruction: "Do not mention overemployment, OE, a second job, or the OE score.",
    severity: "block",
    appliesTo: "employer_text",
  },
  {
    ruleKey: "tone",
    instruction: "Tone stays natural, professional, friendly, and confident.",
    severity: "block",
    appliesTo: "employer_text",
  },
];

export const DEFAULT_TARGET_CATEGORIES = [
  "customer support",
  "chat/ticket support",
  "SaaS support",
  "customer success",
];

export const DEFAULT_QUALIFICATIONS_ABSENT = [
  "a university degree",
  "professional software-engineering experience",
  "languages other than English",
];

export const DEFAULT_CATEGORY_BLOCKLIST = [
  "clinical",
  "nurse",
  "nursing",
  "physician",
  "doctor",
  "dental",
  "surgeon",
  "driving",
  "driver",
  "hgv",
  "warehouse",
  "picker",
  "forklift",
  "chef",
  "cook",
  "barista",
  "solicitor",
  "barrister",
  "plumber",
  "electrician",
];

export const DEFAULT_LANGUAGES = ["English"];

export const DEFAULT_MIN_FIT = 55;

export const DEFAULT_FIT_BANDS = { excellent: 85, good: 70, stretch: 55 };

export type ScoringProfile = {
  yearsCustomerFacing: number | null;
  languages: string[];
  categoryBlocklist: string[];
  minFitScore: number;
};

export const DEFAULT_SCORING_PROFILE: ScoringProfile = {
  yearsCustomerFacing: null,
  languages: DEFAULT_LANGUAGES,
  categoryBlocklist: DEFAULT_CATEGORY_BLOCKLIST,
  minFitScore: DEFAULT_MIN_FIT,
};
