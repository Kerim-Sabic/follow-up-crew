import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type Workspace = Database["public"]["Enums"]["workspace_key"];

export const WORKSPACES: { value: Workspace; label: string; description: string }[] = [
  { value: "docmesker", label: "DocMesKer", description: "Original outreach list" },
  { value: "justin", label: "Justin", description: "Curated creator list" },
];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type LeadNote = Database["public"]["Tables"]["lead_notes"]["Row"];

export const STATUSES: { value: LeadStatus; label: string; className: string; dot: string }[] = [
  {
    value: "not_contacted",
    label: "Not contacted",
    className: "bg-status-new-soft text-status-new",
    dot: "bg-status-new",
  },
  {
    value: "contacted",
    label: "Contacted",
    className: "bg-status-contacted-soft text-status-contacted",
    dot: "bg-status-contacted",
  },
  {
    value: "replied",
    label: "Replied",
    className: "bg-status-replied-soft text-status-replied",
    dot: "bg-status-replied",
  },
  {
    value: "deal",
    label: "Deal",
    className: "bg-status-deal-soft text-status-deal",
    dot: "bg-status-deal",
  },
  {
    value: "dead",
    label: "Dead",
    className: "bg-status-dead-soft text-status-dead",
    dot: "bg-status-dead",
  },
];

export function statusMeta(status: LeadStatus) {
  return STATUSES.find((s) => s.value === status) ?? STATUSES[0]!;
}

const PAGE = 1000;

export async function fetchLeads(workspace: Workspace): Promise<Lead[]> {
  const all: Lead[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("workspace", workspace)
      .order("number", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function fetchNotes(leadId: string): Promise<LeadNote[]> {
  const { data, error } = await supabase
    .from("lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateLeadStatus(ids: string[], status: LeadStatus, userId: string) {
  const patch: Database["public"]["Tables"]["leads"]["Update"] = {
    status,
    last_touched_at: new Date().toISOString(),
    last_touched_by: userId,
  };
  if (status !== "not_contacted") patch.owner_id = userId;
  const { error } = await supabase.from("leads").update(patch).in("id", ids);
  if (error) throw error;
}

export type NewLeadInput = {
  username: string;
  email?: string | null;
  instagram_url?: string | null;
  match_note?: string | null;
  status?: LeadStatus;
};

export async function createLead(input: NewLeadInput, userId: string): Promise<Lead> {
  const { data: last } = await supabase
    .from("leads")
    .select("number")
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const username = input.username.trim().replace(/^@/, "");
  const status = input.status ?? "not_contacted";
  const { data, error } = await supabase
    .from("leads")
    .insert({
      number: (last?.number ?? 0) + 1,
      username,
      email: input.email?.trim() || null,
      instagram_url: input.instagram_url?.trim() || `https://instagram.com/${username}`,
      match_note: input.match_note?.trim() || null,
      status,
      owner_id: status === "not_contacted" ? null : userId,
      last_touched_at: status === "not_contacted" ? null : new Date().toISOString(),
      last_touched_by: status === "not_contacted" ? null : userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function claimLead(id: string, userId: string | null) {
  const { error } = await supabase.from("leads").update({ owner_id: userId }).eq("id", id);
  if (error) throw error;
}

export async function addNote(leadId: string, authorId: string, body: string) {
  const { error } = await supabase
    .from("lead_notes")
    .insert({ lead_id: leadId, author_id: authorId, body });
  if (error) throw error;
}

export function formatWhen(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
