import { useMemo, useState } from "react";
import { Download, Instagram, Layers } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { instagramUrl, type Lead } from "@/lib/crm";

const PRESETS = [10, 20, 30, 50];

export function InstagramBatchDialog({
  open,
  onOpenChange,
  leads,
  onReview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leads: Lead[];
  onReview: (batch: Lead[]) => void;
}) {
  const [count, setCount] = useState(10);
  const [opened, setOpened] = useState<Lead[]>([]);

  const queue = useMemo(
    () => leads.filter((lead) => lead.status === "not_contacted").slice(0, count),
    [leads, count],
  );

  function openTabs() {
    if (queue.length === 0) return;
    let blocked = 0;
    queue.forEach((lead) => {
      const win = window.open(instagramUrl(lead), "_blank", "noopener,noreferrer");
      if (!win) blocked += 1;
    });
    setOpened(queue);
    if (blocked > 0) toast.warning(`${blocked} tabs were blocked — allow pop-ups for this site.`);
    else toast.success(`Opened ${queue.length} Instagram profiles`);
  }

  function exportCsv() {
    if (queue.length === 0) return;
    const csv = [
      "number,username,instagram_url,full_name,niche,email",
      ...queue.map((lead) =>
        [lead.number ?? "", lead.username, instagramUrl(lead), lead.full_name ?? "", lead.niche ?? "", lead.email ?? ""]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `instagram-batch-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setOpened(queue);
  }

  function finish() {
    const batch = opened.length ? opened : queue;
    if (batch.length === 0) return;
    onReview(batch);
    setOpened([]);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setOpened([]); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Daily Instagram batch</DialogTitle>
          <DialogDescription>
            Pick how many not-contacted leads you want today. Open them all in tabs or download the list, then mark the batch done.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button key={preset} variant={count === preset ? "default" : "outline"} size="sm" onClick={() => setCount(preset)}>
                {preset}
              </Button>
            ))}
            <input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(event) => setCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
              className="h-8 w-20 rounded-md border border-input bg-card px-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
              aria-label="How many leads"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            {queue.length.toLocaleString()} not-contacted leads ready in this batch.
            {opened.length ? ` ${opened.length} handed out — review them one by one when you're done.` : ""}
          </p>

          <div className="flex gap-2">
            <Button className="flex-1" onClick={openTabs} disabled={queue.length === 0}>
              <Instagram />Open {queue.length} tabs
            </Button>
            <Button variant="outline" className="flex-1" onClick={exportCsv} disabled={queue.length === 0}>
              <Download />Export CSV
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={finish} disabled={queue.length === 0}>
            <Layers />Review batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
