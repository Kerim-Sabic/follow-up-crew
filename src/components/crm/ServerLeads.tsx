import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { leadPage, rpc } from "@/lib/creator-api";
import { updateLeadStatus } from "@/lib/crm";
import { exportFullLeads } from "@/lib/export";
import { LeadTable } from "@/components/crm/LeadTable";
import { Button } from "@/components/ui/button";

export function ServerLeads() {
  const { workspace, workspaceLabel, stages, ownerName, setActiveLead, setAddLeadOpen } =
    useWorkspace();
  const { user } = useAuth();
  const cache = useQueryClient();
  const [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [stage, setStage] = useState(""),
    [owner, setOwner] = useState(""),
    [email, setEmail] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [selected, setSelected] = useState(new Set<string>());
  const cursor = cursors.at(-1) ?? null;
  const query = useQuery({
    queryKey: ["lead-page", user?.id, workspace, q, stage, owner, email, cursor],
    queryFn: () => leadPage(workspace, q, stage, owner, email, cursor),
  });
  const counts = useQuery({
    queryKey: ["lead-counts", user?.id, workspace],
    queryFn: () => rpc<{ stage: string; total: number }[]>("lead_counts", { w: workspace }),
  });
  const rows = query.data?.slice(0, 100) ?? [];
  const hasNext = (query.data?.length ?? 0) > 100;
  const update = useMutation({
    mutationFn: ({ ids, next }: { ids: string[]; next: string }) =>
      updateLeadStatus(ids, next, user!.id),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["lead-page"] });
      void cache.invalidateQueries({
        predicate: (query) =>
          ["leads", "lead-page", "lead-counts"].includes(String(query.queryKey[0])),
      });
      void cache.invalidateQueries({ queryKey: ["lead-counts"] });
      setSelected(new Set());
    },
    onError: (e) => toast.error(e.message),
  });
  function reset() {
    setCursors([null]);
    setSelected(new Set());
  }
  const field = "rounded border bg-card p-2 text-sm";
  return (
    <div className="space-y-4 p-6">
      <header className="flex justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {workspaceLabel} ·{" "}
            {counts.data?.reduce((n, r) => n + Number(r.total), 0).toLocaleString() ?? "…"} stored
            records · 100 per page
          </p>
        </div>
        <Button onClick={() => setAddLeadOpen(true)}>Add lead</Button>
      </header>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search.trim());
          reset();
        }}
      >
        <input
          className={field}
          aria-label="Search all workspace leads"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search username, name or email"
        />
        <Button type="submit">Search all records</Button>
        <select
          aria-label="Stage"
          className={field}
          value={stage}
          onChange={(e) => {
            setStage(e.target.value);
            reset();
          }}
        >
          <option value="">All stages</option>
          {stages.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Owner"
          className={field}
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            reset();
          }}
        >
          <option value="">All owners</option>
          <option value="mine">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
        <select
          aria-label="Email"
          className={field}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            reset();
          }}
        >
          <option value="">Any email</option>
          <option value="yes">Has email</option>
          <option value="no">No email</option>
        </select>
      </form>
      {selected.size > 0 && (
        <div className="flex items-center gap-3 text-sm">
          <span>{selected.size} selected on this page</span>
          <Button
            variant="outline"
            onClick={() =>
              exportFullLeads(
                rows.filter((r) => selected.has(r.id)),
                "selected-workspace-leads.csv",
              )
            }
          >
            Export selected
          </Button>
        </div>
      )}
      {query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : query.isLoading ? (
        <p role="status">Loading page…</p>
      ) : (
        <LeadTable
          leads={rows}
          ownerName={ownerName}
          selected={selected}
          onOpen={setActiveLead}
          onToggleSelect={(id) =>
            setSelected((old) => {
              const n = new Set(old);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
          onSelectAll={() =>
            setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))
          }
          onStatusChange={(ids, next) => update.mutate({ ids, next })}
        />
      )}
      <footer className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={cursors.length === 1}
          onClick={() => {
            setCursors((c) => c.slice(0, -1));
            setSelected(new Set());
          }}
        >
          Previous
        </Button>
        <span className="text-sm">Page {cursors.length} · stable ID order</span>
        <Button
          variant="outline"
          disabled={!hasNext}
          onClick={() => {
            setCursors((c) => [...c, rows.at(-1)!.id]);
            setSelected(new Set());
          }}
        >
          Next
        </Button>
      </footer>
      <p className="text-xs text-muted-foreground">
        Selection and export apply to this page. Durable all-matching export is not implemented.
      </p>
    </div>
  );
}
