import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  completeMailboxConnect,
  disconnectMailbox,
  listMailboxes,
  startMailboxConnect,
  syncMailboxes,
  type Mailbox,
} from "./mail.functions";

const MAILBOX_KEY = ["mailboxes"];
const PREF_KEY = "crm.mailbox";

export function preferredMailbox(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PREF_KEY);
}

export function rememberMailbox(id: string) {
  window.localStorage.setItem(PREF_KEY, id);
}

function waitForOAuth(popup: Window) {
  return new Promise<string | null>((resolve, reject) => {
    let poll: number | undefined;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      if (poll !== undefined) window.clearInterval(poll);
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (
        event.origin !== window.location.origin ||
        event.source !== popup ||
        event.data?.connectorId !== "google_mail" ||
        (type !== "appUserConnectorOAuthComplete" && type !== "appUserConnectorOAuthFailed")
      )
        return;
      cleanup();
      if (type === "appUserConnectorOAuthComplete") {
        resolve(typeof event.data?.code === "string" ? event.data.code : null);
        return;
      }
      popup.close();
      reject(new Error("Google did not finish connecting the mailbox."));
    };
    window.addEventListener("message", onMessage);
    poll = window.setInterval(() => {
      if (!popup.closed) return;
      cleanup();
      reject(new Error("The Google window closed before the mailbox was connected."));
    }, 500);
  });
}

export function useMailboxes() {
  const queryClient = useQueryClient();
  const fetchMailboxes = useServerFn(listMailboxes);
  const start = useServerFn(startMailboxConnect);
  const complete = useServerFn(completeMailboxConnect);
  const remove = useServerFn(disconnectMailbox);
  const sync = useServerFn(syncMailboxes);

  const query = useQuery<Mailbox[]>({
    queryKey: MAILBOX_KEY,
    queryFn: () => fetchMailboxes(),
    staleTime: 30_000,
  });

  const connect = useMutation({
    mutationFn: async (mailboxId?: string) => {
      const popup = window.open("", "gmail-connect", "width=520,height=680");
      if (!popup) throw new Error("Allow pop-ups for this site, then try again.");
      let code: string | null;
      let id: string;
      try {
        const started = await start({ data: { mailboxId } });
        id = started.mailboxId;
        const completion = waitForOAuth(popup);
        popup.location.href = started.authorizationUrl;
        code = await completion;
      } catch (error) {
        popup.close();
        throw error;
      }
      if (!code) throw new Error("Google did not return a confirmation.");
      return complete({ data: { mailboxId: id, code } });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: MAILBOX_KEY });
      toast.success(result?.email ? `${result.email} connected` : "Mailbox connected");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't connect that mailbox."),
  });

  const disconnect = useMutation({
    mutationFn: (mailboxId: string) => remove({ data: { mailboxId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MAILBOX_KEY });
      toast.success("Mailbox removed");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't remove that mailbox."),
  });

  const refresh = useMutation({
    mutationFn: () => sync(),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inbox"] }),
        queryClient.invalidateQueries({ queryKey: MAILBOX_KEY }),
        queryClient.invalidateQueries({ queryKey: ["leads"] }),
      ]);
      toast.success(result.newReplies ? `${result.newReplies} new repl${result.newReplies === 1 ? "y" : "ies"}` : "No new replies");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't check for replies."),
  });

  const connected = (query.data ?? []).filter((box) => box.connected && !box.reconnectRequired);

  const pick = useCallback(
    (id: string) => {
      rememberMailbox(id);
      queryClient.invalidateQueries({ queryKey: MAILBOX_KEY });
    },
    [queryClient],
  );

  return { ...query, mailboxes: query.data ?? [], connected, connect, disconnect, refresh, pick };
}
