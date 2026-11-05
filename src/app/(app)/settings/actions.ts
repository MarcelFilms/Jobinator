"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/owner";

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function saveSettings(formData: FormData) {
  const { supabase, user } = await requireOwner();
  const daily = numberOrNull(formData.get("daily_spend_cap_gbp")) ?? 0;
  const monthly = numberOrNull(formData.get("monthly_spend_cap_gbp")) ?? 0;
  const requested = formData.get("ai_enabled") === "on";
  if (requested && (daily <= 0 || monthly <= 0)) {
    redirect("/settings?error=A%20cap%20of%200%20cannot%20enable%20a%20model.%20Both%20caps%20must%20be%20above%20zero.");
  }
  const minFit = numberOrNull(formData.get("min_fit_score")) ?? 55;
  const bands = {
    excellent: numberOrNull(formData.get("band_excellent")) ?? 85,
    good: numberOrNull(formData.get("band_good")) ?? 70,
    stretch: numberOrNull(formData.get("band_stretch")) ?? 55,
  };
  const { error: settingsError } = await supabase
    .from("settings")
    .update({
      min_fit_score: minFit,
      fit_bands: bands,
      salary_min_gbp: numberOrNull(formData.get("salary_min_gbp")),
      category_blocklist: lines(formData.get("category_blocklist")),
      daily_application_limit: numberOrNull(formData.get("daily_application_limit")) ?? 5,
      require_approval: formData.get("require_approval") === "on",
      ai_enabled: requested,
      daily_spend_cap_gbp: daily,
      monthly_spend_cap_gbp: monthly,
    })
    .eq("user_id", user.id);
  if (settingsError) redirect(`/settings?error=${encodeURIComponent(settingsError.message)}`);

  const { error: profileError } = await supabase
    .from("candidate_profiles")
    .update({
      target_categories: lines(formData.get("target_categories")),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (profileError) redirect(`/settings?error=${encodeURIComponent(profileError.message)}`);

  revalidatePath("/settings");
  revalidatePath("/jobs");
  redirect("/settings?saved=1");
}
