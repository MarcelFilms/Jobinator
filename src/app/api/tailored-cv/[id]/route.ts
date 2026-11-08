import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function filename(company: string, title: string): string {
  const base = `CV ${company} ${title}`.replace(/[^\w\s-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${base || "CV"}.pdf`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const admin = createAdminClient();
  const row = await admin.from("tailored_cvs").select("storage_path, job_id").eq("application_id", id).maybeSingle();
  if (row.error || !row.data?.storage_path) return new Response("Not found", { status: 404 });
  const file = await admin.storage.from("cvs").download(row.data.storage_path);
  if (file.error || !file.data) return new Response("Not found", { status: 404 });
  const job = await admin.from("jobs").select("company_name, title").eq("id", row.data.job_id).maybeSingle();
  const name = filename(job.data?.company_name ?? "", job.data?.title ?? "");
  return new Response(await file.data.arrayBuffer(), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
