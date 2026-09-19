import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Lock, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { STAGE_COLORS, colorMeta, createStage, deleteStage, renameStage, reorderStages, type Stage } from "@/lib/crm";

export function ManageStagesDialog() {
  const { manageStagesOpen, setManageStagesOpen, rawStages, workspace, workspaceLabel, leads } = useWorkspace();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("amber");
  const [order, setOrder] = useState<Stage[]>(rawStages);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    setOrder(rawStages);
  }, [rawStages]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const lead of leads) {
      const key = lead.stage ?? lead.status;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [leads]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["lead-stages"] });
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const add = useMutation({
    mutationFn: () => createStage(workspace, { label: label.trim(), color, position: order.length }),
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

  const edit = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { label?: string; color?: string } }) => renameStage(id, patch),
    onSuccess: refresh,
    onError: () => toast.error("Couldn't save that change."),
  });

  const saveOrder = useMutation({
    mutationFn: (ids: string[]) => reorderStages(ids),
    onSuccess: refresh,
    onError: () => {
      setOrder(rawStages);
      toast.error("Couldn't save the new order.");
    },
  });

  const applyOrder = (next: Stage[]) => {
    setOrder(next);
    saveOrder.mutate(next.map((stage) => stage.id));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    applyOrder(next);
  };

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = order.findIndex((stage) => stage.id === dragId);
    const to = order.findIndex((stage) => stage.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    applyOrder(next);
  };

  return (
    <Dialog open={manageStagesOpen} onOpenChange={setManageStagesOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Stages in {workspaceLabel}</DialogTitle>
          <DialogDescription>
            Drag a stage to reorder it, click its name to rename, and add your own next to the built-in ones. Everyone on
            this list sees the change instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          {order.map((stage, index) => {
            const meta = colorMeta(stage.color);
            const count = counts.get(stage.key) ?? 0;
            return (
              <div
                key={stage.id}
                draggable
                onDragStart={() => setDragId(stage.id)}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverId(stage.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropOn(stage.id);
                  setDragId(null);
                  setOverId(null);
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md border border-border bg-card px-2 py-2 transition",
                  dragId === stage.id && "opacity-50",
                  overId === stage.id && dragId && dragId !== stage.id && "border-primary ring-2 ring-ring/20",
                )}
              >
                <GripVertical className="size-4 cursor-grab text-muted-foreground active:cursor-grabbing" />
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="rounded p-0.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                    aria-label={`Move ${stage.label} up`}
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    className="rounded p-0.5 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                    aria-label={`Move ${stage.label} down`}
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>
                <span className={cn("size-2.5 shrink-0 rounded-full", meta.dot)} />
                <input
                  defaultValue={stage.label}
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next && next !== stage.label) edit.mutate({ id: stage.id, patch: { label: next } });
                    else event.target.value = stage.label;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium outline-none hover:border-input focus:border-input focus:ring-2 focus:ring-ring/25"
                />
                <span className="text-xs tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
                <select
                  value={stage.color}
                  onChange={(event) => edit.mutate({ id: stage.id, patch: { color: event.target.value } })}
                  className="h-7 rounded-md border border-input bg-card px-1.5 text-xs outline-none"
                >
                  {STAGE_COLORS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {stage.is_builtin ? (
                  <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Built-in stage, can't be deleted" />
                ) : (
                  <button
                    onClick={() => remove.mutate(stage)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                    title="Remove stage"
                  >
                    <Trash2 className="size-4" />
                  </button>
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
