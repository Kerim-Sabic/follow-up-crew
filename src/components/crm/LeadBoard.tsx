import { useState } from "react";
import { Instagram } from "lucide-react";
import { leadStage, STATUSES, instagramUrl, type Lead, type LeadStatus } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { LeadAvatar } from "./LeadAvatar";
import { StatusSelect } from "./StatusSelect";
import { formatWhen } from "@/lib/crm";

const VISIBLE = 40;

export function LeadBoard({
  leads,
  ownerName,
  onOpen,
  onStatusChange,
  onAddStage,
}: {
  leads: Lead[];
  ownerName: (id: string | null) => string;
  onOpen: (lead: Lead) => void;
  onStatusChange: (ids: string[], status: LeadStatus) => void;
  onAddStage: () => void;
}) {
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STATUSES.map((status) => {
        const columnLeads = leads.filter((lead) => leadStage(lead) === status.value);
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
              "flex max-h-[calc(100vh-190px)] min-h-[480px] w-[280px] shrink-0 flex-col rounded-lg border border-border bg-secondary/30 transition-colors",
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
                   className="cursor-grab rounded-lg border border-border bg-card px-3 py-3 shadow-sm transition-colors hover:border-input active:cursor-grabbing"
                   tabIndex={0}
                   onKeyDown={(event) => { if (event.key === "Enter") onOpen(lead); }}
                >
                   <div className="flex items-center gap-2.5"><LeadAvatar username={lead.username} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-foreground">@{lead.username.replace(/^@/, "")}</p><p className="truncate text-[11px] text-muted-foreground">{lead.email ?? "Instagram"}</p></div><a href={instagramUrl(lead)} target="_blank" rel="noopener noreferrer" title="Open Instagram" onClick={(event) => event.stopPropagation()} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"><Instagram className="size-4" /></a></div>
                   <div className="mt-3 flex items-center justify-between gap-2" onClick={(event) => event.stopPropagation()}><StatusSelect value={leadStage(lead)} onChange={(next) => onStatusChange([lead.id], next)} /><span className="text-[11px] text-muted-foreground">{formatWhen(lead.last_touched_at)}</span></div>
                   <p className="mt-2 truncate border-t border-border pt-2 text-[11px] text-muted-foreground">{ownerName(lead.owner_id)}</p>
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
      <button
        onClick={onAddStage}
        className="flex h-11 w-[200px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"
      >
        + Add stage
      </button>
    </div>
  );
}
