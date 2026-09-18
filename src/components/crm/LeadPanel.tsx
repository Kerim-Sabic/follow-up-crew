import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addNote,
  claimLead,
  fetchNotes,
  formatWhen,
  type Lead,
  type LeadStatus,
} from "@/lib/crm";
import { StatusSelect } from "./StatusSelect";

export function LeadPanel({
  lead,
  userId,
  ownerName,
  onClose,
  onStatusChange,
}: {
  lead: Lead;
  userId: string;
  ownerName: (id: string | null) => string;
  onClose: () => void;
  onStatusChange: (ids: string[], status: LeadStatus) => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const notes = useQuery({
    queryKey: ["lead-notes", lead.id],
    queryFn: () => fetchNotes(lead.id),
  });

  const noteMutation = useMutation({
    mutationFn: (body: string) => addNote(lead.id, userId, body),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["lead-notes", lead.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const claimMutation = useMutation({
    mutationFn: (next: string | null) => claimLead(lead.id, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-panel">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-display text-lg text-foreground">{lead.username}</p>
            <p className="text-xs text-muted-foreground">Lead #{lead.number ?? "—"}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary"
          >
            Close
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-auto px-5 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusSelect
              value={lead.status}
              onChange={(status) => onStatusChange([lead.id], status)}
            />
            <button
              onClick={() => claimMutation.mutate(lead.owner_id === userId ? null : userId)}
              className="rounded-full border border-border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-secondary"
            >
              {lead.owner_id === userId ? "Release" : "Claim"}
            </button>
          </div>

          <dl className="space-y-3 text-sm">
            <Row label="Owner" value={ownerName(lead.owner_id)} />
            <Row label="Last update" value={formatWhen(lead.last_touched_at)} />
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Email
              </dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="truncate text-foreground">{lead.email ?? "—"}</span>
                {lead.email ? (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lead.email ?? "");
                      toast.success("Email copied");
                    }}
                    className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-secondary"
                  >
                    Copy
                  </button>
                ) : null}
              </dd>
            </div>
            {lead.instagram_url ? (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Instagram
                </dt>
                <dd className="mt-1">
                  <a
                    href={lead.instagram_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline underline-offset-4"
                  >
                    Open profile ↗
                  </a>
                </dd>
              </div>
            ) : null}
            {lead.match_note ? <Row label="Source note" value={lead.match_note} /> : null}
          </dl>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Notes & replies
            </h3>
            <form
              className="mt-2 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (draft.trim()) noteMutation.mutate(draft.trim());
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder="What did they say?"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/40"
              />
              <button
                type="submit"
                disabled={!draft.trim() || noteMutation.isPending}
                className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Add note
              </button>
            </form>

            <ul className="mt-4 space-y-3">
              {(notes.data ?? []).map((note) => (
                <li key={note.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {ownerName(note.author_id)}
                    </span>
                    <span>{formatWhen(note.created_at)}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
                </li>
              ))}
              {notes.data && notes.data.length === 0 ? (
                <li className="text-sm text-muted-foreground">No notes yet.</li>
              ) : null}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}
