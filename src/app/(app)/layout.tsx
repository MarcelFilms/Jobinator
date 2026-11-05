import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { requireOwner } from "@/lib/owner";

export const dynamic = "force-dynamic";

const LINKS = [
  ["/", "Overview"],
  ["/jobs", "Jobs"],
  ["/queue", "Queue"],
  ["/cvs", "CVs"],
  ["/profile", "Profile"],
  ["/usage", "Usage"],
  ["/settings", "Settings"],
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <Link href="/" className="font-serif text-2xl text-ink no-underline">
              Jobinator
            </Link>
            <p className="text-xs text-ink/60">Rules first. The model stays off.</p>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-full px-3 py-1.5 no-underline hover:bg-paper">
                {label}
              </Link>
            ))}
            <form action={signOut}>
              <button type="submit" className="rounded-full px-3 py-1.5 text-ink/70 hover:bg-paper">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
