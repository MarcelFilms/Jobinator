import { readFileSync } from "fs";
import { loadLocalEnv } from "./load-env";

loadLocalEnv();

const sql = readFileSync("supabase/migrations/0001_milestone1.sql", "utf8");

function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const match = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (!match) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing, so the project ref is unknown.");
  return match[1];
}

async function applyWithAccessToken(token: string) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}/database/migrations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "milestone_1", query: sql }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Management API HTTP ${response.status}: ${body.slice(0, 400)}`);
  }
  console.log("Applied migration through the Supabase management API.");
}

async function applyWithDatabaseUrl(databaseUrl: string) {
  const pg = await import("pg");
  const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied migration through DATABASE_URL.");
  } finally {
    await client.end();
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (token) {
    await applyWithAccessToken(token);
    return;
  }
  if (databaseUrl) {
    await applyWithDatabaseUrl(databaseUrl);
    return;
  }
  console.error(
    "Schema was not applied. The service key can read and write rows, but it cannot run DDL. Set SUPABASE_ACCESS_TOKEN or DATABASE_URL and run npm run apply-schema.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
