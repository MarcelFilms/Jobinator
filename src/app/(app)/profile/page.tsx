import { saveProfile } from "@/app/(app)/profile/actions";
import type { ProfileFact } from "@/lib/profile-defaults";
import { requireOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const { supabase, user } = await requireOwner();
  const [{ data: profile }, { data: rules }] = await Promise.all([
    supabase.from("candidate_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("writing_rules").select("rule_key, instruction, severity, applies_to").eq("user_id", user.id).order("rule_key"),
  ]);
  const facts = ([...(profile?.facts ?? []), { kind: "skill", text: "", organisation: "", start: "", end: "" }] as ProfileFact[]);

  return (
    <main className="max-w-3xl">
      <h1 className="font-serif text-4xl">Profile</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        These facts are the only experience a standard letter may use. The assistant does not add facts by itself. Years are blank until you set them, so a required-years rule is not applied yet.
        Writing rules are applied when a letter is checked. That check does not call a model.
      </p>
      {params.error ? <p className="mt-4 text-sm text-clay">{params.error}</p> : null}
      {params.saved ? <p className="mt-4 text-sm text-mossdeep">Saved.</p> : null}
      <form action={saveProfile} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">
          Name applications may use
          <input name="display_name" defaultValue={profile?.display_name ?? ""} className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2" />
        </label>
        <label className="block text-sm font-semibold">
          Contact email
          <input name="contact_email" type="email" defaultValue={profile?.contact_email ?? ""} className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2" />
        </label>
        <label className="block text-sm font-semibold">
          Years of customer-facing experience
          <input
            name="years_customer_facing"
            type="number"
            min={0}
            step="0.5"
            defaultValue={profile?.years_customer_facing ?? ""}
            className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2"
          />
        </label>
        <label className="block text-sm font-semibold">
          Languages
          <input name="languages" defaultValue={(profile?.languages ?? ["English"]).join(", ")} className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2" />
        </label>
        <label className="block text-sm font-semibold">
          Qualifications you do not hold
          <textarea
            name="qualifications_absent"
            rows={4}
            defaultValue={(profile?.qualifications_absent ?? []).join("\n")}
            className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2"
          />
        </label>
        <input type="hidden" name="fact_count" value={facts.length} />
        <h2 className="pt-2 font-serif text-2xl">Facts</h2>
        {facts.map((fact, index) => (
          <fieldset key={index} className="rounded-2xl border border-line bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                Kind
                <select name={`fact_kind_${index}`} defaultValue={fact.kind} className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2">
                  <option value="employment">Employment</option>
                  <option value="skill">Skill</option>
                  <option value="education">Education</option>
                  <option value="tool">Tool</option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                Organisation
                <input name={`fact_org_${index}`} defaultValue={fact.organisation ?? ""} className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">
                Text
                <textarea name={`fact_text_${index}`} rows={3} defaultValue={fact.text} className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" />
              </label>
              <label className="text-sm font-semibold">
                Start
                <input name={`fact_start_${index}`} defaultValue={fact.start ?? ""} className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" />
              </label>
              <label className="text-sm font-semibold">
                End
                <input name={`fact_end_${index}`} defaultValue={fact.end ?? ""} className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" />
              </label>
            </div>
          </fieldset>
        ))}
        <h2 className="pt-2 font-serif text-2xl">Writing rules</h2>
        {(rules ?? []).map((rule) => (
          <label key={rule.rule_key} className="block text-sm font-semibold">
            <input type="hidden" name="rule_key" value={rule.rule_key} />
            {rule.rule_key} · {rule.severity} · {rule.applies_to}
            <textarea
              name={`instruction_${rule.rule_key}`}
              rows={2}
              defaultValue={rule.instruction}
              className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 font-normal"
            />
          </label>
        ))}
        <button type="submit" className="rounded-xl bg-moss px-4 py-2.5 font-semibold text-white">
          Save profile
        </button>
      </form>
    </main>
  );
}
