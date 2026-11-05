import { signIn } from "@/app/login/actions";
import { ownerEmail, publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const configured = Boolean(publicEnv());
  const owner = ownerEmail();
  const error =
    params.error === "private"
      ? "That account is not the owner."
      : params.error === "owner"
        ? "Sign-in needs OWNER_EMAIL and the Supabase keys on the server."
        : params.error;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-moss">Jobinator</p>
      <h1 className="mt-3 font-serif text-4xl text-ink">Private job desk</h1>
      <p className="mt-3 text-base leading-relaxed text-ink/80">
        One owner. Real listings from We Work Remotely and Jobicy. Scores are rules, and a normal day costs £0.
      </p>
      {!configured || !owner ? (
        <div className="mt-8 rounded-2xl border border-line bg-card p-5 shadow-card">
          <p className="font-semibold">The server is not ready to sign anyone in.</p>
          <p className="mt-2 text-sm leading-relaxed text-ink/75">
            Set the Supabase URL, publishable key, secret key, CRON_SECRET, and OWNER_EMAIL in the host environment.
            The names are in <code>.env.example</code>. Discovery can run from the cron route once those values exist.
          </p>
        </div>
      ) : (
        <form action={signIn} className="mt-8 space-y-4 rounded-2xl border border-line bg-card p-5 shadow-card">
          <label className="block text-sm font-semibold">
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
            />
          </label>
          <label className="block text-sm font-semibold">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2"
            />
          </label>
          <button type="submit" className="w-full rounded-xl bg-moss px-4 py-2.5 font-semibold text-white">
            Sign in
          </button>
          <p className="text-xs leading-relaxed text-ink/60">
            The first sign-in with the allowlisted email creates that account. No other email can enter.
          </p>
        </form>
      )}
      {error ? <p className="mt-4 text-sm text-clay">{error}</p> : null}
    </main>
  );
}
