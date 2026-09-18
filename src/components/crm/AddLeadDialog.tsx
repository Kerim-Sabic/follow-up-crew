import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { STATUSES, createLead, type LeadStatus } from "@/lib/crm";

export function AddLeadDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
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
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-foreground/30 px-4 py-16 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg tracking-tight text-foreground">New lead</h2>
            <p className="text-xs text-muted-foreground">Add someone to the pipeline.</p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Close
          </button>
        </div>

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

          <button
            type="submit"
            disabled={mutation.isPending}
            className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {mutation.isPending ? "Adding…" : "Add lead"}
          </button>
        </form>
      </div>
    </div>
  );
}
