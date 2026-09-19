import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Mailbox = {
  id: string;
  email: string | null;
  connected: boolean;
  reconnectRequired: boolean;
  lastSyncedAt: string | null;
};

function returnUrl() {
  const request = getRequest();
  if (!request) throw new Error("OAuth must start from an app request.");
  const url = new URL(request.url);
  const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  return new URL("/oauth/google-mail/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
}

export const listMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Mailbox[]> => {
    const { listAccounts } = await import("@/server/mailAccounts.server");
    const rows = await listAccounts(context.userId);
    return rows
      .filter((row) => row.connection_key_ciphertext || row.email)
      .map((row) => ({
        id: row.id,
        email: row.email,
        connected: Boolean(row.connection_key_ciphertext),
        reconnectRequired: row.reconnect_required,
        lastSyncedAt: row.last_synced_at,
      }));
  });

export const startMailboxConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mailboxId?: string }) => input ?? {})
  .handler(async ({ data, context }) => {
    const {
      CONNECTOR_ID,
      GATEWAY_BASE_URL,
      GOOGLE_SCOPES,
      createPendingAccount,
      getAccount,
      connectionKeyOf,
    } = await import("@/server/mailAccounts.server");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");

    const clientAPIKey = process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientAPIKey) throw new Error("Gmail connector is not configured for this project yet.");

    const account = data.mailboxId
      ? await getAccount(context.userId, data.mailboxId)
      : await createPendingAccount(context.userId);
    if (!account) throw new Error("Mailbox not found.");

    const existingKey = connectionKeyOf(account);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: account.app_user_id,
      clientAPIKey,
      returnUrl: returnUrl(),
      connectionAPIKey: existingKey ?? undefined,
      credentialsConfiguration: { scopes: GOOGLE_SCOPES },
    });
    return { authorizationUrl, mailboxId: account.id };
  });

export const completeMailboxConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mailboxId: string; code: string }) => input)
  .handler(async ({ data, context }) => {
    const {
      CONNECTOR_ID,
      GATEWAY_BASE_URL,
      getAccount,
      listAccounts,
      saveConnectionKey,
      setAccountIdentity,
      deleteAccount,
      gmail,
    } = await import("@/server/mailAccounts.server");
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");

    const account = await getAccount(context.userId, data.mailboxId);
    if (!account) throw new Error("Mailbox not found.");

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== CONNECTOR_ID) throw new Error("Connection returned the wrong provider.");
    await saveConnectionKey(account.id, connectionAPIKey);

    const fresh = await getAccount(context.userId, account.id);
    const profile = await gmail(fresh!, "/gmail/v1/users/me/profile");
    const email = profile?.emailAddress as string | undefined;
    if (email) {
      const duplicates = (await listAccounts(context.userId)).filter(
        (row) => row.email === email && row.id !== account.id,
      );
      for (const dup of duplicates) await deleteAccount(dup.id);
      await setAccountIdentity(account.id, email);
    }
    return { ok: true, email: email ?? null };
  });

export const disconnectMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mailboxId: string }) => input)
  .handler(async ({ data, context }) => {
    const { CONNECTOR_ID, GATEWAY_BASE_URL, getAccount, connectionKeyOf, deleteAccount } =
      await import("@/server/mailAccounts.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const account = await getAccount(context.userId, data.mailboxId);
    if (!account) return { ok: true };
    const key = connectionKeyOf(account);
    if (key) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: CONNECTOR_ID,
        });
      } catch (error) {
        console.error("Gmail disconnect failed", error);
      }
    }
    await deleteAccount(account.id);
    return { ok: true };
  });

export type SendInput = {
  mailboxId: string;
  workspace: "docmesker" | "justin";
  messages: { leadId: string; to: string; subject: string; body: string }[];
};

export const sendLeadEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SendInput) => input)
  .handler(async ({ data, context }) => {
    const { getAccount, gmail, buildRawEmail } = await import("@/server/mailAccounts.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const account = await getAccount(context.userId, data.mailboxId);
    if (!account?.connection_key_ciphertext) throw new Error("That mailbox is not connected.");

    const sent: string[] = [];
    const failed: { leadId: string; error: string }[] = [];

    for (const message of data.messages) {
      try {
        const raw = buildRawEmail({
          to: message.to,
          from: account.email,
          subject: message.subject,
          body: message.body,
        });
        const result = await gmail(account, "/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        });
        await supabaseAdmin.from("email_messages").insert({
          workspace: data.workspace,
          lead_id: message.leadId,
          mail_account_id: account.id,
          user_id: context.userId,
          direction: "out",
          gmail_message_id: result.id,
          gmail_thread_id: result.threadId,
          from_email: account.email,
          to_email: message.to,
          subject: message.subject,
          snippet: message.body.slice(0, 200),
          body: message.body,
          is_read: true,
          sent_at: new Date().toISOString(),
        });
        sent.push(message.leadId);
      } catch (error) {
        failed.push({ leadId: message.leadId, error: (error as Error).message });
      }
    }
    return { sent, failed };
  });

export const syncMailboxes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAccounts, gmail, headerOf, plainTextOf } = await import("@/server/mailAccounts.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const accounts = (await listAccounts(context.userId)).filter((a) => a.connection_key_ciphertext);
    let newReplies = 0;

    for (const account of accounts) {
      const { data: outgoing } = await supabaseAdmin
        .from("email_messages")
        .select("gmail_thread_id, lead_id, workspace")
        .eq("mail_account_id", account.id)
        .eq("direction", "out")
        .order("sent_at", { ascending: false })
        .limit(300);

      const threads = new Map<string, { leadId: string | null; workspace: string }>();
      for (const row of outgoing ?? []) {
        if (row.gmail_thread_id && !threads.has(row.gmail_thread_id)) {
          threads.set(row.gmail_thread_id, { leadId: row.lead_id, workspace: row.workspace });
        }
      }

      const { data: known } = await supabaseAdmin
        .from("email_messages")
        .select("gmail_message_id")
        .eq("mail_account_id", account.id);
      const knownIds = new Set((known ?? []).map((row) => row.gmail_message_id));

      for (const [threadId, meta] of Array.from(threads).slice(0, 80)) {
        let thread: any;
        try {
          thread = await gmail(account, `/gmail/v1/users/me/threads/${threadId}?format=full`);
        } catch (error) {
          if ((error as Error).message === "RECONNECT_REQUIRED") break;
          continue;
        }
        for (const message of thread?.messages ?? []) {
          if (knownIds.has(message.id)) continue;
          const from = headerOf(message, "From");
          const isFromMe = account.email && from.toLowerCase().includes(account.email.toLowerCase());
          if (isFromMe) continue;
          const dateHeader = headerOf(message, "Date");
          const sentAt = dateHeader ? new Date(dateHeader) : new Date(Number(message.internalDate ?? Date.now()));
          await supabaseAdmin.from("email_messages").insert({
            workspace: meta.workspace as "docmesker" | "justin",
            lead_id: meta.leadId,
            mail_account_id: account.id,
            user_id: context.userId,
            direction: "in",
            gmail_message_id: message.id,
            gmail_thread_id: threadId,
            from_email: from,
            to_email: account.email,
            subject: headerOf(message, "Subject"),
            snippet: message.snippet ?? "",
            body: plainTextOf(message),
            is_read: false,
            sent_at: isNaN(sentAt.getTime()) ? new Date().toISOString() : sentAt.toISOString(),
          });
          newReplies += 1;
          if (meta.leadId) {
            const { data: lead } = await supabaseAdmin
              .from("leads")
              .select("stage")
              .eq("id", meta.leadId)
              .maybeSingle();
            if (lead && (lead.stage === "not_contacted" || lead.stage === "contacted")) {
              await supabaseAdmin
                .from("leads")
                .update({ stage: "replied", last_touched_at: new Date().toISOString() })
                .eq("id", meta.leadId);
            }
          }
        }
      }

      await supabaseAdmin
        .from("mail_accounts")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", account.id);
    }

    return { newReplies };
  });

export const replyToThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string; body: string }) => input)
  .handler(async ({ data, context }) => {
    const { getAccount, gmail, buildRawEmail, headerOf } = await import("@/server/mailAccounts.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: incoming } = await supabaseAdmin
      .from("email_messages")
      .select("*")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!incoming?.mail_account_id) throw new Error("Message not found.");
    const account = await getAccount(context.userId, incoming.mail_account_id);
    if (!account) throw new Error("That reply belongs to another teammate's mailbox.");

    const original = incoming.gmail_message_id
      ? await gmail(account, `/gmail/v1/users/me/messages/${incoming.gmail_message_id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject&metadataHeaders=From`)
      : null;
    const messageIdHeader = original ? headerOf(original, "Message-ID") : "";
    const subject = incoming.subject?.toLowerCase().startsWith("re:")
      ? incoming.subject
      : `Re: ${incoming.subject ?? ""}`;
    const to = incoming.from_email ?? "";

    const raw = buildRawEmail({
      to,
      from: account.email,
      subject,
      body: data.body,
      inReplyTo: messageIdHeader || null,
      references: original ? headerOf(original, "References") || messageIdHeader : null,
    });
    const result = await gmail(account, "/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw, threadId: incoming.gmail_thread_id }),
    });

    await supabaseAdmin.from("email_messages").insert({
      workspace: incoming.workspace,
      lead_id: incoming.lead_id,
      mail_account_id: account.id,
      user_id: context.userId,
      direction: "out",
      gmail_message_id: result.id,
      gmail_thread_id: result.threadId,
      from_email: account.email,
      to_email: to,
      subject,
      snippet: data.body.slice(0, 200),
      body: data.body,
      is_read: true,
      sent_at: new Date().toISOString(),
    });
    await supabaseAdmin.from("email_messages").update({ is_read: true }).eq("id", incoming.id);
    return { ok: true };
  });

export const markReplyRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("email_messages").update({ is_read: true }).eq("id", data.messageId);
    return { ok: true };
  });
