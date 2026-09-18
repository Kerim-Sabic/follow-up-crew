import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatWhen, type Lead, type LeadStatus } from "@/lib/crm";
import { StatusSelect } from "./StatusSelect";
import { cn } from "@/lib/utils";

export function LeadTable({
  leads,
  ownerName,
  selected,
  onToggleSelect,
  onOpen,
  onStatusChange,
}: {
  leads: Lead[];
  ownerName: (id: string | null) => string;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (lead: Lead) => void;
  onStatusChange: (ids: string[], status: LeadStatus) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 12,
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
      <div className="grid grid-cols-[36px_minmax(0,1.4fr)_minmax(0,1.6fr)_150px_120px_88px] items-center gap-3 border-b border-border bg-surface px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span />
        <span>Username</span>
        <span>Email</span>
        <span>Stage</span>
        <span>Owner</span>
        <span className="text-right">Updated</span>
      </div>

      <div ref={parentRef} className="max-h-[62vh] overflow-auto">
        {leads.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            No leads match these filters.
          </p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const lead = leads[item.index]!;
              const isSelected = selected.has(lead.id);
              return (
                <div
                  key={lead.id}
                  className={cn(
                    "absolute left-0 top-0 grid w-full cursor-pointer grid-cols-[36px_minmax(0,1.4fr)_minmax(0,1.6fr)_150px_120px_88px] items-center gap-3 border-b border-border/70 px-4 transition-colors hover:bg-surface",
                    isSelected && "bg-accent/60",
                  )}
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  onClick={() => onOpen(lead)}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggleSelect(lead.id)}
                    className="size-4 accent-[var(--primary)]"
                    aria-label={`Select ${lead.username}`}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{lead.username}</p>
                    <p className="truncate text-xs text-muted-foreground">#{lead.number ?? "—"}</p>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{lead.email ?? "—"}</p>
                  <StatusSelect
                    value={lead.status}
                    onChange={(status) => onStatusChange([lead.id], status)}
                  />
                  <p className="truncate text-sm text-muted-foreground">
                    {ownerName(lead.owner_id)}
                  </p>
                  <p className="text-right text-xs tabular-nums text-muted-foreground">
                    {formatWhen(lead.last_touched_at)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
