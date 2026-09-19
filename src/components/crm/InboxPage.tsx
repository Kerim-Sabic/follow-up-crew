import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { useMailboxes } from "@/lib/mailboxes";
import { markReplyRead, replyToThread } from "@/lib/mail.functions";
import { formatWhen } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { MailboxesCard } from "./MailboxesCard";
import { PageHeader } from "./WorkspacePages";

type Message = {
  id: string;
  lead_id: string | null;
  mail_account_id: string | null;
  direction: "out" | "in";
  gmail_thread_id: string | null;
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  snippet: string | null;
  is_read: boolean;
  sent_at: string | null;
};

export function InboxPage() {
  const { user } = useAuth();
  const { workspace, leads } = useWorkspace();
  const { connected, refresh } = useMailboxes();
  const queryClient = useQueryClient();
  const sendReply = useServerFn(replyToThread);
  const markRead = useServerFn(markReplyRead);

  const [openThread, setOpenThread] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ["inbox", workspace, user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_messages")
        .select("*")
        .eq("workspace", workspace)
        .eq("user_id", user!.id)
        .order("sent_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  const threads = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const message of messages) {
      const key = message.gmail_thread_id ?? message.id;
      map.set(key, [...(map.get(key) ?? []), message]);
    }
    return Array.from(map.entries())
      .map(([id, items]) => {
        const sorted = [...items].sort((a, b) => (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));
        const incoming = sorted.filter((item) => item.direction === "in");
        return {
          id,
          messages: sorted,
          latest: sorted[sorted.length - 1]!,
          hasReply: incoming.length > 0,
          unread: incoming.some((item) => !item.is_read),
          lastIncoming: incoming[incoming.length - 1] ?? null,
        };
      })
      .sort((a, b) => (b.latest.sent_at ?? "").localeCompare(a.latest.sent_at ?? ""));
  }, [messages]);

  const replyThreads = threads.filter((thread) => thread.hasReply);
  const active = threads.find((thread) => thread.id === openThread) ?? null;
  const leadOf = (id: string | null) => leads.find((lead) => lead.id === id);

  const reply = useMutation({
    mutationFn: async () => {
      if (!active?.lastIncoming) throw new Error("Nothing to reply to yet.");
      return sendReply({ data: { messageId: active.lastIncoming.id, body: draft } });
    },
    onSuccess: async () => {
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["inbox"] });
      toast.success("Reply sent");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't send that reply."),
  });

  function openThreadAndRead(threadId: string) {
    setOpenThread(threadId);
    const thread = threads.find((item) => item.id === threadId);
    for (const message of thread?.messages ?? []) {
      if (message.direction === "in" && !message.is_read) {
        void markRead({ data: { messageId: message.id } }).then(() =>
          queryClient.invalidateQueries({ queryKey: ["inbox"] }),
        );
      }
    }
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 px-4 py-5 lg:px-6">
      <PageHeader
        title="Inbox"
        description="Replies from the leads you emailed, in the mailbox you sent from."
        actions={
          <Button size="sm" variant="outline" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}Check replies
          </Button>
        }
      />

      <MailboxesCard />

      {connected.length === 0 ? null : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              {replyThreads.length} conversation{replyThreads.length === 1 ? "" : "s"} with a reply
            </p>
            {isLoading ? (
              <p className="p-4 text-xs text-muted-foreground">Loading…</p>
            ) : replyThreads.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No replies yet. Send a batch from Templates, then press "Check replies".
              </p>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto">
                {replyThreads.map((thread) => {
                  const lead = leadOf(thread.latest.lead_id);
                  return (
                    <li key={thread.id}>
                      <button
                        type="button"
                        onClick={() => openThreadAndRead(thread.id)}
                        className={`w-full border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 ${active?.id === thread.id ? "bg-secondary" : ""}`}
                      >
                        <span className="flex items-center gap-2">
                          {thread.unread ? <span className="size-2 shrink-0 rounded-full bg-primary" /> : null}
                          <span className="truncate text-[13px] font-medium">
                            {lead?.full_name || lead?.username || thread.lastIncoming?.from_email}
                          </span>
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                            {formatWhen(thread.latest.sent_at)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {thread.lastIncoming?.snippet || thread.latest.subject}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            {!active ? (
              <p className="text-sm text-muted-foreground">Pick a conversation to read it.</p>
            ) : (
              <>
                <h2 className="text-sm font-semibold">{active.latest.subject}</h2>
                <p className="text-xs text-muted-foreground">
                  {leadOf(active.latest.lead_id)?.email ?? active.lastIncoming?.from_email}
                </p>
                <div className="mt-3 max-h-[42vh] space-y-3 overflow-y-auto">
                  {active.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`rounded-md border p-3 text-sm ${message.direction === "in" ? "border-border bg-secondary/40" : "border-dashed border-border"}`}
                    >
                      <p className="mb-1 text-[11px] text-muted-foreground">
                        {message.direction === "in" ? message.from_email : `You · ${message.from_email}`} ·{" "}
                        {formatWhen(message.sent_at)}
                      </p>
                      <p className="whitespace-pre-wrap text-[13px]">{message.body || message.snippet}</p>
                    </article>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={4}
                    placeholder="Write your reply…"
                    className="w-full rounded-md border border-input bg-card p-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => reply.mutate()}
                      disabled={reply.isPending || !draft.trim() || !active.lastIncoming}
                    >
                      {reply.isPending ? <Loader2 className="animate-spin" /> : <Send />}Send reply
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {connected.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <Mail className="size-4" />Connect a mailbox above to send outreach and collect replies here.
        </p>
      ) : null}
    </div>
  );
}
