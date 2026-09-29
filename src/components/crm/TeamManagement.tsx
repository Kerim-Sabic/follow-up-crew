import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/creator-api";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
type Member = { user_id: string; role: string; protected_founder: boolean };
export function TeamManagement() {
  const { workspace, profiles } = useWorkspace();
  const { user } = useAuth();
  const cache = useQueryClient();
  const [name, setName] = useState("");
  const members = useQuery({
    queryKey: ["members", user?.id, workspace],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workspace_members" as never)
        .select("*")
        .eq("workspace", workspace);
      if (error) throw error;
      return data as unknown as Member[];
    },
  });
  const owner = members.data?.find((m) => m.user_id === user?.id)?.role === "owner";
  async function change(id: string, role: string | null) {
    try {
      await rpc("manage_workspace_member", { w: workspace, uid: id, r: role });
      await cache.invalidateQueries({ queryKey: ["members"] });
      await cache.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Membership updated");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <section className="space-y-3 rounded border p-5">
      <h2 className="text-lg font-semibold">Workspaces and memberships</h2>
      <label className="block text-sm">
        New private team workspace name
        <input
          className="mt-1 w-full rounded border p-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <Button
        disabled={!name.trim()}
        onClick={async () => {
          try {
            await rpc("create_team_workspace", { n: name });
            setName("");
            await cache.invalidateQueries({ queryKey: ["workspaces"] });
            toast.success("Team workspace created; select it in the workspace switcher");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        Create workspace
      </Button>
      <p className="text-sm text-muted-foreground">
        Only you are added. Existing leads stay in their current workspace.
      </p>
      {members.error && <p role="alert">{members.error.message}</p>}
      {members.data?.map((m) => (
        <div key={m.user_id} className="flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
          <span className="flex-1">
            {profiles.find((p) => p.id === m.user_id)?.display_name ?? m.user_id}
            {m.protected_founder ? " · protected founder" : ""}
          </span>
          <select
            aria-label={`Role for ${profiles.find((p) => p.id === m.user_id)?.display_name ?? m.user_id}`}
            className="rounded border p-2"
            disabled={!owner || m.protected_founder}
            value={m.role}
            onChange={(e) => void change(m.user_id, e.target.value)}
          >
            {["owner", "admin", "member", "viewer"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={!owner || m.protected_founder || m.user_id === user?.id}
            onClick={() => void change(m.user_id, null)}
          >
            Remove member
          </Button>
        </div>
      ))}
    </section>
  );
}
