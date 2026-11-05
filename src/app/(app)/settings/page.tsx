import { saveSettings } from "@/app/(app)/settings/actions";
import { DEFAULT_CATEGORY_BLOCKLIST, DEFAULT_FIT_BANDS, DEFAULT_TARGET_CATEGORIES } from "@/lib/profile-defaults";
import { requireOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const { supabase, user } = await requireOwner();
  const [{ data: settings }, { data: profile }] = await Promise.all([
    supabase.from("settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("candidate_profiles").select("target_categories").eq("user_id", user.id).maybeSingle(),
  ]);
  const bands = { ...DEFAULT_FIT_BANDS, ...(settings?.fit_bands ?? {}) };
  const categories = profile?.target_categories?.length ? profile.target_categories : DEFAULT_TARGET_CATEGORIES;
  const blocklist = settings?.category_blocklist?.length ? settings.category_blocklist : DEFAULT_CATEGORY_BLOCKLIST;

  return (
    <main className="max-w-3xl">
      <h1 className="font-serif text-4xl">Settings</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        The model toggle stays off while either cap is zero. Saving a cap of 0 cannot turn it on. Discovery never calls a model.
      </p>
      {params.error ? <p className="mt-4 text-sm text-clay">{params.error}</p> : null}
      {params.saved ? <p className="mt-4 text-sm text-mossdeep">Saved.</p> : null}
      <form action={saveSettings} className="mt-6 space-y-5">
        <Field label="Target categories" hint="One per line. These are the kinds of work you want.">
          <textarea name="target_categories" rows={5} defaultValue={categories.join("\n")} className="field" />
        </Field>
        <Field label="Blocked title terms" hint="A title containing one of these is filtered out. Clinical, driving, warehouse, chef, and similar.">
          <textarea name="category_blocklist" rows={8} defaultValue={blocklist.join("\n")} className="field" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum fit score">
            <input name="min_fit_score" type="number" min={0} max={100} defaultValue={settings?.min_fit_score ?? 55} className="field" />
          </Field>
          <Field label="Salary preference, GBP" hint="A blank salary on a job stays “Not advertised” and is not rejected.">
            <input name="salary_min_gbp" type="number" min={0} defaultValue={settings?.salary_min_gbp ?? ""} className="field" />
          </Field>
          <Field label="Excellent from">
            <input name="band_excellent" type="number" defaultValue={bands.excellent} className="field" />
          </Field>
          <Field label="Good from">
            <input name="band_good" type="number" defaultValue={bands.good} className="field" />
          </Field>
          <Field label="Stretch from">
            <input name="band_stretch" type="number" defaultValue={bands.stretch} className="field" />
          </Field>
          <Field label="Daily application limit" hint="Stored now. Sending is a later milestone.">
            <input name="daily_application_limit" type="number" min={0} defaultValue={settings?.daily_application_limit ?? 5} className="field" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input name="require_approval" type="checkbox" defaultChecked={settings?.require_approval ?? true} />
          Require approval before anything is sent
        </label>
        <fieldset className="rounded-2xl border border-line bg-card p-4">
          <legend className="px-1 font-semibold">AI</legend>
          <p className="text-sm text-ink/70">
            Both caps are 0, so the provider is not loaded and no key is read. Discover, filtering, and both scores finish with the rules.
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
            <input name="ai_enabled" type="checkbox" defaultChecked={Boolean(settings?.ai_enabled)} />
            Enable a model
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Daily cap, GBP">
              <input name="daily_spend_cap_gbp" type="number" min={0} step="0.01" defaultValue={settings?.daily_spend_cap_gbp ?? 0} className="field" />
            </Field>
            <Field label="Monthly cap, GBP">
              <input name="monthly_spend_cap_gbp" type="number" min={0} step="0.01" defaultValue={settings?.monthly_spend_cap_gbp ?? 0} className="field" />
            </Field>
          </div>
        </fieldset>
        <button type="submit" className="rounded-xl bg-moss px-4 py-2.5 font-semibold text-white">
          Save settings
        </button>
      </form>
      <style>{`
        .field { margin-top: 0.35rem; width: 100%; border-radius: 0.75rem; border: 1px solid #e3d9c8; background: #fffdf8; padding: 0.5rem 0.75rem; }
      `}</style>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {hint ? <span className="mt-1 block font-normal text-ink/60">{hint}</span> : null}
      {children}
    </label>
  );
}
