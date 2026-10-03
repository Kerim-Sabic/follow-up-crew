import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { STATUSES, createLead, type LeadStatus } from "@/lib/crm";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AddLeadDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<LeadStatus>("not_contacted");

  const mutation = useMutation({
    mutationFn: () =>
      createLead(
        { username, email, instagram_url: instagram, match_note: note, status },
        userId,
        workspace,
      ),
    onSuccess: (lead) => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`${lead.username} added`);
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const inputClass =
    "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/40";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Add lead</DialogTitle><DialogDescription>Add a prospect with only the details you have now.</DialogDescription></DialogHeader>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!username.trim()) {
              toast.error("Username is required");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Username
            </label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="instagram handle"
              className={inputClass}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </label>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="optional"
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Instagram link
            </label>
            <input
              value={instagram}
              onChange={(event) => setInstagram(event.target.value)}
              placeholder="auto-filled from username"
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Stage
            </label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as LeadStatus)}
              className={inputClass}
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Note
            </label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Where did they come from?"
              className="min-h-20 w-full resize-y rounded-lg border border-input bg-card p-3 text-sm outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/40"
            />
          </div>

          <DialogFooter><Button
            type="submit"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Adding…" : "Add lead"}
          </Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
