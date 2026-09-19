import { AlertTriangle, Loader2, Mail, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMailboxes } from "@/lib/mailboxes";
import { Button } from "@/components/ui/button";
import { formatWhen } from "@/lib/crm";

export function MailboxesCard() {
  const { mailboxes, isLoading, connect, disconnect, refresh } = useMailboxes();

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Your mailboxes</h2>
          <p className="text-xs text-muted-foreground">
            Emails always send from the address you pick — your teammates' mailboxes stay separate from yours.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Check replies
          </Button>
          <Button size="sm" onClick={() => connect.mutate(undefined)} disabled={connect.isPending}>
            {connect.isPending ? <Loader2 className="animate-spin" /> : <Plus />}Add mailbox
          </Button>
        </div>
      </header>

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : mailboxes.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No mailbox connected yet. Add your Gmail address to send outreach and receive replies inside the CRM.
          </p>
        ) : (
          mailboxes.map((box) => (
            <div key={box.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
              <Mail className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{box.email ?? "Pending connection"}</p>
                <p className="text-xs text-muted-foreground">
                  {box.reconnectRequired
                    ? "Access expired — reconnect to keep sending"
                    : `Last checked ${formatWhen(box.lastSyncedAt)}`}
                </p>
              </div>
              {box.reconnectRequired || !box.connected ? (
                <Button size="sm" variant="outline" onClick={() => connect.mutate(box.id)} disabled={connect.isPending}>
                  <AlertTriangle />Reconnect
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => disconnect.mutate(box.id)}
                disabled={disconnect.isPending}
                aria-label="Remove mailbox"
              >
                <Trash2 />
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
