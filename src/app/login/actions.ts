"use server";

import { redirect } from "next/navigation";
import { ownerEmail, publicEnv } from "@/lib/env";
import { ensureOwner } from "@/lib/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const allowed = ownerEmail();
  if (!publicEnv()) fail("Supabase URL and the publishable key are not configured.");
  if (!allowed) fail("OWNER_EMAIL is not set, so sign-in is closed.");
  if (email !== allowed) fail("This assistant is private to one owner.");
  if (password.length < 8) fail("Use a password of at least 8 characters.");

  const supabase = await createClient();
  if (!supabase) fail("Supabase is not configured.");

  const attempt = await supabase.auth.signInWithPassword({ email, password });
  if (!attempt.error && attempt.data.user) {
    await ensureOwner(attempt.data.user.id, email);
    redirect("/");
  }

  const admin = createAdminClient();
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = (listed.data?.users ?? []).find((user) => user.email?.toLowerCase() === email);
  if (!existing) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) fail(created.error?.message ?? "The owner account could not be created.");
    const second = await supabase.auth.signInWithPassword({ email, password });
    if (second.error || !second.data.user) fail(second.error?.message ?? "The owner was created, but sign-in failed.");
    await ensureOwner(second.data.user.id, email);
    redirect("/");
  }

  // The profile seed can create the allowlisted user before they choose a password.
  // The first password they submit becomes theirs if they have never signed in.
  if (!existing.last_sign_in_at) {
    const updated = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    if (updated.error) fail(updated.error.message);
    const second = await supabase.auth.signInWithPassword({ email, password });
    if (second.error || !second.data.user) fail(second.error?.message ?? "The owner password was saved, but sign-in failed.");
    await ensureOwner(second.data.user.id, email);
    redirect("/");
  }

  fail("That password was not accepted.");
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
