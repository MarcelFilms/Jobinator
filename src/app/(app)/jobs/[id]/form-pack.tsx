import { formAnswers } from "@/lib/applications/form-answers";
import type { ProfileFact } from "@/lib/profile-defaults";

export function FormPack({
  title,
  company,
  facts,
}: {
  title: string;
  company: string;
  facts: ProfileFact[];
}) {
  const answers = formAnswers({ title, company, facts });
  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl">Form answers</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        Paste these into the employer’s form. They use your stored facts only. The app does not open the form, log in,
        or send it.
      </p>
      <dl className="mt-3 space-y-3">
        {answers.map((answer) => (
          <div key={answer.field} className="rounded-2xl border border-line bg-card p-4 text-sm">
            <dt className="font-semibold">{answer.field}</dt>
            <dd className="mt-1 whitespace-pre-wrap leading-relaxed">{answer.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
