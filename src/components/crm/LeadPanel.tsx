import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, ExternalLink, Mail, MessageSquare, StickyNote, UserRound, Clock3 } from "lucide-react";
import { leadQualityScore, qualityTierMeta, leadStage,
  addNote,
  claimLead,
  fetchNotes,
  formatWhen,
  type Lead,
  type LeadStatus,
} from "@/lib/crm";
import { StatusSelect } from "./StatusSelect";
import { LeadAvatar } from "./LeadAvatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

export function LeadPanel({
  lead,
  userId,
  ownerName,
  onClose,
  onStatusChange,
}: {
  lead: Lead;
  userId: string;
  ownerName: (id: string | null) => string;
  onClose: () => void;
  onStatusChange: (ids: string[], status: LeadStatus) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const notes = useQuery({
    queryKey: ["lead-notes", lead.id],
    queryFn: () => fetchNotes(lead.id),
  });

  const noteMutation = useMutation({
    mutationFn: (body: string) => addNote(lead.id, userId, body),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["lead-notes", lead.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const claimMutation = useMutation({
    mutationFn: (next: string | null) => claimLead(lead.id, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="flex w-full max-w-[580px] flex-col gap-0 p-0 sm:max-w-[580px]">
        <SheetHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <div className="flex items-center gap-3"><LeadAvatar username={lead.username} size="lg" /><div className="min-w-0"><SheetTitle className="truncate text-base">@{lead.username.replace(/^@/, "")}</SheetTitle><SheetDescription>Instagram · Lead #{lead.number ?? "—"}</SheetDescription></div></div>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <StatusSelect
              value={leadStage(lead)}
              onChange={(status) => onStatusChange([lead.id], status)}
            />
            <Button variant="outline" size="sm"
              onClick={() => claimMutation.mutate(lead.owner_id === userId ? null : userId)}
            >
              {lead.owner_id === userId ? "Release" : "Claim"}
            </Button>
            {lead.email ? <Button variant="outline" size="sm" asChild><a href={`mailto:${lead.email}`}><Mail />Email</a></Button> : null}
            {lead.instagram_url ? <Button variant="outline" size="sm" asChild><a href={lead.instagram_url} target="_blank" rel="noreferrer"><ExternalLink />Instagram</a></Button> : null}
          </div>
        </SheetHeader>

        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="h-11 w-full justify-start rounded-none border-b border-border bg-card px-5 py-0">
            <TabsTrigger value="overview" className="h-11 rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:shadow-none">Overview</TabsTrigger>
            <TabsTrigger value="activity" className="h-11 rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:shadow-none">Activity</TabsTrigger>
            <TabsTrigger value="notes" className="h-11 rounded-none border-b-2 border-transparent px-3 text-xs shadow-none data-[state=active]:border-primary data-[state=active]:shadow-none">Notes</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <TabsContent value="overview" className="mt-0 space-y-6">
              <section><h3 className="mb-3 text-xs font-semibold">Lead overview</h3><dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <Row label="Owner" value={ownerName(lead.owner_id)} />
                <Row label="Last touch" value={formatWhen(lead.last_touched_at)} />
                <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="mt-1 flex min-w-0 items-center gap-1"><span className="truncate text-[13px]">{lead.email ?? "Not available"}</span>{lead.email ? <Button variant="ghost" size="icon" className="size-7" aria-label="Copy email"
                    onClick={() => {
                      navigator.clipboard.writeText(lead.email ?? "");
                      toast.success("Email copied");
                    }}
                  ><Copy /></Button> : null}</dd></div>
                <Row label="Source" value="Instagram import" />
                <Row label="Date added" value={new Date(lead.created_at).toLocaleDateString()} />
              </dl></section>
              {lead.match_note ? <section className="border-t border-border pt-5"><h3 className="text-xs font-semibold">Why this lead is interesting</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{lead.match_note}</p></section> : null}
              <section className="border-t border-border pt-5">
                <h3 className="text-xs font-semibold">Audience quality</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Monetizable audience signals — never follower count.</p>
                <QualityBreakdown lead={lead} />
              </section>
              <section className="border-t border-border pt-5"><h3 className="text-xs font-semibold">Next action</h3><div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3"><span className="flex size-8 items-center justify-center rounded-md bg-card text-primary"><MessageSquare className="size-4" /></span><div className="flex-1"><p className="text-sm font-medium">{leadStage(lead) === "not_contacted" ? "Start outreach" : leadStage(lead) === "contacted" ? "Follow up" : "Review conversation"}</p><p className="text-xs text-muted-foreground">Keep the relationship moving.</p></div></div></section>
            </TabsContent>
            <TabsContent value="activity" className="mt-0"><div className="space-y-5 border-l border-border pl-5"><Timeline icon={<Clock3 />} title={lead.last_touched_at ? `Stage updated to ${leadStage(lead).replace("_", " ")}` : "Lead added to workspace"} when={formatWhen(lead.last_touched_at ?? lead.created_at)} /><Timeline icon={<UserRound />} title={lead.owner_id ? `Assigned to ${ownerName(lead.owner_id)}` : "Currently unassigned"} when={formatWhen(lead.created_at)} /></div></TabsContent>
            <TabsContent value="notes" className="mt-0">
            <h3 className="text-xs font-semibold">Notes & replies</h3>
            <form
              className="mt-2 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim()) noteMutation.mutate(draft.trim());
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder="Add context about this lead…"
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30"
              />
              <Button
                type="submit"
                disabled={!draft.trim() || noteMutation.isPending}
              >
                <StickyNote />{noteMutation.isPending ? "Adding…" : "Add note"}
              </Button>
            </form>

            <ul className="mt-4 space-y-3">
              {notes.isLoading ? <><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></> : null}
              {(notes.data ?? []).map((note) => (
                <li key={note.id} className="rounded-lg border border-border bg-secondary/35 p-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {ownerName(note.author_id)}
                    </span>
                    <span>{formatWhen(note.created_at)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
                </li>
              ))}
              {notes.data && notes.data.length === 0 ? (
                <li className="text-sm text-muted-foreground">No notes yet.</li>
              ) : null}
            </ul>
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] text-foreground">{value}</dd>
    </div>
  );
}

function Timeline({ icon, title, when }: { icon: React.ReactNode; title: string; when: string }) {
  return <div className="relative"><span className="absolute -left-8 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground [&>svg]:size-3">{icon}</span><p className="text-sm font-medium">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{when}</p></div>;
}

function QualityBreakdown({ lead }: { lead: Lead }) {
  const { score, tier, breakdown, confidence } = leadQualityScore(lead);
  const meta = qualityTierMeta(tier);
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${meta.className}`}>{score}/100 · {meta.label}</span>
        <span className="text-[11px] text-muted-foreground">{confidence}% of signals known</span>
      </div>

      <ul className="space-y-1">
        {breakdown.map((item) => (
          <li key={item.label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="tabular-nums font-medium text-foreground">+{item.points}</span>
          </li>
        ))}
        {breakdown.length === 0 ? <li className="text-xs text-muted-foreground">No quality signals yet — Hermes can enrich this lead.</li> : null}
      </ul>
    </div>
  );
}
