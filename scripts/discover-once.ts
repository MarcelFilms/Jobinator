import { createClient } from "@supabase/supabase-js";
import { runDiscover } from "../src/lib/discover/run";
import { loadLocalEnv } from "./load-env";

loadLocalEnv();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Supabase URL or service key is missing. Discovery was not run.");
    process.exit(1);
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await runDiscover(supabase);
  console.log(JSON.stringify(result, null, 2));
  if (result.sources.some((source) => !source.ok && !source.skipped)) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
