import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchLeads,
  fetchProfiles,
  fetchStages,
  setQualityContext,
  setStatusRegistry,
  toStageMeta,
  type Lead,
  type Profile,
  type Stage,
  type StageMeta,
  type Workspace,
} from "@/lib/crm";
import { readWorkspaces } from "./creator-api";

const STORAGE_KEY = "crm.workspace";

type WorkspaceValue = {
  workspace: Workspace;
  setWorkspace: (workspace: Workspace) => void;
  workspaceLabel: string;
  workspaces: { value: string; label: string; description: string }[];
  leads: Lead[];
  profiles: Profile[];
  stages: StageMeta[];
  rawStages: Stage[];
  stageMeta: (key: string) => StageMeta;
  manageStagesOpen: boolean;
  setManageStagesOpen: (open: boolean) => void;
  isLoading: boolean;
  error: Error | null;
  ownerName: (id: string | null) => string;
  addLeadOpen: boolean;
  setAddLeadOpen: (open: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  activeLead: Lead | null;
  setActiveLead: (lead: Lead | null) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [workspace, setWorkspaceState] = useState<Workspace>("");
  const workspaceQuery = useQuery({
    queryKey: ["workspaces", userId],
    queryFn: readWorkspaces,
    staleTime: 0,
    refetchInterval: 30_000,
  });
  const workspaces = useMemo(
    () =>
      (workspaceQuery.data ?? []).map((w) => ({ value: w.id, label: w.name, description: w.kind })),
    [workspaceQuery.data],
  );
  // Legacy screens use a bounded working set; Leads uses server pagination.
  const leadsQuery = useQuery({
    queryKey: ["leads", userId, workspace],
    enabled: Boolean(workspace),
    queryFn: () => fetchLeads(workspace),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
  const profilesQuery = useQuery({
    queryKey: ["profiles", userId, workspace],
    queryFn: () => fetchProfiles(workspace),
    enabled: Boolean(workspace),
    staleTime: 30_000,
  });
  const stagesQuery = useQuery({
    queryKey: ["lead-stages", userId, workspace],
    queryFn: () => fetchStages(workspace),
    enabled: Boolean(workspace),
    staleTime: 30_000,
  });
  const [manageStagesOpen, setManageStagesOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [activeLeadSnapshot, setActiveLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (!workspaceQuery.data) return;
    const stored = window.localStorage.getItem(`${STORAGE_KEY}.${userId}`);
    const next = workspaces.some((w) => w.value === workspace)
      ? workspace
      : (workspaces.find((w) => w.value === stored)?.value ?? workspaces[0]?.value ?? "");
    if (next !== workspace) {
      setWorkspaceState(next);
      setActiveLead(null);
    }
  }, [workspaceQuery.data, workspaces, userId, workspace]);

  function setWorkspace(next: Workspace) {
    if (!workspaces.some((w) => w.value === next)) return;
    queryClient.removeQueries({
      predicate: (q) => !["workspaces"].includes(String(q.queryKey[0])),
    });
    setWorkspaceState(next);
    setActiveLead(null);
    window.localStorage.setItem(`${STORAGE_KEY}.${userId}`, next);
  }

  useEffect(() => {
    // One refetch per burst: a bulk stage change fires hundreds of row events.
    let leadsTimer: ReturnType<typeof setTimeout> | undefined;
    const refetchLeads = () => {
      if (leadsTimer) clearTimeout(leadsTimer);
      leadsTimer = setTimeout(() => {
        for (const key of ["leads", "lead-page", "lead-counts"])
          void queryClient.invalidateQueries({ queryKey: [key] });
      }, 1500);
    };
    const channel = supabase
      .channel(`crm-live:${userId}:${workspace}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `workspace=eq.${workspace}` },
        refetchLeads,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_notes" }, () => {
        queryClient.invalidateQueries({ queryKey: ["lead-notes"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        queryClient.invalidateQueries({ queryKey: ["profiles"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_stages" }, () => {
        queryClient.invalidateQueries({ queryKey: ["lead-stages"] });
      })
      .subscribe();
    return () => {
      if (leadsTimer) clearTimeout(leadsTimer);
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId, workspace]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data]);
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const rawStages = useMemo(() => stagesQuery.data ?? [], [stagesQuery.data]);
  const stages = useMemo(() => rawStages.map(toStageMeta), [rawStages]);
  setStatusRegistry(stages);
  useMemo(() => setQualityContext(leads), [leads]);

  const activeLead = useMemo(() => {
    if (!activeLeadSnapshot) return null;
    return leads.find((lead) => lead.id === activeLeadSnapshot.id) ?? activeLeadSnapshot;
  }, [activeLeadSnapshot, leads]);
  const value = useMemo<WorkspaceValue>(
    () => ({
      workspace,
      setWorkspace,
      workspaceLabel: workspaces.find((item) => item.value === workspace)?.label ?? "Workspace",
      workspaces,
      leads,
      profiles,
      stages,
      rawStages,
      stageMeta: (key: string) =>
        stages.find((item) => item.value === key) ??
        stages[0] ?? {
          value: key,
          label: key,
          color: "slate",
          className: "bg-slate-500/12 text-slate-600",
          dot: "bg-slate-500",
          isBuiltin: true,
        },
      manageStagesOpen,
      setManageStagesOpen,
      isLoading: leadsQuery.isLoading || profilesQuery.isLoading,
      error: (workspaceQuery.error ?? leadsQuery.error ?? profilesQuery.error) as Error | null,
      ownerName: (id) => {
        if (!id) return "Unassigned";
        if (id === userId) return "You";
        return profiles.find((profile) => profile.id === id)?.display_name ?? "Teammate";
      },
      addLeadOpen,
      setAddLeadOpen,
      commandOpen,
      setCommandOpen,
      activeLead,
      setActiveLead,
    }),
    [
      activeLead,
      addLeadOpen,
      commandOpen,
      manageStagesOpen,
      stages,
      rawStages,
      leads,
      leadsQuery.error,
      leadsQuery.isLoading,
      profiles,
      profilesQuery.error,
      profilesQuery.isLoading,
      userId,
      workspace,
      workspaces,
      workspaceQuery.error,
    ],
  );

  if (workspaceQuery.isLoading)
    return (
      <p className="p-8" role="status">
        Loading your private workspaces…
      </p>
    );
  if (workspaceQuery.error)
    return (
      <p className="p-8" role="alert">
        {workspaceQuery.error.message}
      </p>
    );
  if (!workspaceQuery.data?.length)
    return (
      <p className="p-8">
        Verify your email to provision your private workspace. If already verified, apply the
        trust-foundation migration.
      </p>
    );
  if (!workspace) return <p className="p-8">Selecting workspace…</p>;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

/** Patches every cached leads list immediately so a stage change shows up without waiting for a refetch. */
export function useOptimisticStage() {
  const queryClient = useQueryClient();
  return (ids: string[], stage: string, userId: string) => {
    const set = new Set(ids);
    const now = new Date().toISOString();
    queryClient.setQueriesData<Lead[]>({ queryKey: ["leads"] }, (old) =>
      old?.map((lead) =>
        set.has(lead.id)
          ? {
              ...lead,
              stage,
              last_touched_at: now,
              last_touched_by: userId || lead.last_touched_by,
              owner_id: stage !== "not_contacted" && userId ? userId : lead.owner_id,
            }
          : lead,
      ),
    );
  };
}
