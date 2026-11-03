import "server-only";
import { redirect } from "next/navigation";
import { ownerEmail } from "@/lib/env";
import {
  DEFAULT_LANGUAGES,
  DEFAULT_QUALIFICATIONS_ABSENT,
  DEFAULT_TARGET_CATEGORIES,
  SEEDED_FACTS,
  SEEDED_RULES,
} from "@/lib/profile-defaults";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function requireOwner() {
  const supabase = await createClient();
  const allowed = ownerEmail();
  if (!supabase || !allowed) redirect("/login?error=owner");
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? "";
  if (!data.user || email !== allowed) redirect("/login");
  return { supabase, user: data.user, email };
}

export async function ensureOwner(userId: string, email: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin.from("candidate_profiles").select("user_id").eq("user_id", userId).maybeSingle();
  if (!profile) {
    const { error } = await admin.from("candidate_profiles").insert({
      user_id: userId,
      display_name: "",
      contact_email: email,
      facts: SEEDED_FACTS,
      years_customer_facing: null,
      languages: DEFAULT_LANGUAGES,
      target_categories: DEFAULT_TARGET_CATEGORIES,
      qualifications_absent: DEFAULT_QUALIFICATIONS_ABSENT,
    });
    if (error) throw new Error(error.message);
  }

  const { data: rules } = await admin.from("writing_rules").select("rule_key").eq("user_id", userId);
  const present = new Set((rules ?? []).map((rule) => rule.rule_key as string));
  const missing = SEEDED_RULES.filter((rule) => !present.has(rule.ruleKey));
  if (missing.length > 0) {
    const { error } = await admin.from("writing_rules").insert(
      missing.map((rule) => ({
        user_id: userId,
        rule_key: rule.ruleKey,
        instruction: rule.instruction,
        severity: rule.severity,
        applies_to: rule.appliesTo,
      })),
    );
    if (error) throw new Error(error.message);
  }

  const { data: settings } = await admin.from("settings").select("user_id").eq("user_id", userId).maybeSingle();
  if (!settings) {
    const { error } = await admin.from("settings").insert({ user_id: userId });
    if (error) throw new Error(error.message);
  }
}
