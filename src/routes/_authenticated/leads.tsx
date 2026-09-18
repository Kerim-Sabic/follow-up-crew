import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  STATUSES,
  fetchLeads,
  fetchProfiles,
  updateLeadStatus,
  type Lead,
  type LeadStatus,
} from "@/lib/crm";
import { StatsBar } from "@/components/crm/StatsBar";
import { LeadTable } from "@/components/crm/LeadTable";
import { LeadBoard } from "@/components/crm/LeadBoard";
import { LeadPanel } from "@/components/crm/LeadPanel";
import { AddLeadDialog } from "@/components/crm/AddLeadDialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({
    meta: [
      { title: "Leads — Outreach CRM" },
      { name: "description", content: "Your team's live outreach pipeline." },
      { property: "og:title", content: "Leads — Outreach CRM" },
      { property: "og:description", content: "Your team's live outreach pipeline." },
    ],
  }),
  component: LeadsPage,
});

function LeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [view, setView] = useState<"table" | "board">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const leadsQuery = useQuery({ queryKey: ["leads"], queryFn: fetchLeads });
  const profilesQuery = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });

  useEffect(() => {
    const channel = supabase
      .channel("crm-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_notes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["lead-notes"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        queryClient.invalidateQueries({ queryKey: ["profiles"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);

  const ownerName = (id: string | null) => {
    if (!id) return "Unassigned";
    if (id === user?.id) return "You";
    return profiles.find((profile) => profile.id === id)?.display_name ?? "Teammate";
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (mineOnly && lead.owner_id !== user?.id) return false;
      if (!term) return true;
      return (
        lead.username.toLowerCase().includes(term) ||
        (lead.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [leads, search, statusFilter, mineOnly, user?.id]);

  const statusMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: LeadStatus }) =>
      updateLeadStatus(ids, status, user!.id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      if (variables.ids.length > 1) {
        toast.success(`${variables.ids.length} leads updated`);
        setSelected(new Set());
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeStatus = (ids: string[], status: LeadStatus) =>
    statusMutation.mutate({ ids, status });

  const openLead = leads.find((lead) => lead.id === openLeadId) ?? null;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3">
          <div>
            <p className="font-display text-base tracking-tight text-foreground">Outreach CRM</p>
            <p className="text-xs text-muted-foreground">
              {leads.length.toLocaleString()} leads · live
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {profiles.find((profile) => profile.id === user?.id)?.display_name ?? user?.email}
            </span>
            <button
              onClick={signOut}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-5 py-6">
        <StatsBar leads={leads} profiles={profiles} />

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search username or email…"
            className="h-10 min-w-56 flex-1 rounded-lg border border-input bg-card px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/40"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as LeadStatus | "all")}
            className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option value="all">All stages</option>
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setMineOnly((value) => !value)}
            className={cn(
              "h-10 rounded-lg border border-border px-3 text-sm transition-colors",
              mineOnly ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
            )}
          >
            Only mine
          </button>
          <div className="flex h-10 items-center rounded-lg border border-border bg-card p-1">
            {(["table", "board"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setView(option)}
                className={cn(
                  "h-8 rounded-md px-3 text-sm capitalize transition-colors",
                  view === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-accent/60 px-4 py-2.5">
            <span className="text-sm font-medium text-foreground">
              {selected.size} selected — set stage to
            </span>
            {STATUSES.map((status) => (
              <button
                key={status.value}
                onClick={() => changeStatus([...selected], status.value)}
                className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground hover:bg-secondary"
              >
                {status.label}
              </button>
            ))}
            <button
              onClick={() => setSelected(new Set())}
              className="ml-auto text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Showing {filtered.length.toLocaleString()} of {leads.length.toLocaleString()} leads
          {leadsQuery.isLoading ? " · loading…" : ""}
        </p>

        {view === "table" ? (
          <LeadTable
            leads={filtered}
            ownerName={ownerName}
            selected={selected}
            onToggleSelect={(id) =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onOpen={(lead: Lead) => setOpenLeadId(lead.id)}
            onStatusChange={changeStatus}
          />
        ) : (
          <LeadBoard
            leads={filtered}
            ownerName={ownerName}
            onOpen={(lead: Lead) => setOpenLeadId(lead.id)}
            onStatusChange={changeStatus}
          />
        )}
      </main>

      {openLead && user ? (
        <LeadPanel
          lead={openLead}
          userId={user.id}
          ownerName={ownerName}
          onClose={() => setOpenLeadId(null)}
          onStatusChange={changeStatus}
        />
      ) : null}
    </div>
  );
}
