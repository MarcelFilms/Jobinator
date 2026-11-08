"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FactKind, ProfileFact } from "@/lib/profile-defaults";
import { requireOwner } from "@/lib/owner";

const KINDS = new Set<FactKind>(["employment", "skill", "education", "tool"]);

export async function saveProfile(formData: FormData) {
  const { supabase, user } = await requireOwner();
  const count = Number(formData.get("fact_count") ?? 0);
  const facts: ProfileFact[] = [];
  for (let index = 0; index < count; index += 1) {
    const text = String(formData.get(`fact_text_${index}`) ?? "").trim();
    if (!text) continue;
    const kindValue = String(formData.get(`fact_kind_${index}`) ?? "skill");
    const kind = KINDS.has(kindValue as FactKind) ? (kindValue as FactKind) : "skill";
    facts.push({
      kind,
      text,
      organisation: String(formData.get(`fact_org_${index}`) ?? "").trim() || null,
      start: String(formData.get(`fact_start_${index}`) ?? "").trim() || null,
      end: String(formData.get(`fact_end_${index}`) ?? "").trim() || null,
    });
  }
  const yearsText = String(formData.get("years_customer_facing") ?? "").trim();
  const years = yearsText === "" ? null : Number(yearsText);
  const phone = String(formData.get("phone") ?? "").trim();
  const payload = {
      display_name: String(formData.get("display_name") ?? "").trim(),
      contact_email: String(formData.get("contact_email") ?? "").trim(),
      phone,
      years_customer_facing: years !== null && Number.isFinite(years) ? years : null,
      languages: String(formData.get("languages") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      qualifications_absent: String(formData.get("qualifications_absent") ?? "")
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean),
      facts,
      updated_at: new Date().toISOString(),
  };
  let { error } = await supabase.from("candidate_profiles").update(payload).eq("user_id", user.id);
  if (error && /phone/i.test(error.message)) {
    const { phone: _phone, ...withoutPhone } = payload;
    void _phone;
    error = (await supabase.from("candidate_profiles").update(withoutPhone).eq("user_id", user.id)).error;
  }
  if (error) redirect(`/profile?error=${encodeURIComponent(error.message)}`);

  const ruleKeys = formData.getAll("rule_key").map(String);
  for (const ruleKey of ruleKeys) {
    const instruction = String(formData.get(`instruction_${ruleKey}`) ?? "").trim();
    if (!instruction) continue;
    await supabase.from("writing_rules").update({ instruction }).eq("user_id", user.id).eq("rule_key", ruleKey);
  }
  revalidatePath("/profile");
  redirect("/profile?saved=1");
}
