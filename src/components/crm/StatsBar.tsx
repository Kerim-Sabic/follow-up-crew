import { STATUSES, type Lead, type Profile } from "@/lib/crm";
import { cn } from "@/lib/utils";

export function StatsBar({ leads, profiles }: { leads: Lead[]; profiles: Profile[] }) {
  const counts = STATUSES.map((status) => ({
    ...status,
    count: leads.filter((lead) => lead.status === status.value).length,
  }));

  const leaderboard = profiles
    .map((profile) => ({
      name: profile.display_name,
      count: leads.filter(
        (lead) => lead.owner_id === profile.id && lead.status !== "not_contacted",
      ).length,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {counts.map((status) => (
          <div
            key={status.value}
            className="rounded-xl border border-border bg-card px-4 py-3 shadow-panel"
          >
            <div className="flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", status.dot)} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {status.label}
              </span>
            </div>
            <div className="mt-1 font-display text-2xl tabular-nums text-foreground">
              {status.count.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {leaderboard.length > 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-panel lg:min-w-56">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Team progress
          </span>
          <ul className="mt-2 space-y-1.5">
            {leaderboard.map((row) => (
              <li key={row.name} className="flex items-center justify-between gap-6 text-sm">
                <span className="truncate text-foreground">{row.name}</span>
                <span className="tabular-nums text-muted-foreground">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
