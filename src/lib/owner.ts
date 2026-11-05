import "server-only";
import { cache } from "react";
import { ownerEmail } from "@/lib/env";
import {
  DEFAULT_LANGUAGES,
  DEFAULT_QUALIFICATIONS_ABSENT,
  DEFAULT_TARGET_CATEGORIES,
  SEEDED_FACTS,
  SEEDED_RULES,
} from "@/lib/profile-defaults";
import { createAdminClient } from "@/lib/supabase/admin";

export const requireOwner = cache(async () => {
  const supabase = createAdminClient();
  const email = ownerEmail();
  if (!email) throw new Error("OWNER_EMAIL is not set.");
  const userId = await ownerUserId(email);
  await ensureOwner(userId, email);
  return { supabase, user: { id: userId, email }, email };
});

async function ownerUserId(email: string) {
  const admin = createAdminClient();
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) throw new Error(listed.error.message);
  const existing = listed.data.users.find((user) => user.email?.toLowerCase() === email);
  if (existing) return existing.id;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? "The owner record could not be created.");
  }
  return created.data.user.id;
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
