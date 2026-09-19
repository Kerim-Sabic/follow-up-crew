import { useMemo, useState } from "react";
import { leadStage, STATUSES, type Lead, type LeadStatus, type Profile } from "@/lib/crm";
import { cn } from "@/lib/utils";

function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function Analytics({
  leads,
  profiles,
  statusFilter,
  onSelectStatus,
}: {
  leads: Lead[];
  profiles: Profile[];
  statusFilter: LeadStatus | "all";
  onSelectStatus: (status: LeadStatus | "all") => void;
}) {
  const [open, setOpen] = useState(true);

  const stats = useMemo(() => {
    const counts = Object.fromEntries(STATUSES.map((s) => [s.value, 0])) as Record<
      LeadStatus,
      number
    >;
    for (const lead of leads) counts[leadStage(lead)] += 1;

    const total = leads.length;
    const reachedOut = total - counts.not_contacted;
    const replied = counts.replied + counts.deal;

    const days: { label: string; count: number }[] = [];
    const now = new Date();
    for (let i = 13; i >= 0; i -= 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      const key = day.toISOString().slice(0, 10);
      days.push({
        label: day.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        count: leads.filter((lead) => (lead.last_touched_at ?? "").slice(0, 10) === key).length,
      });
    }

    const team = profiles
      .map((profile) => {
        const owned = leads.filter((lead) => lead.owner_id === profile.id);
        const touched = owned.filter((lead) => leadStage(lead) !== "not_contacted").length;
        const replies = owned.filter(
          (lead) => leadStage(lead) === "replied" || leadStage(lead) === "deal",
        ).length;
        const deals = owned.filter((lead) => leadStage(lead) === "deal").length;
        return { name: profile.display_name, touched, replies, deals };
      })
      .filter((row) => row.touched > 0)
      .sort((a, b) => b.touched - a.touched);

    return { counts, total, reachedOut, replied, deals: counts.deal, days, team };
  }, [leads, profiles]);

  const peak = Math.max(1, ...stats.days.map((day) => day.count));

  const kpis = [
    { label: "Total leads", value: stats.total.toLocaleString(), hint: "in the list" },
    {
      label: "Reached out",
      value: stats.reachedOut.toLocaleString(),
      hint: `${pct(stats.reachedOut, stats.total)}% of list`,
    },
    {
      label: "Reply rate",
      value: `${pct(stats.replied, stats.reachedOut)}%`,
      hint: `${stats.replied.toLocaleString()} replies`,
    },
    {
      label: "Deals",
      value: stats.deals.toLocaleString(),
      hint: `${pct(stats.deals, stats.reachedOut)}% of outreach`,
    },
  ];

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-2xl border border-border bg-card px-4 py-3 shadow-panel transition-shadow duration-200 hover:shadow-md"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {kpi.label}
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums text-foreground">{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
        <button
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pipeline &amp; activity
          </span>
          <span className="text-xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
        </button>

        <div
          className={cn(
            "grid transition-all duration-300 ease-out",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-5 border-t border-border px-4 py-4">
              <div className="space-y-2">
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
                  {STATUSES.map((status) => {
                    const share = pct(stats.counts[status.value], stats.total);
                    if (!share) return null;
                    return (
                      <div
                        key={status.value}
                        className={cn(status.dot, "transition-all duration-500")}
                        style={{ width: `${share}%` }}
                        title={`${status.label}: ${stats.counts[status.value]}`}
                      />
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {STATUSES.map((status) => {
                    const active = statusFilter === status.value;
                    return (
                      <button
                        key={status.value}
                        onClick={() => onSelectStatus(active ? "all" : status.value)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-left transition-all duration-200",
                          active
                            ? "border-primary/50 bg-accent/60"
                            : "border-border bg-surface hover:border-primary/30 hover:bg-accent/40",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={cn("size-1.5 rounded-full", status.dot)} />
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {status.label}
                          </span>
                        </span>
                        <span className="mt-0.5 block font-display text-xl tabular-nums text-foreground">
                          {stats.counts[status.value].toLocaleString()}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {pct(stats.counts[status.value], stats.total)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Activity · last 14 days
                  </p>
                  <div className="mt-3 flex h-28 items-end gap-1.5">
                    {stats.days.map((day) => (
                      <div key={day.label} className="group flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                          {day.count}
                        </span>
                        <div
                          className="w-full rounded-t-md bg-primary/80 transition-all duration-500 group-hover:bg-primary"
                          style={{ height: `${Math.max(2, (day.count / peak) * 88)}px` }}
                          title={`${day.label}: ${day.count} touched`}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>{stats.days[0]?.label}</span>
                    <span>{stats.days[stats.days.length - 1]?.label}</span>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Team progress
                  </p>
                  {stats.team.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      No outreach logged yet — claim a lead to get started.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {stats.team.map((row) => (
                        <li key={row.name} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate text-foreground">{row.name}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {row.touched} sent · {row.replies} replies · {row.deals} deals
                            </span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{
                                width: `${Math.max(4, pct(row.touched, stats.team[0]!.touched))}%`,
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
