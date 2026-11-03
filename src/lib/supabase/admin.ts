import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serviceEnv } from "@/lib/env";

export function createAdminClient() {
  const { url, serviceKey } = serviceEnv();
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
