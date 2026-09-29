import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "./crm";

export type WorkspaceRecord = {
  id: string;
  name: string;
  kind: string;
  personal_user_id: string | null;
  timezone: string;
  research_enabled: boolean;
  sending_enabled: boolean;
  complimentary: boolean;
};
type RpcArgs = Record<string, string | number | null>;
// Narrow bridge for new versioned migrations until linked Supabase types are regenerated.
export async function rpc<T>(name: string, args: RpcArgs): Promise<T> {
  const result = await (
    supabase.rpc as unknown as (
      n: string,
      a: RpcArgs,
    ) => Promise<{ data: T; error: { message: string } | null }>
  )(name, args);
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
export async function readWorkspaces(): Promise<WorkspaceRecord[]> {
  const { data, error } = await supabase.from("workspaces" as never).select("*");
  if (error) throw new Error(`Workspace setup required: apply migration 0005. ${error.message}`);
  return data as unknown as WorkspaceRecord[];
}
export async function leadPage(
  w: string,
  q = "",
  s = "",
  o = "",
  e = "",
  after: string | null = null,
) {
  return rpc<Lead[]>("lead_page", { w, q, s, o, e, after_id: after, page_size: 101 });
}
export async function invitationHash(token: string) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buffer), (x) => x.toString(16).padStart(2, "0")).join("");
}
