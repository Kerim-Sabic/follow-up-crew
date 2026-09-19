import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Instagram, SkipForward, Undo2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { instagramUrl, type Lead, type LeadStatus } from "@/lib/crm";
import { LeadAvatar } from "./LeadAvatar";
import { cn } from "@/lib/utils";

export type SwipeDecision = { lead: Lead; status: LeadStatus | null };

export function SwipeReview({
  open,
  onOpenChange,
  queue,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: Lead[];
  onFinish: (decisions: SwipeDecision[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<SwipeDecision[]>([]);
  const [drag, setDrag] = useState(0);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);

  useEffect(() => {
    if (open) { setIndex(0); setDecisions([]); setDrag(0); setExiting(null); }
  }, [open, queue]);

  const lead = queue[index];
  const done = index >= queue.length;
  const contactedCount = useMemo(() => decisions.filter((item) => item.status === "contacted").length, [decisions]);

  function decide(status: LeadStatus | null, direction: "left" | "right") {
    if (!lead) return;
    setExiting(direction);
    window.setTimeout(() => {
      setDecisions((current) => [...current, { lead, status }]);
      setIndex((current) => current + 1);
      setDrag(0);
      setExiting(null);
    }, 140);
  }

  function undo() {
    if (decisions.length === 0) return;
    setDecisions((current) => current.slice(0, -1));
    setIndex((current) => Math.max(0, current - 1));
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") { event.preventDefault(); decide("contacted", "right"); }
      if (event.key === "ArrowLeft") { event.preventDefault(); decide(null, "left"); }
      if (event.key === "ArrowDown") { event.preventDefault(); decide("dead", "left"); }
      if (event.key === "o" && lead) window.open(instagramUrl(lead), "_blank", "noopener,noreferrer");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review your batch</DialogTitle>
          <DialogDescription>
            Swipe right if you messaged them, left to leave them untouched. Nothing is saved until you finish.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${queue.length ? (Math.min(index, queue.length) / queue.length) * 100 : 0}%` }} />
          </div>
          <span className="tabular-nums">{Math.min(index + (done ? 0 : 1), queue.length)} / {queue.length}</span>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium">Batch reviewed</p>
            <p className="mt-1 text-xs text-muted-foreground">{contactedCount} marked contacted, {decisions.length - contactedCount} left as they were.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={undo} disabled={decisions.length === 0}><Undo2 />Undo last</Button>
              <Button onClick={() => { onFinish(decisions); onOpenChange(false); }}><Check />Save {contactedCount} contacted</Button>
            </div>
          </div>
        ) : lead ? (
          <>
            <div
              className={cn(
                "select-none rounded-xl border border-border bg-card p-5 shadow-sm transition-transform duration-150",
                exiting === "right" && "translate-x-[120%] rotate-6 opacity-0",
                exiting === "left" && "-translate-x-[120%] -rotate-6 opacity-0",
              )}
              style={exiting ? undefined : { transform: `translateX(${drag}px) rotate(${drag / 30}deg)` }}
              onPointerDown={(event) => {
                const startX = event.clientX;
                const target = event.currentTarget;
                target.setPointerCapture(event.pointerId);
                const move = (moveEvent: PointerEvent) => setDrag(moveEvent.clientX - startX);
                const up = (upEvent: PointerEvent) => {
                  const delta = upEvent.clientX - startX;
                  target.removeEventListener("pointermove", move);
                  target.removeEventListener("pointerup", up);
                  if (delta > 110) decide("contacted", "right");
                  else if (delta < -110) decide(null, "left");
                  else setDrag(0);
                };
                target.addEventListener("pointermove", move);
                target.addEventListener("pointerup", up);
              }}
            >
              <div className="flex items-center gap-4">
                <LeadAvatar username={lead.username} size="xl" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">@{lead.username.replace(/^@/, "")}</p>
                  <p className="truncate text-sm text-muted-foreground">{lead.full_name ?? lead.email ?? "Instagram creator"}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{[lead.niche, lead.score !== null && lead.score !== undefined ? `score ${lead.score}` : null].filter(Boolean).join(" · ") || `Lead #${lead.number ?? "—"}`}</p>
                </div>
              </div>
              {lead.match_note ? <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{lead.match_note}</p> : null}

              <div className="mt-4 overflow-hidden rounded-lg border border-border bg-secondary/40">
                <iframe
                  title={`Instagram feed for ${lead.username}`}
                  src={`https://www.instagram.com/${lead.username.replace(/^@/, "")}/embed`}
                  className="h-64 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <a href={instagramUrl(lead)} target="_blank" rel="noopener noreferrer"><Instagram />Open profile</a>
                </Button>
                {lead.email ? <Button variant="outline" size="sm" className="flex-1" asChild><a href={`mailto:${lead.email}`}><ExternalLink />Email</a></Button> : null}
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" size="icon" className="size-12 rounded-full" title="Skip (left arrow)" onClick={() => decide(null, "left")}><X /></Button>
              <Button variant="ghost" size="sm" title="Not a fit — mark dead (down arrow)" onClick={() => decide("dead", "left")}><SkipForward />Not a fit</Button>
              <Button size="icon" className="size-12 rounded-full" title="Contacted (right arrow)" onClick={() => decide("contacted", "right")}><Check /></Button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <button className="hover:text-foreground disabled:opacity-40" onClick={undo} disabled={decisions.length === 0}>Undo last</button>
              <span>← skip · → contacted · O opens profile</span>
              <button className="hover:text-foreground" onClick={() => { onFinish(decisions); onOpenChange(false); }}>Save &amp; close</button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
