import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ExternalLink, Instagram, Mail, MessageSquarePlus } from "lucide-react";
import { leadQualityScore, qualityTierMeta, leadStage, formatWhen, instagramUrl, type Lead, type LeadStatus } from "@/lib/crm";
import { StatusSelect } from "./StatusSelect";
import { LeadAvatar } from "./LeadAvatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./WorkspaceState";
import { cn } from "@/lib/utils";

export function LeadTable({
  leads,
  ownerName,
  selected,
  onToggleSelect,
  onOpen,
  onStatusChange,
  onSelectAll,
}: {
  leads: Lead[];
  ownerName: (id: string | null) => string;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (lead: Lead) => void;
  onStatusChange: (ids: string[], status: LeadStatus) => void;
  onSelectAll?: () => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: leads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 12,
  });

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid min-w-[940px] grid-cols-[36px_minmax(220px,1.5fr)_minmax(180px,1.2fr)_130px_110px_100px_120px] items-center gap-3 border-b border-border bg-secondary/55 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">
        <Checkbox aria-label="Select all visible leads" checked={leads.length > 0 && leads.every((lead) => selected.has(lead.id))} onCheckedChange={() => onSelectAll?.()} />
        <span>Lead</span>
        <span>Contact</span>
        <span>Stage</span>
        <span>Owner</span>
        <span>Last touch</span>
        <span className="text-right">Next action</span>
      </div>

      <div ref={parentRef} className="max-h-[calc(100vh-290px)] min-h-[420px] overflow-auto">
        {leads.length === 0 ? (
          <EmptyState title="No leads found" description="Try removing a filter or searching for another name or email." />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const lead = leads[item.index]!;
              const isSelected = selected.has(lead.id);
              return (
                <div
                  key={lead.id}
                  className={cn(
                    "group absolute left-0 top-0 grid min-w-[940px] w-full cursor-pointer grid-cols-[36px_minmax(220px,1.5fr)_minmax(180px,1.2fr)_130px_110px_100px_120px] items-center gap-3 border-b border-border/70 px-3 transition-colors hover:bg-secondary/55 focus-visible:bg-secondary/55",
                    isSelected && "bg-accent/60",
                  )}
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  onClick={() => onOpen(lead)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => { if (event.key === "Enter") onOpen(lead); }}
                >
                  <Checkbox
                    checked={isSelected}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={() => onToggleSelect(lead.id)}
                    aria-label={`Select ${lead.username}`}
                  />
                  <div className="flex min-w-0 items-center gap-2.5">
                    <LeadAvatar username={lead.username} />
                    <div className="min-w-0"><p className="truncate text-[13px] font-medium text-foreground">@{lead.username.replace(/^@/, "")}</p><p className="truncate text-[11px] text-muted-foreground">{lead.full_name ?? `Lead #${lead.number ?? "—"}`}</p></div>
                  </div>
                  <div className="min-w-0"><p className="truncate text-[13px] text-foreground">{lead.email ?? "No email"}</p><p className="truncate text-[11px] text-muted-foreground">{lead.niche ?? "Instagram"}</p><QualityBadge lead={lead} /></div>
                  <StatusSelect
                    value={leadStage(lead)}
                    onChange={(status) => onStatusChange([lead.id], status)}
                  />
                  <p className="truncate text-xs text-muted-foreground">
                    {ownerName(lead.owner_id)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {formatWhen(lead.last_touched_at)}
                  </p>
                  <div className="flex items-center justify-end gap-0.5">
                    <span className="text-xs text-muted-foreground group-hover:hidden">{leadStage(lead) === "not_contacted" ? "Contact" : leadStage(lead) === "contacted" ? "Follow up" : "Review"}</span>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title={`Open @${lead.username.replace(/^@/, "")} on Instagram`} asChild><a href={instagramUrl(lead)} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}><Instagram /></a></Button>
                    <div className="hidden items-center group-hover:flex"><Button variant="ghost" size="icon" className="size-7" title="Open lead" onClick={(event) => { event.stopPropagation(); onOpen(lead); }}><ExternalLink /></Button>{lead.email ? <Button variant="ghost" size="icon" className="size-7" title="Email" asChild><a href={`mailto:${lead.email}`} onClick={(event) => event.stopPropagation()}><Mail /></a></Button> : null}<Button variant="ghost" size="icon" className="size-7" title="Add note" onClick={(event) => { event.stopPropagation(); onOpen(lead); }}><MessageSquarePlus /></Button></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function QualityBadge({ lead }: { lead: Lead }) {
  const { score, tier } = leadQualityScore(lead);
  const meta = qualityTierMeta(tier);
  return (
    <span className={`mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`} title="Audience quality, not follower count">
      {score} · {meta.label}
    </span>
  );
}
