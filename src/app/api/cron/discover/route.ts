import { NextResponse } from "next/server";
import { cronSecret } from "@/lib/env";
import { runDiscover } from "@/lib/discover/run";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  const secret = cronSecret();
  const header = request.headers.get("authorization") ?? "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDiscover(createAdminClient());
    const failed = result.sources.filter((source) => !source.ok);
    return NextResponse.json(result, { status: failed.length === result.sources.length ? 502 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discover failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
