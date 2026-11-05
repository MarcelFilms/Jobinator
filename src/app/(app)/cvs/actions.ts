"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isCvLabel } from "@/lib/applications/cv-label";
import { extractCvText } from "@/lib/cv/extract";
import { requireOwner } from "@/lib/owner";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 5 * 1024 * 1024;

function fail(message: string): never {
  redirect(`/cvs?error=${encodeURIComponent(message)}`);
}

export async function uploadCv(formData: FormData) {
  const { user } = await requireOwner();
  const label = String(formData.get("label") ?? "");
  if (!isCvLabel(label)) fail("Choose one of the four CV labels.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) fail("Choose a PDF, DOCX, or TXT file.");
  if (file.size > MAX_BYTES) fail("That file is larger than 5 MB.");
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (!["pdf", "docx", "txt", "md", "text"].includes(extension)) fail("Upload a PDF, DOCX, or TXT file.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  let plainText = "";
  try {
    plainText = await extractCvText(file.name, bytes);
  } catch (error) {
    fail(error instanceof Error ? error.message : "The file could not be read.");
  }

  const admin = createAdminClient();
  const bucket = await admin.storage.createBucket("cvs", { public: false, fileSizeLimit: MAX_BYTES });
  if (bucket.error && !/already exists|duplicate/i.test(bucket.error.message)) fail(bucket.error.message);

  const storagePath = `${user.id}/${label}/cv.${extension === "text" ? "txt" : extension}`;
  const uploaded = await admin.storage.from("cvs").upload(storagePath, bytes, {
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });
  if (uploaded.error) fail(uploaded.error.message);

  const saved = await admin.from("cvs").upsert(
    {
      user_id: user.id,
      label,
      storage_path: storagePath,
      plain_text: plainText,
      is_approved: false,
    },
    { onConflict: "user_id,label" },
  );
  if (saved.error) fail(saved.error.message);
  revalidatePath("/cvs");
  redirect("/cvs?saved=1");
}

export async function setCvApproval(formData: FormData) {
  const { user } = await requireOwner();
  const label = String(formData.get("label") ?? "");
  if (!isCvLabel(label)) fail("Choose one of the four CV labels.");
  const approved = String(formData.get("approved") ?? "") === "true";
  const admin = createAdminClient();
  const existing = await admin.from("cvs").select("plain_text").eq("user_id", user.id).eq("label", label).maybeSingle();
  if (existing.error) fail(existing.error.message);
  if (!existing.data) fail("Upload a file before marking it approved.");
  if (approved && !existing.data.plain_text.trim()) fail("That file has no extracted text to approve.");
  const updated = await admin.from("cvs").update({ is_approved: approved }).eq("user_id", user.id).eq("label", label);
  if (updated.error) fail(updated.error.message);
  revalidatePath("/cvs");
  redirect("/cvs?saved=1");
}
