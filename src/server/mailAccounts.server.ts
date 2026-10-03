// Server-only storage + Gmail helpers for per-user connected mailboxes.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptConnectionKey, encryptConnectionKey } from "./connectionKeyCrypto";
import { appUserReconnectRequired, callAsAppUser } from "@/integrations/lovable/appUserConnector";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const CONNECTOR_ID = "google_mail";
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

export type MailAccountRow = {
  id: string;
  user_id: string;
  app_user_id: string;
  email: string | null;
  display_name: string | null;
  connection_key_ciphertext: string | null;
  reconnect_required: boolean;
  last_synced_at: string | null;
  created_at: string;
};

export async function listAccounts(userId: string): Promise<MailAccountRow[]> {
  const { data, error } = await supabaseAdmin
    .from("mail_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MailAccountRow[];
}

export async function getAccount(userId: string, id: string): Promise<MailAccountRow | null> {
  const { data, error } = await supabaseAdmin
    .from("mail_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as MailAccountRow) ?? null;
}

export async function createPendingAccount(userId: string) {
  const appUserId = `${userId}.${crypto.randomUUID()}`;
  const { data, error } = await supabaseAdmin
    .from("mail_accounts")
    .insert({ user_id: userId, app_user_id: appUserId, connector_id: CONNECTOR_ID })
    .select("*")
    .single();
  if (error) throw error;
  return data as MailAccountRow;
}

export async function saveConnectionKey(id: string, connectionAPIKey: string) {
  const { error } = await supabaseAdmin
    .from("mail_accounts")
    .update({
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      reconnect_required: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function setAccountIdentity(id: string, email: string) {
  const { error } = await supabaseAdmin
    .from("mail_accounts")
    .update({ email, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markReconnect(id: string) {
  await supabaseAdmin.from("mail_accounts").update({ reconnect_required: true }).eq("id", id);
}

export async function deleteAccount(id: string) {
  await supabaseAdmin.from("mail_accounts").delete().eq("id", id);
}

export function connectionKeyOf(account: MailAccountRow) {
  return account.connection_key_ciphertext
    ? decryptConnectionKey(account.connection_key_ciphertext)
    : null;
}

/** Calls the Gmail API as the owner of this mailbox. */
export async function gmail<T = Record<string, unknown>>(
  account: MailAccountRow,
  path: string,
  init?: RequestInit,
) {
  const connectionAPIKey = connectionKeyOf(account);
  if (!connectionAPIKey) throw new Error("This mailbox is not connected yet.");
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey,
    connectorId: CONNECTOR_ID,
    path,
    init,
    requiredScopes: GOOGLE_SCOPES,
  });
  if (await appUserReconnectRequired(res)) {
    await markReconnect(account.id);
    throw new Error("RECONNECT_REQUIRED");
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Gmail call failed [${res.status}] ${path}: ${body}`);
    throw new Error(`Gmail request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export { buildRawEmail, headerOf, plainTextOf } from "./mail-message";
