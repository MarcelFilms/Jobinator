import { formatMoneyGbp } from "@/lib/format";
import { londonDay } from "@/lib/london";
import { requireOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

type DailyRow = {
  day: string;
  jobs_seen: number;
  jobs_rejected_without_model: number;
  jobs_scored_without_model: number;
  jobs_unknown_without_model: number;
  model_calls: number;
  cache_hits: number;
  input_tokens: number;
  output_tokens: number;
  spend_gbp: number | string;
};

export default async function UsagePage() {
  const { supabase } = await requireOwner();
  const day = londonDay();
  const monthStart = `${day.slice(0, 7)}-01`;
  const [{ data: today }, { data: monthRows }] = await Promise.all([
    supabase.from("ai_daily").select("*").eq("day", day).maybeSingle(),
    supabase.from("ai_daily").select("spend_gbp, model_calls").gte("day", monthStart).lte("day", day),
  ]);
  const row = (today ?? null) as DailyRow | null;
  const spend = Number(row?.spend_gbp ?? 0);
  const scored = row?.jobs_scored_without_model ?? 0;
  const unknown = row?.jobs_unknown_without_model ?? 0;
  const analysed = scored + unknown;
  const averageVacancy = analysed > 0 ? spend / analysed : 0;
  const monthSpend = (monthRows ?? []).reduce((sum, item) => sum + Number(item.spend_gbp ?? 0), 0);
  const monthCalls = (monthRows ?? []).reduce((sum, item) => sum + Number(item.model_calls ?? 0), 0);

  const figures: Array<[string, string]> = [
    ["Day", day],
    ["Jobs rejected with no model call", String(row?.jobs_rejected_without_model ?? 0)],
    ["Jobs scored with no model call", String(scored)],
    ["Jobs left Unknown with no model call", String(unknown)],
    ["Cache hits", String(row?.cache_hits ?? 0)],
    ["Model calls", String(row?.model_calls ?? 0)],
    ["Input tokens", String(row?.input_tokens ?? 0)],
    ["Output tokens", String(row?.output_tokens ?? 0)],
    ["Spend", formatMoneyGbp(spend)],
    ["Average analysis cost per vacancy", formatMoneyGbp(averageVacancy)],
    ["Average application generation cost", formatMoneyGbp(0)],
    ["Model calls this month", String(monthCalls)],
    ["Spend this month", formatMoneyGbp(monthSpend)],
  ];

  return (
    <main className="max-w-3xl">
      <h1 className="font-serif text-4xl">Usage</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        Europe/London. A zero-spend day is a completed row. {row ? "Today’s row was written by discovery." : "Discovery has not written today’s row yet, so every figure below is £0 or zero."}
      </p>
      <table className="mt-6 w-full overflow-hidden rounded-2xl border border-line bg-card text-sm shadow-card">
        <tbody>
          {figures.map(([label, value]) => (
            <tr key={label} className="border-t border-line first:border-t-0">
              <th className="px-4 py-3 text-left font-medium text-ink/70">{label}</th>
              <td className="px-4 py-3 text-right font-semibold">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
