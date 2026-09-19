import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Columns3, Download, FileDown, Filter, Instagram, LayoutList, Plus, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useOptimisticStage, useWorkspace } from "@/lib/workspace";
import { leadStage, STATUSES, instagramUrl, updateLeadStatus, type LeadStatus } from "@/lib/crm";
import { InstagramBatchDialog } from "@/components/crm/InstagramBatchDialog";
import { SwipeReview, type SwipeDecision } from "@/components/crm/SwipeReview";
import type { Lead } from "@/lib/crm";
import { LeadTable } from "@/components/crm/LeadTable";
import { LeadBoard } from "@/components/crm/LeadBoard";
import { TableSkeleton, ErrorState } from "@/components/crm/WorkspaceState";
import { exportFullLeads, exportListKit } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [
    { title: "Leads — Outreach CRM" },
    { name: "description", content: "Search, qualify and contact every prospect in your team pipeline." },
    { property: "og:title", content: "Leads — Outreach CRM" },
    { property: "og:description", content: "Search, qualify and contact every prospect in your team pipeline." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ]}), component: LeadsPage,
});

type Sort = "number" | "recent" | "username";

function LeadsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { leads, profiles, ownerName, isLoading, error, setActiveLead, setAddLeadOpen, setManageStagesOpen } = useWorkspace();
  const [view, setView] = useState<"table" | "board">(() => typeof localStorage === "undefined" ? "table" : (localStorage.getItem("crm-view") as "table" | "board") || "table");
  const [search, setSearch] = useState("");
  const [deferredSearch, setDeferredSearch] = useState("");
  const [status, setStatus] = useState<LeadStatus | "all">("all");
  const [owner, setOwner] = useState<"all" | "mine" | "unassigned">("all");
  const [hasEmail, setHasEmail] = useState<"all" | "yes" | "no">("all");
  const [sort, setSort] = useState<Sort>("number");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [swipeQueue, setSwipeQueue] = useState<Lead[]>([]);

  useEffect(() => { const id = window.setTimeout(() => setDeferredSearch(search.trim().toLowerCase()), 150); return () => window.clearTimeout(id); }, [search]);
  useEffect(() => { localStorage.setItem("crm-view", view); }, [view]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((item) => [item.value, leads.filter((lead) => leadStage(lead) === item.value).length])) as Record<LeadStatus, number>, [leads]);
  const filtered = useMemo(() => {
    const result = leads.filter((lead) => {
      if (status !== "all" && leadStage(lead) !== status) return false;
      if (owner === "mine" && lead.owner_id !== user?.id) return false;
      if (owner === "unassigned" && lead.owner_id) return false;
      if (hasEmail === "yes" && !lead.email) return false;
      if (hasEmail === "no" && lead.email) return false;
      if (!deferredSearch) return true;
      return `${lead.username} ${lead.email ?? ""} ${lead.match_note ?? ""} ${lead.number}`.toLowerCase().includes(deferredSearch);
    });
    return result.sort((a, b) => sort === "username" ? a.username.localeCompare(b.username) : sort === "recent" ? (b.last_touched_at ?? "").localeCompare(a.last_touched_at ?? "") : (a.number ?? 0) - (b.number ?? 0));
  }, [deferredSearch, hasEmail, leads, owner, sort, status, user?.id]);

  const optimisticStage = useOptimisticStage();
  const mutation = useMutation({
    mutationFn: ({ ids, next }: { ids: string[]; next: LeadStatus }) => updateLeadStatus(ids, next, user?.id ?? ""),
    onMutate: ({ ids, next }) => optimisticStage(ids, next, user?.id ?? ""),
    onSuccess: (_data, variables) => { toast.success(variables.ids.length > 1 ? `${variables.ids.length} leads updated` : "Lead updated"); if (variables.ids.length > 1) setSelected(new Set()); },
    onError: () => { queryClient.invalidateQueries({ queryKey: ["leads"] }); toast.error("Couldn't update leads. Try again."); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });
  const clearFilters = () => { setStatus("all"); setOwner("all"); setHasEmail("all"); setSearch(""); };
  const exportSelected = () => {
    exportFullLeads(leads.filter((lead) => selected.has(lead.id)), "selected-leads.csv");
  };
  const exportForListKit = () => {
    const rows = (selected.size ? leads.filter((lead) => selected.has(lead.id)) : filtered).filter((lead) => lead.email);
    if (!rows.length) { toast.error("None of these leads have an email address yet."); return; }
    exportListKit(rows, "listkit-leads.csv");
    toast.success(`${rows.length.toLocaleString()} leads exported in the ListKit layout`);
  };
  const openNextInstagram = (count: number) => {
    const seen = new Set<string>(JSON.parse(localStorage.getItem("crm.opened-today") ?? "[]") as string[]);
    const queue = filtered
      .filter((lead) => leadStage(lead) === "not_contacted" && !seen.has(lead.id))
      .slice(0, count);
    if (queue.length === 0) { toast.info("No fresh not-contacted leads left in this view."); return; }
    let blocked = 0;
    queue.forEach((lead) => { if (!window.open(instagramUrl(lead), "_blank", "noopener,noreferrer")) blocked += 1; });
    queue.forEach((lead) => seen.add(lead.id));
    localStorage.setItem("crm.opened-today", JSON.stringify([...seen].slice(-500)));
    if (blocked > 0) toast.warning(`${blocked} of ${queue.length} tabs were blocked — allow pop-ups for this site.`);
    else toast.success(`Opened ${queue.length} profiles — swipe to record what you did.`);
    setSwipeQueue(queue);
    setSwipeOpen(true);
  };
  const saveDecisions = (decisions: SwipeDecision[]) => {
    const contacted = decisions.filter((item) => item.status === "contacted").map((item) => item.lead.id);
    const dead = decisions.filter((item) => item.status === "dead").map((item) => item.lead.id);
    if (contacted.length) mutation.mutate({ ids: contacted, next: "contacted" });
    if (dead.length) mutation.mutate({ ids: dead, next: "dead" });
    if (!contacted.length && !dead.length) toast.info("Nothing changed — those leads stay untouched.");
  };
  const activeFilters = Number(status !== "all") + Number(owner !== "all") + Number(hasEmail !== "all");

  return <div className="px-4 py-5 lg:px-6">
    <div className="mx-auto max-w-[1800px]">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-baseline gap-2"><h1 className="text-2xl font-semibold">Leads</h1><span className="text-sm tabular-nums text-muted-foreground">{leads.length.toLocaleString()} total</span></div><p className="mt-1 text-sm text-muted-foreground">Manage, qualify and contact prospects.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => openNextInstagram(10)}><Instagram />Open next 10</Button><Button variant="outline" onClick={() => openNextInstagram(20)}>Open next 20</Button><Button variant="outline" onClick={() => setBatchOpen(true)}><Download />Daily batch</Button><Button variant="outline" onClick={exportForListKit}><FileDown />Export for ListKit</Button><Button onClick={() => setAddLeadOpen(true)}><Plus />Add lead</Button></div></header>

      <div className="mt-5 flex flex-wrap items-stretch gap-2">{STATUSES.map((item) => <button key={item.value} onClick={() => setStatus(status === item.value ? "all" : item.value)} className={cn("flex min-w-[9rem] flex-1 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:bg-secondary/60", status === item.value && "border-primary/50 bg-accent")}><span className="flex min-w-0 items-center gap-2"><span className={cn("size-2 shrink-0 rounded-full", item.dot)} /><span className="truncate text-xs font-medium">{item.label}</span></span><span className="text-xs font-semibold tabular-nums">{(counts[item.value] ?? 0).toLocaleString()}</span></button>)}<button onClick={() => setManageStagesOpen(true)} title="Add a stage" className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground"><Plus className="size-4" />Add stage</button></div>

      <div className="sticky top-14 z-10 mt-4 border-y border-border bg-background/95 py-2 backdrop-blur">
        {selected.size ? <div className="flex h-9 items-center gap-2"><span className="text-sm font-semibold">{selected.size} selected</span><Select onValueChange={(next) => mutation.mutate({ ids: [...selected], next: next as LeadStatus })}><SelectTrigger className="h-8 w-36"><SelectValue placeholder="Change stage" /></SelectTrigger><SelectContent>{STATUSES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><Button variant="outline" size="sm" onClick={exportSelected}><Download />Export</Button><Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>Clear selection</Button></div> : <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-56 flex-1 md:max-w-sm"><Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search leads…" className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-8 text-sm outline-none focus:ring-2 focus:ring-ring/25" /><kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">/</kbd></div>
          <Select value={status} onValueChange={(next) => setStatus(next as LeadStatus | "all")}><SelectTrigger className="h-9 w-32"><SelectValue placeholder="Stage" /></SelectTrigger><SelectContent><SelectItem value="all">All stages</SelectItem>{STATUSES.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
          <Select value={owner} onValueChange={(next) => setOwner(next as typeof owner)}><SelectTrigger className="h-9 w-32"><UserRound className="size-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All owners</SelectItem><SelectItem value="mine">Assigned to me</SelectItem><SelectItem value="unassigned">Unassigned</SelectItem></SelectContent></Select>
          <Select value={hasEmail} onValueChange={(next) => setHasEmail(next as typeof hasEmail)}><SelectTrigger className="hidden h-9 w-32 md:flex"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any email</SelectItem><SelectItem value="yes">Has email</SelectItem><SelectItem value="no">No email</SelectItem></SelectContent></Select>
          <Button variant="outline" size="sm"><Filter />More filters{activeFilters ? <span className="rounded bg-primary px-1 text-[10px] text-primary-foreground">{activeFilters}</span> : null}</Button>
          <div className="ml-auto flex items-center gap-1"><Select value={sort} onValueChange={(next) => setSort(next as Sort)}><SelectTrigger className="h-9 w-32"><SlidersHorizontal className="size-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="number">Import order</SelectItem><SelectItem value="recent">Recently touched</SelectItem><SelectItem value="username">Username</SelectItem></SelectContent></Select><div className="flex rounded-md border border-input bg-card p-0.5"><Button variant={view === "table" ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setView("table")} aria-label="Table view"><LayoutList /></Button><Button variant={view === "board" ? "secondary" : "ghost"} size="icon" className="size-8" onClick={() => setView("board")} aria-label="Board view"><Columns3 /></Button></div></div>
        </div>}
      </div>

      {activeFilters || search ? <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">{status !== "all" ? <FilterChip label={`Stage: ${STATUSES.find((item) => item.value === status)?.label}`} onRemove={() => setStatus("all")} /> : null}{owner !== "all" ? <FilterChip label={owner === "mine" ? "Assigned to me" : "Unassigned"} onRemove={() => setOwner("all")} /> : null}{hasEmail !== "all" ? <FilterChip label={hasEmail === "yes" ? "Has email" : "No email"} onRemove={() => setHasEmail("all")} /> : null}<button onClick={clearFilters} className="hover:text-foreground">Clear all</button></div> : <div className="h-3" />}
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>{filtered.length.toLocaleString()} results</span><span>Live workspace</span></div>
      {isLoading ? <TableSkeleton /> : error ? <ErrorState onRetry={() => queryClient.invalidateQueries({ queryKey: ["leads"] })} /> : view === "table" ? <LeadTable leads={filtered} ownerName={ownerName} selected={selected} onToggleSelect={(id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; })} onSelectAll={() => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((lead) => lead.id)))} onOpen={setActiveLead} onStatusChange={(ids, next) => mutation.mutate({ ids, next })} /> : <LeadBoard onAddStage={() => setManageStagesOpen(true)} leads={filtered} ownerName={ownerName} onOpen={setActiveLead} onStatusChange={(ids, next) => mutation.mutate({ ids, next })} />}
    </div>
    <InstagramBatchDialog open={batchOpen} onOpenChange={setBatchOpen} leads={filtered} onReview={(batch) => { setBatchOpen(false); setSwipeQueue(batch); setSwipeOpen(true); }} />
    <SwipeReview open={swipeOpen} onOpenChange={setSwipeOpen} queue={swipeQueue} onFinish={saveDecisions} />
  </div>;
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) { return <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs text-foreground">{label}<button onClick={onRemove} aria-label={`Remove ${label}`}><X className="size-3" /></button></span>; }