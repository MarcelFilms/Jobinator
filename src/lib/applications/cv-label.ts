export const CV_LABELS = ["customer_support", "saas_product_support", "digital_marketing", "general"] as const;

export type CvLabel = (typeof CV_LABELS)[number];

export const CV_LABEL_TITLE: Record<CvLabel, string> = {
  customer_support: "Customer Support",
  saas_product_support: "SaaS / Product Support",
  digital_marketing: "Digital Marketing",
  general: "General",
};

const SAAS_SPECIFIC = /\b(product support|technical support|support engineer)\b/i;
const SUPPORT_SPECIFIC =
  /\b(customer support|customer service|customer care|customer success|help\s?desk|service desk)\b/i;
const SUPPORT_GENERAL = /\bsupport (specialist|agent|associate|representative|analyst)\b/i;
const MARKETING_TITLE = /\b(digital marketing|content marketing|seo|marketing)\b/i;

export function isCvLabel(value: string): value is CvLabel {
  return (CV_LABELS as readonly string[]).includes(value);
}

function labelFromText(text: string): CvLabel | null {
  if (SAAS_SPECIFIC.test(text)) return "saas_product_support";
  if (SUPPORT_SPECIFIC.test(text)) return "customer_support";
  if (/\bsaas\b/i.test(text) && /\bsupport\b/i.test(text)) return "saas_product_support";
  if (SUPPORT_GENERAL.test(text)) return "customer_support";
  if (MARKETING_TITLE.test(text)) return "digital_marketing";
  return null;
}

export function cvLabelForJob(title: string, description = ""): CvLabel {
  return labelFromText(title.trim()) ?? labelFromText(`${title}\n${description}`) ?? "general";
}
