import { useState } from "react";
import { STATUSES, type Lead, type LeadStatus } from "@/lib/crm";
import { cn } from "@/lib/utils";

const VISIBLE = 40;

export function LeadBoard({
  leads,
  ownerName,
  onOpen,
  onStatusChange,
}: {
  leads: Lead[];
  ownerName: (id: string | null) => string;
  onOpen: (lead: Lead) => void;
  onStatusChange: (ids: string[], status: LeadStatus) => void;
}) {
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);

  return (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
      {STATUSES.map((status) => {
        const columnLeads = leads.filter((lead) => lead.status === status.value);
        return (
          <section
            key={status.value}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(status.value);
            }}
            onDragLeave={() => setDragOver((current) => (current === status.value ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(null);
              const id = event.dataTransfer.getData("text/plain");
              if (id) onStatusChange([id], status.value);
            }}
            className={cn(
              "flex max-h-[62vh] flex-col rounded-xl border border-border bg-card shadow-panel transition-colors",
              dragOver === status.value && "border-primary/60 bg-accent/50",
            )}
          >
            <header className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", status.dot)} />
                {status.label}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {columnLeads.length.toLocaleString()}
              </span>
            </header>

            <div className="flex-1 space-y-2 overflow-auto p-2">
              {columnLeads.slice(0, VISIBLE).map((lead) => (
                <article
                  key={lead.id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", lead.id)}
                  onClick={() => onOpen(lead)}
                  className="cursor-grab rounded-lg border border-border bg-background px-3 py-2.5 transition-colors hover:border-primary/40 active:cursor-grabbing"
                >
                  <p className="truncate text-sm font-medium text-foreground">{lead.username}</p>
                  <p className="truncate text-xs text-muted-foreground">{lead.email ?? "—"}</p>
                  {lead.owner_id ? (
                    <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                      {ownerName(lead.owner_id)}
                    </p>
                  ) : null}
                </article>
              ))}
              {columnLeads.length > VISIBLE ? (
                <p className="px-1 py-2 text-center text-xs text-muted-foreground">
                  + {(columnLeads.length - VISIBLE).toLocaleString()} more — use the table view
                </p>
              ) : null}
              {columnLeads.length === 0 ? (
                <p className="px-1 py-6 text-center text-xs text-muted-foreground">
                  Drop leads here
                </p>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
