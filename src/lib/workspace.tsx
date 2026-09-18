import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeads, fetchProfiles, type Lead, type Profile } from "@/lib/crm";

type WorkspaceValue = {
  leads: Lead[];
  profiles: Profile[];
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
  const leadsQuery = useQuery({ queryKey: ["leads"], queryFn: fetchLeads });
  const profilesQuery = useQuery({ queryKey: ["profiles"], queryFn: fetchProfiles });
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

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
    return () => void supabase.removeChannel(channel);
  }, [queryClient]);

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
  const value = useMemo<WorkspaceValue>(() => ({
    leads,
    profiles,
    isLoading: leadsQuery.isLoading || profilesQuery.isLoading,
    error: (leadsQuery.error ?? profilesQuery.error) as Error | null,
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
  }), [activeLead, addLeadOpen, commandOpen, leads, leadsQuery.error, leadsQuery.isLoading, profiles, profilesQuery.error, profilesQuery.isLoading, userId]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}