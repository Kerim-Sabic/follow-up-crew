import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { STAGE_COLORS, colorMeta, createStage, deleteStage, renameStage, type Stage } from "@/lib/crm";

export function ManageStagesDialog() {
  const { manageStagesOpen, setManageStagesOpen, rawStages, workspace, workspaceLabel, leads } = useWorkspace();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("amber");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["lead-stages"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const add = useMutation({
    mutationFn: () =>
      createStage(workspace, {
        label: label.trim(),
        color,
        position: (rawStages.at(-1)?.position ?? 0) + 1,
      }),
    onSuccess: () => {
      setLabel("");
      refresh();
      toast.success("Stage added");
    },
    onError: () => toast.error("Couldn't add that stage. Try again."),
  });

  const remove = useMutation({
    mutationFn: (stage: Stage) => deleteStage(stage),
    onSuccess: () => {
      refresh();
      toast.success("Stage removed — its leads moved back to Not contacted");
    },
    onError: () => toast.error("Couldn't remove that stage."),
  });

  const recolor = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { label?: string; color?: string } }) => renameStage(id, patch),
    onSuccess: refresh,
    onError: () => toast.error("Couldn't save that change."),
  });

  return (
    <Dialog open={manageStagesOpen} onOpenChange={setManageStagesOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Stages in {workspaceLabel}</DialogTitle>
          <DialogDescription>
            Add your own stages next to the built-in ones. Everyone on this list sees them instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {rawStages.map((stage) => {
            const meta = colorMeta(stage.color);
            const count = leads.filter((lead) => (lead.stage ?? lead.status) === stage.key).length;
            return (
              <div key={stage.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                <span className={cn("size-2.5 shrink-0 rounded-full", meta.dot)} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{stage.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
                {stage.is_builtin ? (
                  <Lock className="size-3.5 text-muted-foreground" />
                ) : (
                  <>
                    <select
                      value={stage.color}
                      onChange={(event) => recolor.mutate({ id: stage.id, patch: { color: event.target.value } })}
                      className="h-7 rounded-md border border-input bg-card px-1.5 text-xs outline-none"
                    >
                      {STAGE_COLORS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => remove.mutate(stage)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      title="Remove stage"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (label.trim()) add.mutate();
          }}
          className="flex items-center gap-2 border-t border-border pt-4"
        >
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="New stage name, e.g. Follow-up sent"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/25"
          />
          <select
            value={color}
            onChange={(event) => setColor(event.target.value)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm outline-none"
          >
            {STAGE_COLORS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" disabled={!label.trim() || add.isPending}>
            <Plus />
            Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
