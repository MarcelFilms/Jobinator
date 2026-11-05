"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { runDiscover } from "@/lib/discover/run";
import { requireOwner } from "@/lib/owner";
import { createAdminClient } from "@/lib/supabase/admin";

export async function runDiscoveryAction() {
  await requireOwner();
  const result = await runDiscover(createAdminClient());
  revalidatePath("/");
  revalidatePath("/jobs");
  revalidatePath("/usage");
  const note = result.sources
    .map((source) => {
      if (source.skipped) return `${source.source}: ${source.skipped}`;
      if (!source.ok) return `${source.source} failed: ${source.error ?? "unknown error"}`;
      return `${source.source} fetched ${source.jobsFetched}, inserted ${source.jobsInserted}`;
    })
    .join(" · ");
  redirect(`/?notice=${encodeURIComponent(note)}`);
}
