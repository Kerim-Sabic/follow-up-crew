import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Outreach CRM — shared lead tracker" },
      {
        name: "description",
        content:
          "Track every prospect your team reaches out to, see replies as they land, and keep progress in sync in real time.",
      },
      { property: "og:title", content: "Outreach CRM — shared lead tracker" },
      {
        property: "og:description",
        content: "Track outreach, replies and deals with your team in real time.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Shared outreach tracker
        </span>
        <h1 className="mt-5 font-display text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          Know exactly who you've reached out to.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Every lead, every reply, every teammate — in one live list. Mark someone contacted and it
          shows up for everyone instantly.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to={user ? "/leads" : "/auth"}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {loading ? "Loading…" : user ? "Open your leads" : "Sign in to get started"}
          </Link>
          {!user && !loading ? (
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Create an account
            </Link>
          ) : null}
        </div>

        <dl className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            ["Table + board", "Scan thousands of rows or drag cards between stages."],
            ["Replies logged", "Notes stamped with who wrote them and when."],
            ["Live for everyone", "No refreshing — updates land as they happen."],
          ].map(([title, copy]) => (
            <div key={title} className="rounded-xl border border-border bg-card p-5">
              <dt className="font-display text-sm font-semibold text-foreground">{title}</dt>
              <dd className="mt-2 text-sm text-muted-foreground">{copy}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
