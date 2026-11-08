import type { SupabaseClient } from "@supabase/supabase-js";
import { decideAutoSend } from "@/lib/applications/auto-send";

export type AutoSendRun = { sent: 0; held: string };

/**
 * The scheduled send path. It never writes sent, sent_at, or a Gmail id.
 * With no Gmail credential it stops before looking for letters to send.
 */
export async function runAutoSend(supabase: SupabaseClient): Promise<AutoSendRun> {
  const { data, error } = await supabase.from("gmail_credentials").select("user_id").limit(1);
  if (error || !data || data.length === 0) {
    return { sent: 0, held: "Gmail is not connected." };
  }
  const { data: settings, error: settingsError } = await supabase
    .from("settings")
    .select("auto_send_enabled, require_approval, min_fit_score, daily_application_limit")
    .limit(1)
    .maybeSingle();
  const decision = decideAutoSend({
    gmailConnected: true,
    autoSendEnabled: !settingsError && Boolean(settings?.auto_send_enabled),
    requireApproval: Boolean(settingsError) || settings?.require_approval !== false,
    fitScore: null,
    minFitScore: typeof settings?.min_fit_score === "number" ? settings.min_fit_score : 55,
    validationPassed: false,
    tailoredCvPassed: false,
    duplicate: false,
    applicationEmail: null,
    sentToday: 0,
    dailyCap: typeof settings?.daily_application_limit === "number" ? settings.daily_application_limit : 15,
  });
  if (decision.send) {
    return { sent: 0, held: "Gmail has not accepted a message. Nothing was marked sent." };
  }
  return { sent: 0, held: decision.reason };
}
