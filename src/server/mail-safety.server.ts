import { createHash } from "node:crypto";
import { withWorkspace } from "./creator-db.server";
import { observationSchema, missionSchema, qualify, checkDraft } from "../lib/mission-domain";
export async function reserveMail(
  actor: string,
  w: string,
  leadId: string,
  mailbox: string,
  to: string,
  subject: string,
  body: string,
  reply = false,
) {
  if (process.env["CREATOR_OUTREACH_ENABLED"] !== "true")
    throw new Error(
      "Email sending paused: complete staging outbox/mail regression verification and explicitly configure CREATOR_OUTREACH_ENABLED=true. No message was sent.",
    );
  if (
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to) ||
    /[\r\n]/.test(subject) ||
    body.length > 20_000
  )
    throw new Error("Invalid recipient or message");
  return withWorkspace(actor, w, true, async (sql) => {
    const [settings] =
      await sql`select sending_enabled from public.workspaces where id=${w} for update`;
    if (!settings?.["sending_enabled"])
      throw new Error(
        "Workspace sending is paused. An authorized administrator must enable it after staging verification.",
      );
    const [lead] =
      await sql`select * from public.leads where workspace=${w} and id=${leadId} for update`;
    if (!lead || String(lead["email"] ?? "").toLowerCase() !== to.toLowerCase())
      throw new Error("Recipient must match the authorized lead contact");
    const [account] =
      await sql`select id from public.mail_accounts where id=${mailbox} and user_id=${actor}`;
    if (!account) throw new Error("Private mailbox permission denied");
    const [suppression] =
      await sql`select 1 from public.lead_suppressions where workspace=${w} and handle=${String(lead["username"]).replace(/^@/, "").toLowerCase()}`;
    if (suppression) throw new Error("Do not contact is active");
    if (!reply) {
      const [response] =
        await sql`select 1 from public.email_messages where workspace=${w} and lead_id=${leadId} and direction='in' limit 1`;
      if (response || ["replied", "deal", "dead"].includes(String(lead["stage"])))
        throw new Error("Conversation or lead status stops initial outreach");
    }
    const [e] =
      await sql`select e.observation,m.spec from public.creator_evidence e join public.missions m on m.id=e.mission_id and m.workspace=e.workspace where e.workspace=${w} and e.lead_id=${leadId} order by e.retrieved_at desc limit 1`;
    if (e && !reply) {
      const observation = observationSchema.parse(e["observation"]);
      if (
        qualify(missionSchema.parse(e["spec"]), observation).status !== "passed" ||
        !checkDraft(body, observation)
      )
        throw new Error("Message evidence changed or claims are unsupported");
      const [approved] =
        await sql`select id from public.partnership_drafts where workspace=${w} and lead_id=${leadId} and body=${body} and state='approved' limit 1`;
      if (!approved) throw new Error("Review Desk approval required");
    }
    const hash = createHash("sha256")
      .update(JSON.stringify({ w, leadId, mailbox, to, subject, body, reply }))
      .digest("hex");
    const [item] =
      await sql`insert into private.mail_outbox(workspace,lead_id,actor,mailbox_id,approval_hash,is_reply) values(${w},${leadId},${actor},${mailbox},${hash},${reply}) on conflict do nothing returning id`;
    if (!item)
      throw new Error(
        "Contact already reserved or sent; reconcile pending delivery before trying again",
      );
    return item["id"] as string;
  });
}
export async function settleMail(actor: string, w: string, id: string, providerId: string) {
  await withWorkspace(actor, w, true, async (sql) => {
    await sql`update private.mail_outbox set status='sent',provider_message_id=${providerId} where workspace=${w} and id=${id} and actor=${actor}`;
  });
}
