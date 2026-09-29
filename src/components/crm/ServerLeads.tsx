import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { leadPage, rpc } from "@/lib/creator-api";
import { updateLeadStatus } from "@/lib/crm";
import { exportFullLeads } from "@/lib/export";
import { LeadTable } from "@/components/crm/LeadTable";
import { Button } from "@/components/ui/button";
import { creatorCommand } from "@/lib/creator.functions";

type BulkJob = {
  id: string;
  kind: "stage" | "export";
  target_stage: string | null;
  state: string;
  total: number;
  done: number;
  skipped: number;
  problem: string | null;
};

export function ServerLeads() {
  const { workspace, workspaceLabel, stages, ownerName, setActiveLead, setAddLeadOpen } =
    useWorkspace();
  const { user } = useAuth();
  const cache = useQueryClient();
  const invoke = useServerFn(creatorCommand);
  const [search, setSearch] = useState(""),
    [q, setQ] = useState(""),
    [stage, setStage] = useState(""),
    [owner, setOwner] = useState(""),
    [email, setEmail] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [selected, setSelected] = useState(new Set<string>());
  const [bulkStage, setBulkStage] = useState("");
  const cursor = cursors.at(-1) ?? null;
  const query = useQuery({
    queryKey: ["lead-page", user?.id, workspace, q, stage, owner, email, cursor],
    queryFn: () => leadPage(workspace, q, stage, owner, email, cursor),
  });
  const counts = useQuery({
    queryKey: ["lead-counts", user?.id, workspace],
    queryFn: () => rpc<{ stage: string; total: number }[]>("lead_counts", { w: workspace }),
  });
  const jobs = useQuery({
    queryKey: ["bulk-jobs", user?.id, workspace],
    queryFn: async () =>
      JSON.parse(
        await invoke({ data: { command: JSON.stringify({ action: "bulkJobs", workspace }) } }),
      ) as BulkJob[],
    refetchInterval: (query) =>
      query.state.data?.some((job) => ["queued", "running"].includes(job.state)) ? 2000 : false,
  });
  const startBulk = useMutation({
    mutationFn: async (input: { kind: "stage" | "export"; targetStage?: string }) =>
      JSON.parse(
        await invoke({
          data: {
            command: JSON.stringify({
              action: "createBulkJob",
              workspace,
              requestKey: crypto.randomUUID(),
              filters: { query: q, stage, owner, email },
              ...input,
            }),
          },
        }),
      ) as { id: string; total: number },
    onSuccess: (result) => {
      toast.success(`Queued ${result.total.toLocaleString()} matching leads`);
      void cache.invalidateQueries({ queryKey: ["bulk-jobs", user?.id, workspace] });
    },
    onError: (error) => toast.error(error.message),
  });
  async function download(jobId: string) {
    try {
      const result = JSON.parse(
        await invoke({
          data: {
            command: JSON.stringify({ action: "prepareBulkDownload", workspace, id: jobId }),
          },
        }),
      ) as { token: string };
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `/api/bulk-export/${jobId}`;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "token";
      input.value = result.token;
      form.append(input);
      document.body.append(form);
      form.submit();
      window.setTimeout(() => form.remove(), 1000);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function cancel(jobId: string) {
    try {
      await invoke({
        data: { command: JSON.stringify({ action: "cancelBulkJob", workspace, id: jobId }) },
      });
      void cache.invalidateQueries({ queryKey: ["bulk-jobs", user?.id, workspace] });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
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
      <section className="space-y-2 rounded border p-3" aria-label="All matching lead actions">
        <p className="text-sm font-medium">All matching leads</p>
        <p className="text-xs text-muted-foreground">
          These actions capture every lead matching the current search and filters when queued,
          across all pages. Stage changes skip leads a teammate changes before processing. Exports
          capture each row when the worker reaches it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={startBulk.isPending}
            onClick={() => startBulk.mutate({ kind: "export" })}
          >
            Export all matching
          </Button>
          <select
            className={field}
            aria-label="New stage for all matching leads"
            value={bulkStage}
            onChange={(e) => setBulkStage(e.target.value)}
          >
            <option value="">Choose a stage</option>
            {stages.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={!bulkStage || startBulk.isPending}
            onClick={() => startBulk.mutate({ kind: "stage", targetStage: bulkStage })}
          >
            Move all matching
          </Button>
        </div>
        {jobs.error && (
          <p role="alert" className="text-sm">
            {jobs.error.message}
          </p>
        )}
        {jobs.data?.map((job) => (
          <div key={job.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span>
              {job.kind === "export" ? "Export" : `Move to ${job.target_stage}`} · {job.state} ·{" "}
              {job.done}/{job.total} processed{job.skipped ? ` · ${job.skipped} skipped` : ""}
            </span>
            {job.problem && <span role="alert">{job.problem}</span>}
            {job.kind === "export" && job.state === "completed" && (
              <Button size="sm" variant="outline" onClick={() => void download(job.id)}>
                Download CSV
              </Button>
            )}
            {["queued", "running"].includes(job.state) && (
              <Button size="sm" variant="ghost" onClick={() => void cancel(job.id)}>
                Cancel
              </Button>
            )}
          </div>
        ))}
      </section>
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
        Row selection applies to this page. Use the all-matching actions above for the full filtered
        dataset.
      </p>
    </div>
  );
}
