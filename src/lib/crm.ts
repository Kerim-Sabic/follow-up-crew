import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type LeadStatus = string;
export type BaseStatus = Database["public"]["Enums"]["lead_status"];
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

export function instagramUrl(lead: Pick<Lead, "username" | "instagram_url">) {
  const handle = lead.username.trim().replace(/^@/, "");
  return lead.instagram_url?.trim() || `https://instagram.com/${handle}`;
}

export function statusMeta(status: LeadStatus) {
  return STATUSES.find((s) => s.value === status) ?? STATUSES[0]!;
}

// ---------- custom stages ----------

export type Stage = Database["public"]["Tables"]["lead_stages"]["Row"];

export type StageMeta = {
  value: string;
  label: string;
  color: string;
  className: string;
  dot: string;
  isBuiltin: boolean;
  id?: string;
};

export const STAGE_COLORS: { value: string; label: string; className: string; dot: string }[] = [
  { value: "slate", label: "Grey", className: "bg-slate-500/12 text-slate-600 dark:text-slate-300", dot: "bg-slate-500" },
  { value: "blue", label: "Blue", className: "bg-blue-500/12 text-blue-600 dark:text-blue-300", dot: "bg-blue-500" },
  { value: "violet", label: "Violet", className: "bg-violet-500/12 text-violet-600 dark:text-violet-300", dot: "bg-violet-500" },
  { value: "emerald", label: "Green", className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300", dot: "bg-emerald-500" },
  { value: "amber", label: "Amber", className: "bg-amber-500/14 text-amber-600 dark:text-amber-300", dot: "bg-amber-500" },
  { value: "rose", label: "Red", className: "bg-rose-500/12 text-rose-600 dark:text-rose-300", dot: "bg-rose-500" },
  { value: "cyan", label: "Cyan", className: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-300", dot: "bg-cyan-500" },
  { value: "orange", label: "Orange", className: "bg-orange-500/14 text-orange-600 dark:text-orange-300", dot: "bg-orange-500" },
];

export function colorMeta(color: string) {
  return STAGE_COLORS.find((item) => item.value === color) ?? STAGE_COLORS[0]!;
}

export function toStageMeta(stage: Stage): StageMeta {
  const color = colorMeta(stage.color);
  return {
    value: stage.key,
    label: stage.label,
    color: stage.color,
    className: color.className,
    dot: color.dot,
    isBuiltin: stage.is_builtin,
    id: stage.id,
  };
}

export function setStatusRegistry(stages: StageMeta[]) {
  if (!stages.length) return;
  const next = stages.map((stage) => ({ value: stage.value, label: stage.label, className: stage.className, dot: stage.dot }));
  const same = next.length === STATUSES.length && next.every((item, index) => {
    const current = STATUSES[index]!;
    return current.value === item.value && current.label === item.label && current.className === item.className;
  });
  if (same) return;
  STATUSES.splice(0, STATUSES.length, ...next);
}

export function leadStage(lead: Pick<Lead, "stage" | "status">) {
  return lead.stage ?? lead.status;
}

export async function fetchStages(workspace: Workspace): Promise<Stage[]> {
  const { data, error } = await supabase
    .from("lead_stages")
    .select("*")
    .eq("workspace", workspace)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function stageKey(label: string) {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return (base || "stage") + "_" + Math.random().toString(36).slice(2, 6);
}

export async function createStage(
  workspace: Workspace,
  input: { label: string; color: string; base_status?: BaseStatus; position: number },
) {
  const { data, error } = await supabase
    .from("lead_stages")
    .insert({
      workspace,
      key: stageKey(input.label),
      label: input.label.trim(),
      color: input.color,
      position: input.position,
      is_builtin: false,
      base_status: input.base_status ?? "contacted",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function renameStage(id: string, patch: { label?: string; color?: string; position?: number }) {
  const { error } = await supabase.from("lead_stages").update(patch).eq("id", id);
  if (error) throw error;
}

/** Persists a new stage order; ids must be in the desired order. */
export async function reorderStages(ids: string[]) {
  for (const [index, id] of ids.entries()) {
    const { error } = await supabase.from("lead_stages").update({ position: index }).eq("id", id);
    if (error) throw error;
  }
}

export async function deleteStage(stage: Stage) {
  const { error: moveError } = await supabase
    .from("leads")
    .update({ stage: "not_contacted" })
    .eq("workspace", stage.workspace)
    .eq("stage", stage.key);
  if (moveError) throw moveError;
  const { error } = await supabase.from("lead_stages").delete().eq("id", stage.id);
  if (error) throw error;
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
    stage: status,
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
  full_name?: string | null;
  niche?: string | null;
  status?: LeadStatus;
};

async function nextNumber(workspace: Workspace) {
  const { data } = await supabase
    .from("leads")
    .select("number")
    .eq("workspace", workspace)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.number ?? 0) + 1;
}

export async function createLead(input: NewLeadInput, userId: string, workspace: Workspace): Promise<Lead> {
  const start = await nextNumber(workspace);
  const username = input.username.trim().replace(/^@/, "");
  const status = input.status ?? "not_contacted";
  const { data, error } = await supabase
    .from("leads")
    .insert({
      number: start,
      workspace,
      username,
      email: input.email?.trim() || null,
      full_name: input.full_name?.trim() || null,
      niche: input.niche?.trim() || null,
      instagram_url: input.instagram_url?.trim() || `https://instagram.com/${username}`,
      match_note: input.match_note?.trim() || null,
      stage: status,
      owner_id: status === "not_contacted" ? null : userId,
      last_touched_at: status === "not_contacted" ? null : new Date().toISOString(),
      last_touched_by: status === "not_contacted" ? null : userId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function createLeads(inputs: NewLeadInput[], workspace: Workspace): Promise<number> {
  if (inputs.length === 0) return 0;
  const start = await nextNumber(workspace);
  const rows = inputs.map((input, index) => {
    const username = input.username.trim().replace(/^@/, "");
    return {
      number: start + index,
      workspace,
      username,
      email: input.email?.trim() || null,
      full_name: input.full_name?.trim() || null,
      niche: input.niche?.trim() || null,
      instagram_url: input.instagram_url?.trim() || `https://instagram.com/${username}`,
      match_note: input.match_note?.trim() || null,
      stage: "not_contacted",
    };
  });
  const { error } = await supabase.from("leads").insert(rows);
  if (error) throw error;
  return rows.length;
}

export type LeadEnrichment = {
  niche?: string | null;
  score?: number | null;
  curation?: string | null;
  match_note?: string | null;
  email?: string | null;
  full_name?: string | null;
};

export async function updateLeadFields(id: string, patch: LeadEnrichment) {
  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) throw error;
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

// ---------- monetizable audience quality ----------

/**
 * Ranks creators by how likely their audience converts into buyers — never by
 * follower count (which we don't track).
 *
 * Two things make this accurate instead of "everyone is low":
 * 1. Coverage-aware: a lead is only graded on the signals we actually know
 *    about. Missing data lowers confidence, not the score.
 * 2. Relative: tiers come from how a lead ranks against the rest of the list,
 *    so "high value" always means the genuine top of this workspace.
 */
export type QualityBreakdown = { label: string; points: number }[];

export const NICHES_WITH_BUYERS = ["health", "wealth", "relationship", "fitness", "business", "finance", "dating", "money", "coach", "nutrition", "wellness", "strength", "beauty", "education", "marketing", "real estate"];

type QualityLead = Pick<Lead, "email" | "niche" | "curation" | "score" | "match_note" | "evidence" | "full_name" | "username">;

type QualityContext = { maxScore: number; highCut: number; mediumCut: number; size: number };

let QUALITY_CTX: QualityContext = { maxScore: 100, highCut: 999, mediumCut: 999, size: 0 };

const WEIGHTS = { email: 22, niche: 26, curation: 18, match: 20, profile: 14 };

function nicheFit(niche: string) {
  const value = niche.trim().toLowerCase();
  if (!value) return null;
  return NICHES_WITH_BUYERS.some((item) => value.includes(item)) ? 1 : 0.5;
}

function rawQuality(lead: QualityLead, ctx: QualityContext) {
  const parts: { label: string; weight: number; value: number }[] = [];

  parts.push({ label: lead.email?.trim() ? "Email on file — can be reached" : "No email yet", weight: WEIGHTS.email, value: lead.email?.trim() ? 1 : 0 });

  const fit = nicheFit(lead.niche ?? "");
  if (fit !== null) {
    parts.push({ label: fit === 1 ? `Niche with buyers (${lead.niche})` : `Niche: ${lead.niche}`, weight: WEIGHTS.niche, value: fit });
  }

  const curation = lead.curation?.trim().toUpperCase();
  if (curation) {
    parts.push({ label: curation === "KEEP" ? "Kept in review" : "Rejected in review", weight: WEIGHTS.curation, value: curation === "KEEP" ? 1 : 0 });
  }

  if (typeof lead.score === "number") {
    const value = Math.max(0, Math.min(1, lead.score / (ctx.maxScore || 1)));
    parts.push({ label: "Match strength vs the list", weight: WEIGHTS.match, value });
  }

  let richness = 0;
  if (lead.full_name?.trim()) richness += 0.35;
  if (lead.evidence?.trim()) richness += 0.4;
  if ((lead.match_note ?? "").trim().length > 40) richness += 0.25;
  parts.push({ label: "Profile detail we hold", weight: WEIGHTS.profile, value: Math.min(1, richness) });

  const knownWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const earned = parts.reduce((sum, part) => sum + part.weight * part.value, 0);
  const score = Math.round((earned / (knownWeight || 1)) * 100);
  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

  const breakdown: QualityBreakdown = parts
    .filter((part) => part.value > 0)
    .map((part) => ({ label: part.label, points: Math.round((part.weight * part.value) / (knownWeight || 1) * 100) }));

  return { score, breakdown, confidence: Math.round((knownWeight / totalWeight) * 100), missing: parts.length < 5 };
}

/** Recomputes the relative grading curve for the current workspace list. */
export function setQualityContext(leads: QualityLead[]) {
  if (!leads.length) return;
  const maxScore = Math.max(1, ...leads.map((lead) => (typeof lead.score === "number" ? lead.score : 0)));
  const base: QualityContext = { maxScore, highCut: 999, mediumCut: 999, size: leads.length };
  const scores = leads.map((lead) => rawQuality(lead, base).score).sort((a, b) => a - b);
  const at = (p: number) => scores[Math.min(scores.length - 1, Math.floor(scores.length * p))] ?? 0;
  QUALITY_CTX = { maxScore, highCut: at(0.8), mediumCut: at(0.45), size: leads.length };
}

export function leadQualityScore(lead: QualityLead): { score: number; tier: "high" | "medium" | "low"; breakdown: QualityBreakdown; confidence: number } {
  const { score, breakdown, confidence } = rawQuality(lead, QUALITY_CTX);
  const tier = score >= QUALITY_CTX.highCut ? "high" : score >= QUALITY_CTX.mediumCut ? "medium" : "low";
  return { score, tier, breakdown, confidence };
}

export function qualityTierMeta(tier: "high" | "medium" | "low") {
  if (tier === "high") return { label: "Top of list", className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" };
  if (tier === "medium") return { label: "Promising", className: "bg-amber-500/14 text-amber-600 dark:text-amber-300" };
  return { label: "Lower priority", className: "bg-slate-500/12 text-slate-600 dark:text-slate-300" };
}

/** Sort leads best-first by monetizable audience quality. */
export function byQuality<T extends QualityLead>(leads: T[]): T[] {
  return [...leads].sort((a, b) => leadQualityScore(b).score - leadQualityScore(a).score);
}

