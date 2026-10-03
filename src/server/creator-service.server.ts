import { createHash, randomUUID, randomBytes } from "node:crypto";
import { z } from "zod";
import { withWorkspace, requireAdmin, creatorDb } from "./creator-db.server";
import {
  missionSchema,
  observationSchema,
  qualify,
  opportunity,
  composeDraft,
  checkDraft,
  genericDraft,
  parseCsv,
  type MissionSpec,
  type Observation,
} from "../lib/mission-domain";
import {
  saveProvider,
  configureProvider,
  testDeepSeek,
  discoverBrave,
  discoverModash,
  enrichModash,
  analyzeOpportunity,
} from "./creator-providers.server";
import {
  leadFilterSchema,
  createBulkJob,
  listBulkJobs,
  cancelBulkJob,
  prepareDownload,
} from "./bulk-jobs.server";

const uuid = z.string().uuid();
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("overview"), workspace: uuid }),
  z.object({
    action: z.literal("productMatches"),
    workspace: uuid,
    concept: z.string().trim().min(5).max(300),
  }),
  z.object({ action: z.literal("similarCreators"), workspace: uuid, leadId: uuid }),
  z.object({ action: z.literal("bulkJobs"), workspace: uuid }),
  z.object({
    action: z.literal("createBulkJob"),
    workspace: uuid,
    requestKey: uuid,
    filters: leadFilterSchema,
    kind: z.enum(["stage", "export"]),
    targetStage: z.string().max(80).optional(),
  }),
  z.object({ action: z.literal("cancelBulkJob"), workspace: uuid, id: uuid }),
  z.object({ action: z.literal("prepareBulkDownload"), workspace: uuid, id: uuid }),
  z.object({
    action: z.literal("createMission"),
    workspace: uuid,
    spec: missionSchema,
    csv: z.string().max(1_000_000),
    useAi: z.boolean(),
  }),
  z.object({
    action: z.literal("approveMission"),
    workspace: uuid,
    id: uuid,
    hash: z.string().length(64),
  }),
  z.object({
    action: z.literal("missionState"),
    workspace: uuid,
    id: uuid,
    state: z.enum(["paused", "cancelled", "queued"]),
  }),
  z.object({
    action: z.literal("review"),
    workspace: uuid,
    id: uuid,
    decision: z.enum(["approve", "reject", "record_manual"]),
  }),
  z.object({
    action: z.literal("editDraft"),
    workspace: uuid,
    id: uuid,
    body: z.string().trim().min(20).max(2000),
  }),
  z.object({ action: z.literal("prepareManualOutreach"), workspace: uuid, id: uuid }),
  z.object({
    action: z.literal("suppress"),
    workspace: uuid,
    handle: z.string().regex(/^[\w.]{1,30}$/),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    action: z.literal("recheck"),
    workspace: uuid,
    leadId: uuid,
    missionId: uuid,
    observation: observationSchema,
  }),
  z.object({
    action: z.literal("preferences"),
    workspace: uuid,
    topics: z.array(z.string().max(100)).max(10),
    avoidTopics: z.array(z.string().max(100)).max(10).default([]),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    action: z.literal("feedback"),
    workspace: uuid,
    leadId: uuid,
    decision: z.enum(["strong_fit", "not_fit", "unsure"]),
    reason: z.string().min(1).max(500),
  }),
  z.object({
    action: z.literal("saveProposal"),
    workspace: uuid,
    leadId: uuid,
    title: z.string().min(1).max(200),
    content: z.string().min(10).max(10000),
  }),
  z.object({
    action: z.literal("shareProposal"),
    workspace: uuid,
    id: uuid,
    days: z.number().int().min(1).max(30),
  }),
  z.object({ action: z.literal("revokeProposal"), workspace: uuid, id: uuid }),
  z.object({
    action: z.literal("handoff"),
    workspace: uuid,
    leadId: uuid,
    scope: z.string().min(10).max(2000),
    agreementReference: z.string().min(5).max(1000),
    validationTask: z.string().min(5).max(2000),
    agreedTerms: z.string().max(2000),
  }),
  z.object({
    action: z.literal("projectState"),
    workspace: uuid,
    id: uuid,
    state: z.enum(["validation", "production", "launched", "closed"]),
  }),
  z.object({
    action: z.literal("limits"),
    workspace: uuid,
    daily: z.number().int().nonnegative().max(1e12),
    monthly: z.number().int().nonnegative().max(1e13),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("saveProvider"),
    workspace: uuid,
    provider: z.enum(["deepseek", "brave", "modash"]),
    key: z.string().min(5).max(500),
    configuration: z.record(z.unknown()),
    rights: z.boolean(),
  }),
  z.object({ action: z.literal("testDeepSeek"), workspace: uuid }),
  z.object({
    action: z.literal("reconcileUsage"),
    workspace: uuid,
    attemptId: uuid,
    actualNanos: z.number().int().nonnegative().max(1_000_000_000_000),
    invoiceReference: z.string().trim().min(5).max(200),
  }),
  z.object({
    action: z.literal("configureProvider"),
    workspace: uuid,
    provider: z.enum(["deepseek", "brave", "modash"]),
    configuration: z.record(z.unknown()),
    rights: z.boolean(),
  }),
  z.object({
    action: z.literal("removeProvider"),
    workspace: uuid,
    provider: z.enum(["deepseek", "brave", "modash"]),
  }),
]);
type Command = z.infer<typeof commandSchema>;
export function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function storeObservation(
  actor: string,
  w: string,
  mission: string,
  o: Observation,
  allowExisting = false,
  lease?: string,
) {
  return withWorkspace(actor, w, true, async (sql) => {
    await sql`select id from public.workspaces where id=${w} for update`;
    const [run] = await sql`select * from public.missions where workspace=${w} and id=${mission}`;
    if (!run || !["running", "completed", "paused"].includes(run["state"] as string))
      throw new Error("Mission is not active");
    if (lease && (run["lease_token"] !== lease || run["state"] !== "running"))
      throw new Error("Worker lease revoked or mission paused");
    const spec = missionSchema.parse(run["spec"]);
    const [suppressed] =
      await sql`select 1 from public.lead_suppressions where workspace=${w} and handle=${o.handle}`;
    if (suppressed) return { skipped: "suppressed" };
    let [lead] =
      await sql`select id from public.leads where workspace_id=${w} and lower(regexp_replace(username,'^@',''))=${o.handle} order by id limit 1`;
    if (lead && !allowExisting) return { skipped: "existing workspace lead" };
    if (!lead)
      [lead] =
        await sql`insert into public.leads(workspace_id,username,instagram_url,niche,match_note) values(${w},${o.handle},${"https://www.instagram.com/" + o.handle + "/"},${o.teachingTopic},'Retrieved/imported candidate; inspect evidence before contact') returning id`;
    const [previous] =
      await sql`select version from public.creator_evidence where workspace=${w} and lead_id=${lead!["id"]} and mission_id=${mission} order by version desc limit 1`;
    const qualification = qualify(spec, o);
    const [evidence] =
      await sql`insert into public.creator_evidence(workspace,lead_id,mission_id,observation,provenance,observed_at,qualification,reasons,version)
  values(${w},${lead!["id"]},${mission},${sql.json(o)},${o.method},${o.observedAt},${qualification.status},${sql.json(qualification.reasons)},${Number(previous?.["version"] ?? 0) + 1}) returning id`;
    const [{ count }] =
      (await sql`select count(*)::int as count from public.partnership_drafts d join public.creator_evidence e on e.id=d.evidence_id where d.workspace=${w} and e.mission_id=${mission} and d.state in ('review','approved','manually_recorded')`) as unknown as [
        { count: number },
      ];
    if (qualification.status === "passed" && count < spec.draftLimit) {
      try {
        const draft = composeDraft(o);
        await sql`insert into public.partnership_drafts(workspace,lead_id,evidence_id,opportunity,body,claims) values(${w},${lead!["id"]},${evidence!["id"]},${sql.json(opportunity(spec, o))},${draft.body},${sql.json(draft.claims)})`;
      } catch {
        /* unsafe personalization remains evidence-only for review */
      }
    }
    return {
      evidenceId: evidence!["id"],
      qualification: qualification.status,
      leadId: lead!["id"],
    };
  });
}

export async function executeCommand(actor: string, command: Command): Promise<unknown> {
  const c = commandSchema.parse(command),
    w = c.workspace;
  if (c.action === "saveProvider")
    return saveProvider(actor, w, c.provider, c.key, c.configuration, c.rights);
  if (c.action === "testDeepSeek") return testDeepSeek(actor, w);
  if (c.action === "configureProvider")
    return configureProvider(actor, w, c.provider, c.configuration, c.rights);
  if (c.action === "bulkJobs") return listBulkJobs(actor, w);
  if (c.action === "createBulkJob")
    return createBulkJob(actor, w, c.requestKey, c.filters, c.kind, c.targetStage);
  if (c.action === "cancelBulkJob") return cancelBulkJob(actor, w, c.id);
  if (c.action === "prepareBulkDownload") return prepareDownload(actor, w, c.id);
  if (c.action === "recheck") {
    await withWorkspace(actor, w, true, async (sql) => {
      const [l] =
        await sql`select username from public.leads where workspace_id=${w} and id=${c.leadId}`;
      if (!l || String(l["username"]).replace(/^@/, "").toLowerCase() !== c.observation.handle)
        throw new Error("Observation identity does not match lead");
    });
    return storeObservation(actor, w, c.missionId, c.observation, true);
  }
  return withWorkspace(
    actor,
    w,
    !["overview", "productMatches", "similarCreators"].includes(c.action),
    async (sql, role) => {
      switch (c.action) {
        case "productMatches":
        case "similarCreators": {
          let query = c.action === "productMatches" ? c.concept : "";
          let sourceLead: string | null = null;
          let sourceFollowers: number | null = null;
          let sourceLinkState: string | null = null;
          if (c.action === "similarCreators") {
            sourceLead = c.leadId;
            const [source] = await sql`select observation from public.creator_evidence
            where workspace=${w} and lead_id=${sourceLead}
            order by retrieved_at desc,id desc limit 1`;
            if (!source) throw new Error("Creator evidence unavailable in this workspace");
            const observation = observationSchema.parse(source["observation"]);
            if (
              !observation.rightsAttested ||
              !observation.teachingTopic ||
              !observation.contentUrl
            )
              return {
                matches: [],
                note: "This creator needs permitted teaching-content evidence before similarity search",
              };
            query = observation.teachingTopic;
            sourceFollowers = observation.followers;
            sourceLinkState = observation.bioLinks;
          }
          const matches = await sql`select e.id,e.lead_id,l.username,e.observation,e.qualification,
          ts_rank(to_tsvector('english',coalesce(e.observation->>'teachingTopic','') || ' ' || coalesce(e.observation->>'contentExcerpt','')),
          plainto_tsquery('english',${query})) as content_rank
          from public.creator_evidence e join public.leads l on l.workspace_id=e.workspace and l.id=e.lead_id
          where e.workspace=${w} and (${sourceLead}::uuid is null or e.lead_id<>${sourceLead}::uuid)
          and e.observation->>'rightsAttested'='true' and e.observation->>'contentUrl' is not null
          and to_tsvector('english',coalesce(e.observation->>'teachingTopic','') || ' ' || coalesce(e.observation->>'contentExcerpt',''))
            @@ plainto_tsquery('english',${query})
          and not exists(select 1 from public.creator_evidence newer where newer.workspace=e.workspace
            and newer.lead_id=e.lead_id and (newer.retrieved_at, newer.id)>(e.retrieved_at,e.id))
          order by content_rank desc,e.retrieved_at desc limit 20`;
          return {
            matches: matches.map((row) => {
              const observation = observationSchema.parse(row["observation"]);
              const reasons = ["Permitted observed teaching content matches the search terms"];
              if (
                sourceFollowers !== null &&
                observation.followers !== null &&
                observation.followers >= sourceFollowers / 2 &&
                observation.followers <= sourceFollowers * 2
              )
                reasons.push(
                  "Observed follower scale is within half to twice the reference creator",
                );
              if (sourceLinkState && observation.bioLinks === sourceLinkState)
                reasons.push("Observed bio-link state matches the reference creator");
              return {
                id: row["id"],
                leadId: row["lead_id"],
                username: row["username"],
                qualification: row["qualification"],
                observation,
                reasons,
              };
            }),
            note: "Results are existing workspace observations, not new provider discovery or verified product demand",
          };
        }
        case "overview": {
          const missions =
            await sql`select id,spec,use_ai,state,checkpoint,problem,created_at,plan_hash from public.missions where workspace=${w} order by created_at desc limit 30`;
          const drafts =
            await sql`select d.*,l.username,e.observation,e.qualification,e.reasons,m.spec,
     case when e.qualification='passed' then
       (select count(*) from jsonb_array_elements_text(coalesce((select preferences->'topics' from public.preference_versions where workspace=${w} order by created_at desc limit 1),'[]')) topic where strpos(lower(coalesce(e.observation->>'teachingTopic','')),lower(topic))>0)
       - (select count(*) from jsonb_array_elements_text(coalesce((select preferences->'avoidTopics' from public.preference_versions where workspace=${w} order by created_at desc limit 1),'[]')) topic where strpos(lower(coalesce(e.observation->>'teachingTopic','')),lower(topic))>0)
     else 0 end as preference_matches
     from public.partnership_drafts d join public.leads l on l.id=d.lead_id and l.workspace_id=d.workspace join public.creator_evidence e on e.id=d.evidence_id and e.workspace=d.workspace join public.missions m on m.id=e.mission_id and m.workspace=d.workspace where d.workspace=${w} order by case d.state when 'invalidated' then 0 when 'review' then 1 else 2 end,preference_matches desc,d.created_at desc limit 10`;
          const evidence =
            await sql`select e.*,l.username from public.creator_evidence e join public.leads l on l.id=e.lead_id and l.workspace_id=e.workspace where e.workspace=${w} order by e.retrieved_at desc limit 20`;
          const providers =
            await sql`select provider,fingerprint,models,validated_at,rights_confirmed,configuration from private.provider_connections where workspace=${w}`;
          const usage = await sql`select a.actor,a.provider,a.currency,count(*)::int as attempts,
          sum(case when r.attempt_id is null then coalesce(a.settled_nanos,0) else 0 end)::text as settled_nanos,
          sum(case when a.status='pending' then a.reserved_nanos else 0 end)::text as pending_nanos,
          sum(coalesce(r.amount_nanos,0))::text as reconciled_nanos
          from public.usage_attempts a left join public.provider_reconciliations r on r.attempt_id=a.id
          where a.workspace=${w} group by a.actor,a.provider,a.currency`;
          const attempts =
            role === "owner" || role === "admin"
              ? await sql`select a.id,a.actor,a.provider,a.task,a.status,a.billing_basis,a.reserved_nanos::text,
            a.settled_nanos::text,r.amount_nanos::text as reconciled_nanos,a.created_at
            from public.usage_attempts a left join public.provider_reconciliations r on r.attempt_id=a.id
            where a.workspace=${w} order by a.created_at desc limit 30`
              : [];
          const limits =
            await sql`select s.*,w.research_enabled from public.spend_limits s join public.workspaces w on w.id=s.workspace where workspace=${w}`;
          const preferences =
            await sql`select id,preferences,reason,created_at from public.preference_versions where workspace=${w} order by created_at desc limit 10`;
          const feedback =
            await sql`select topic,decision,reason from public.creator_feedback where workspace=${w} order by created_at desc limit 30`;
          const proposals =
            await sql`select id,lead_id,title,public_content,version from public.proposals where workspace=${w} order by created_at desc limit 20`;
          const projects =
            await sql`select * from public.partnership_projects where workspace=${w} order by created_at desc limit 20`;
          const replies =
            await sql`select id,lead_id,subject,sent_at from public.email_messages where workspace_id=${w} and user_id=${actor} and direction='in' and not is_read order by sent_at desc limit 10`;
          const followups = await sql`select id,username,last_touched_at,owner_id from public.leads
          where workspace_id=${w} and stage='contacted' and last_touched_at<now()-interval '2 days'
          and (owner_id=${actor} or owner_id is null)
          order by last_touched_at asc,id limit 10`;
          const approvedDrafts =
            await sql`select d.id,l.username,d.approved_at from public.partnership_drafts d
          join public.leads l on l.workspace_id=d.workspace and l.id=d.lead_id
          where d.workspace=${w} and d.state='approved' and (l.owner_id=${actor} or l.owner_id is null)
          order by d.approved_at asc limit 10`;
          const [entitlement] = await sql`select private.is_developer() as developer`;
          const [founderAccess] =
            await sql`select protected_founder from public.workspace_members where workspace=${w} and user_id=${actor}`;
          const founders = founderAccess?.["protected_founder"]
            ? await sql`select f.email,(u.email_confirmed_at is not null) as verified,(m.user_id is not null) as member,coalesce(m.role,'pending') as role,(d.user_id is not null and lower(trim(u.email))=d.verified_email and u.email_confirmed_at is not null) as developer from (values ('kerim.sabic@gmail.com'),('mehmed.barlov@gmail.com'),('amrudin.naser@gmail.com')) f(email) left join auth.users u on lower(trim(u.email))=f.email left join public.workspace_members m on m.user_id=u.id and m.workspace=${w} left join public.developer_entitlements d on d.user_id=u.id`
            : [];
          return {
            missions,
            drafts,
            evidence,
            providers,
            usage,
            attempts,
            limits,
            preferences,
            feedback,
            proposals,
            projects,
            replies,
            followups,
            approvedDrafts,
            founders,
            developer: entitlement?.["developer"] === true,
            role,
          };
        }
        case "createMission": {
          const candidates = c.spec.source === "user_import" ? parseCsv(c.csv) : [];
          if (c.spec.source === "user_import" && !candidates.length)
            throw new Error("Import actual observed records before creating this mission");
          if (c.useAi && c.spec.autonomy !== "research")
            throw new Error("AI research requires research autonomy and approved spend");
          const planHash = hash({ spec: c.spec, candidates, useAi: c.useAi });
          const [row] =
            await sql`insert into public.missions(workspace,actor,spec,candidates,use_ai,plan_hash) values(${w},${actor},${sql.json(c.spec)},${sql.json(candidates)},${c.useAi},${planHash}) returning id`;
          return { id: row!["id"], hash: planHash, contract: c.spec, imported: candidates.length };
        }
        case "approveMission": {
          const [m] =
            await sql`select * from public.missions where workspace=${w} and id=${c.id} for update`;
          if (!m || m["actor"] !== actor || m["plan_hash"] !== c.hash || m["state"] !== "planned")
            throw new Error("Plan changed or not owned by you; review again");
          const spec = missionSchema.parse(m["spec"]);
          if (spec.autonomy === "inspect")
            throw new Error(
              "Inspect plans cannot execute. Create a research plan to approve retrieval and drafting.",
            );
          const [settings] =
            await sql`select research_enabled from public.workspaces where id=${w}`;
          if (!settings?.["research_enabled"])
            throw new Error("Workspace research is paused. An admin must enable it in setup.");
          if (spec.source !== "user_import" || m["use_ai"]) {
            const required = [
              ...(spec.source !== "user_import" ? [spec.source] : []),
              ...(m["use_ai"] ? ["deepseek"] : []),
            ];
            for (const provider of required) {
              const [p] =
                await sql`select * from private.provider_connections where workspace=${w} and provider=${provider}`;
              if (!p?.["rights_confirmed"])
                throw new Error(
                  `Configure ${provider} and document source/AI-processing rights before approving paid work`,
                );
              const config = p["configuration"] as Record<string, unknown>;
              if (provider !== "deepseek" && !config["requestCeilingNanos"])
                throw new Error("Configure documented provider request cost ceiling");
              if (provider === "modash" && !config["accessReviewed"])
                throw new Error(
                  "Verify restricted Modash Raw access for this account before approval",
                );
              if (
                provider === "deepseek" &&
                (!config["pricing"] || !(p["models"] as unknown[])?.length)
              )
                throw new Error(
                  "Discover DeepSeek models and configure current pricing before approval",
                );
            }
            const [limit] = await sql`select * from public.spend_limits where workspace=${w}`;
            if (!limit || spec.budgetNanos <= 0)
              throw new Error("Configure workspace limits and a positive mission spend ceiling");
          }
          const bindings =
            await sql`select coalesce(jsonb_object_agg(provider,jsonb_build_object('fingerprint',fingerprint,'configuration',configuration,'rights',rights_confirmed)),'{}') as value from private.provider_connections where workspace=${w}`;
          await sql`update public.missions set provider_bindings=${sql.json(bindings[0]!["value"])} where workspace=${w} and id=${c.id}`;
          await sql`update public.missions set state='queued',approval_hash=plan_hash,approved_at=now(),approved_until=now()+interval '24 hours' where workspace=${w} and id=${c.id}`;
          await sql`insert into public.audit_events(workspace,actor,action,resource_id) values(${w},${actor},'mission.approved',${c.id})`;
          return { state: "queued" };
        }
        case "missionState": {
          const [m] =
            await sql`select * from public.missions where workspace=${w} and id=${c.id} for update`;
          if (!m || m["actor"] !== actor) throw new Error("Mission owner required");
          if (["cancelled", "completed"].includes(String(m["state"])))
            throw new Error("Terminal missions cannot be restarted");
          if (
            c.state === "queued" &&
            (m["state"] !== "paused" ||
              new Date(m["approved_until"] as string).getTime() <= Date.now())
          )
            throw new Error("Only a paused mission with current approval can resume");
          await sql`update public.missions set state=${c.state},lease_token=null,lease_until=null where workspace=${w} and id=${c.id}`;
          return { state: c.state };
        }
        case "review": {
          const [d] =
            await sql`select d.*,e.observation,m.spec from public.partnership_drafts d join public.creator_evidence e on e.id=d.evidence_id and e.workspace=d.workspace join public.missions m on m.id=e.mission_id and m.workspace=d.workspace where d.workspace=${w} and d.id=${c.id} for update of d`;
          if (!d) throw new Error("Draft unavailable");
          const o = observationSchema.parse(d["observation"]),
            s = missionSchema.parse(d["spec"]);
          const [suppressed] =
            await sql`select 1 from public.lead_suppressions where workspace=${w} and handle=${o.handle}`;
          if (
            c.decision !== "reject" &&
            (suppressed ||
              qualify(s, o).status !== "passed" ||
              !checkDraft(d["body"] as string, o) ||
              ["invalidated", "rejected", "manually_recorded"].includes(String(d["state"])))
          )
            throw new Error(
              "Draft blocked: stale, unsupported, suppressed or invalidated evidence",
            );
          const approval = hash({
            body: d["body"],
            evidence: d["evidence_id"],
            opportunity: d["opportunity"],
          });
          if (
            c.decision === "record_manual" &&
            (d["state"] !== "approved" || d["approval_hash"] !== approval)
          )
            throw new Error("Approve the current evidence-bound draft first");
          const next =
            c.decision === "approve"
              ? "approved"
              : c.decision === "reject"
                ? "rejected"
                : "manually_recorded";
          await sql`update public.partnership_drafts set state=${next},approval_hash=${c.decision === "reject" ? null : approval},approved_by=${actor},approved_at=now() where workspace=${w} and id=${c.id}`;
          if (c.decision === "record_manual")
            await sql`update public.leads set stage='contacted',last_touched_at=now(),last_touched_by=${actor} where workspace_id=${w} and id=${d["lead_id"]}`;
          await sql`insert into public.audit_events(workspace,actor,action,resource_id) values(${w},${actor},${"draft." + next},${c.id})`;
          return { state: next };
        }
        case "editDraft": {
          const [draft] = await sql`select d.id,d.lead_id,d.state,e.observation
          from public.partnership_drafts d join public.creator_evidence e
          on e.workspace=d.workspace and e.id=d.evidence_id
          where d.workspace=${w} and d.id=${c.id} for update of d`;
          if (!draft || ["invalidated", "manually_recorded"].includes(String(draft["state"])))
            throw new Error("Draft unavailable for editing");
          const observation = observationSchema.parse(draft["observation"]);
          if (c.body.includes("@") && !c.body.includes(`@${observation.handle}`))
            throw new Error("Draft refers to a different creator handle");
          await sql`update public.partnership_drafts set body=${c.body},state='review',approval_hash=null,
          approved_by=null,approved_at=null where workspace=${w} and id=${c.id}`;
          await sql`insert into public.audit_events(workspace,actor,action,resource_id)
          values(${w},${actor},'draft.edited',${c.id})`;
          return {
            saved: true,
            supported: checkDraft(c.body, observation),
            genericAlternative: genericDraft(observation),
          };
        }
        case "prepareManualOutreach": {
          const [draft] = await sql`select d.*,e.observation,m.spec,l.stage,l.owner_id
            from public.partnership_drafts d
            join public.creator_evidence e on e.workspace=d.workspace and e.id=d.evidence_id
            join public.missions m on m.workspace=d.workspace and m.id=e.mission_id
            join public.leads l on l.workspace_id=d.workspace and l.id=d.lead_id
            where d.workspace=${w} and d.id=${c.id} for update of d,l`;
          if (!draft || draft["state"] !== "approved")
            throw new Error("Approved draft unavailable");
          const observation = observationSchema.parse(draft["observation"]);
          const spec = missionSchema.parse(draft["spec"]);
          const approval = hash({
            body: draft["body"],
            evidence: draft["evidence_id"],
            opportunity: draft["opportunity"],
          });
          if (
            draft["approval_hash"] !== approval ||
            qualify(spec, observation).status !== "passed" ||
            !checkDraft(String(draft["body"]), observation)
          )
            throw new Error("Draft evidence or approval is stale; review it again");
          if (draft["owner_id"] && draft["owner_id"] !== actor)
            throw new Error("Another teammate owns this creator; coordinate before outreach");
          if (["contacted", "replied", "deal"].includes(String(draft["stage"])))
            throw new Error("This creator is already in an active contact stage");
          const [collision] = await sql`select
            exists(select 1 from public.lead_suppressions where workspace=${w} and handle=${observation.handle}) as suppressed,
            exists(select 1 from private.mail_outbox where workspace=${w} and lead_id=${draft["lead_id"]} and status in ('pending','sent')) as queued_mail,
            exists(select 1 from public.email_messages where workspace=${w} and lead_id=${draft["lead_id"]} and direction='out') as sent_mail,
            exists(select 1 from public.partnership_drafts where workspace=${w} and lead_id=${draft["lead_id"]} and state='manually_recorded') as recorded`;
          if (
            collision?.["suppressed"] ||
            collision?.["queued_mail"] ||
            collision?.["sent_mail"] ||
            collision?.["recorded"]
          )
            throw new Error("Outreach blocked by suppression or existing team contact");
          return { body: draft["body"] as string, checkedAt: new Date().toISOString() };
        }
        case "suppress": {
          await sql`insert into public.lead_suppressions(workspace,handle,reason) values(${w},${c.handle.toLowerCase()},${c.reason}) on conflict(workspace,handle) do nothing`;
          await sql`update public.partnership_drafts set state='invalidated',approval_hash=null where workspace=${w} and lead_id in (select id from public.leads where workspace=${w} and lower(regexp_replace(username,'^@',''))=${c.handle.toLowerCase()})`;
          return { suppressed: true };
        }
        case "preferences": {
          await sql`insert into public.preference_versions(workspace,actor,preferences,reason) values(${w},${actor},${sql.json({ topics: c.topics, avoidTopics: c.avoidTopics })},${c.reason})`;
          return {
            saved: true,
            note: "Transparent topic matching reranks eligible opportunities only. Hard filters unchanged; this is not a response predictor.",
          };
        }
        case "feedback": {
          const [e] =
            await sql`select observation from public.creator_evidence where workspace=${w} and lead_id=${c.leadId} order by retrieved_at desc limit 1`;
          if (!e) throw new Error("Lead evidence unavailable");
          const o = observationSchema.parse(e["observation"]);
          await sql`insert into public.creator_feedback(workspace,lead_id,actor,decision,topic,reason) values(${w},${c.leadId},${actor},${c.decision},${o.teachingTopic ?? "Unresolved topic"},${c.reason})`;
          return {
            saved: true,
            proposedTopic: c.decision !== "unsure" ? o.teachingTopic : null,
            proposedDirection:
              c.decision === "strong_fit" ? "prefer" : c.decision === "not_fit" ? "avoid" : null,
            explanation:
              "Review and adopt the proposed topic preference explicitly. No hard filter changed.",
          };
        }
        case "saveProposal": {
          const [lead] =
            await sql`select id from public.leads where workspace_id=${w} and id=${c.leadId}`;
          if (!lead) throw new Error("Lead unavailable");
          return (
            await sql`insert into public.proposals(workspace,lead_id,title,public_content,created_by) values(${w},${c.leadId},${c.title},${c.content},${actor}) returning id`
          )[0];
        }
        case "shareProposal": {
          requireAdmin(role);
          const [proposal] =
            await sql`select id,version from public.proposals where workspace=${w} and id=${c.id}`;
          if (!proposal) throw new Error("Proposal unavailable");
          const token = randomBytes(32).toString("hex");
          const digest = createHash("sha256").update(token).digest("hex");
          await sql`insert into private.proposal_shares(token_hash,proposal_id,version,approved_by,expires_at) values(${digest},${c.id},${proposal["version"]},${actor},now()+${c.days}*interval '1 day')`;
          await sql`insert into public.audit_events(workspace,actor,action,resource_id) values(${w},${actor},'proposal.bearer_link_approved',${c.id})`;
          return {
            token,
            exposure:
              "Anyone with the link can read ONLY the displayed proposal fields until expiry or revocation.",
          };
        }
        case "revokeProposal": {
          requireAdmin(role);
          await sql`update private.proposal_shares set revoked_at=now() where proposal_id in (select id from public.proposals where workspace=${w} and id=${c.id})`;
          return { revoked: true };
        }
        case "handoff": {
          const [lead] =
            await sql`select id from public.leads where workspace_id=${w} and id=${c.leadId}`;
          if (!lead) throw new Error("Lead unavailable");
          const [project] =
            await sql`insert into public.partnership_projects(workspace,lead_id,actor,agreed_scope,agreement_reference,validation_task,agreed_terms) values(${w},${c.leadId},${actor},${c.scope},${c.agreementReference},${c.validationTask},${c.agreedTerms}) on conflict(workspace,lead_id) do nothing returning id`;
          if (!project) throw new Error("Partnership project already exists");
          return project;
        }
        case "projectState":
          await sql`update public.partnership_projects set state=${c.state} where workspace=${w} and id=${c.id}`;
          return { updated: true };
        case "limits": {
          requireAdmin(role);
          await sql`select id from public.workspaces where id=${w} for update`;
          await sql`insert into public.spend_limits(workspace,daily_nanos,monthly_nanos) values(${w},${c.daily},${c.monthly}) on conflict(workspace) do update set daily_nanos=excluded.daily_nanos,monthly_nanos=excluded.monthly_nanos`;
          await sql`update public.workspaces set research_enabled=${c.enabled} where id=${w}`;
          await sql`insert into public.audit_events(workspace,actor,action) values(${w},${actor},'budgets.updated')`;
          return { saved: true };
        }
        case "reconcileUsage": {
          requireAdmin(role);
          await sql`select id from public.workspaces where id=${w} for update`;
          const [attempt] =
            await sql`select id from public.usage_attempts where workspace=${w} and id=${c.attemptId} for update`;
          if (!attempt) throw new Error("Usage attempt unavailable");
          const [recorded] =
            await sql`insert into public.provider_reconciliations(attempt_id,workspace,amount_nanos,invoice_reference,recorded_by)
          values(${c.attemptId},${w},${c.actualNanos}::bigint,${c.invoiceReference},${actor})
          on conflict(attempt_id) do nothing returning attempt_id`;
          if (!recorded) throw new Error("Invoice already reconciled for this attempt");
          await sql`update public.usage_attempts set status='settled',billing_basis='invoice_reconciled',settled_at=now() where workspace=${w} and id=${c.attemptId}`;
          await sql`insert into public.audit_events(workspace,actor,action,resource_id) values(${w},${actor},'provider.invoice_reconciled',${c.attemptId})`;
          return { reconciled: true };
        }
        case "removeProvider":
          requireAdmin(role);
          await sql`delete from private.provider_connections where workspace=${w} and provider=${c.provider}`;
          return { removed: true };
      }
    },
  );
}

export async function runWorkerUnit() {
  const lease = randomUUID();
  const claimed = await creatorDb().begin(async (sql) => {
    const [m] =
      await sql`select * from public.missions where state='queued' or (state='running' and lease_until<now()) order by created_at for update skip locked limit 1`;
    if (!m) return null;
    await sql`update public.missions set state='running',lease_token=${lease},lease_until=now()+interval '2 minutes' where id=${m["id"]}`;
    return m;
  });
  if (!claimed) return false;
  const m = claimed as Record<string, unknown>,
    w = m["workspace"] as string,
    actor = m["actor"] as string,
    id = m["id"] as string;
  try {
    const spec = missionSchema.parse(m["spec"]);
    let candidates = z.array(observationSchema).parse(m["candidates"]);
    await withWorkspace(actor, w, true, async (sql) => {
      const [current] =
        await sql`select m.*,w.research_enabled from public.missions m join public.workspaces w on w.id=m.workspace where m.workspace=${w} and m.id=${id}`;
      if (
        !current ||
        current["lease_token"] !== lease ||
        current["approval_hash"] !== current["plan_hash"] ||
        !current["research_enabled"] ||
        new Date(current["approved_until"] as string).getTime() <= Date.now()
      )
        throw new Error("Mission approval expired, changed or workspace research paused");
    });
    if (spec.source !== "user_import" && !m["discovery_done"]) {
      candidates =
        spec.source === "brave"
          ? await discoverBrave(actor, w, id, spec)
          : await discoverModash(actor, w, id, spec);
      await withWorkspace(actor, w, true, async (sql) => {
        await sql`update public.missions set candidates=${sql.json(candidates)},discovery_done=true where workspace=${w} and id=${id} and lease_token=${lease} and state='running'`;
      });
    }
    const index = Number(m["checkpoint"]);
    let o = candidates[index];
    if (o && index < spec.targetCount) {
      const known = await withWorkspace(actor, w, false, async (sql) => {
        const [exists] =
          await sql`select 1 from public.leads where workspace=${w} and lower(regexp_replace(username,'^@',''))=${o!.handle} union all select 1 from public.lead_suppressions where workspace=${w} and handle=${o!.handle} limit 1`;
        return Boolean(exists);
      });
      if (spec.source === "modash" && !known) o = await enrichModash(actor, w, id, spec, o);
      // Short units keep leases bounded; persisted lead/evidence creation is idempotent by workspace handle.
      const saved = await storeObservation(actor, w, id, o, false, lease);
      if (m["use_ai"] && saved.qualification === "passed" && index < spec.reviewLimit) {
        const proposal = await analyzeOpportunity(actor, w, id, o);
        await withWorkspace(actor, w, true, async (sql) => {
          await sql`update public.partnership_drafts set opportunity=${sql.json(proposal)} where workspace=${w} and evidence_id=${saved.evidenceId} and state='review'`;
        });
      }
    }
    const done = !o || index + 1 >= Math.min(candidates.length, spec.targetCount);
    await withWorkspace(actor, w, true, async (sql) => {
      await sql`update public.missions set state=${done ? "completed" : "queued"},checkpoint=${o ? index + 1 : index},lease_token=null,lease_until=null,problem=${done && candidates.length < spec.targetCount ? "Available imported/search batch exhausted; target not broadened" : null} where workspace=${w} and id=${id} and lease_token=${lease} and state='running'`;
    });
  } catch (error) {
    const problem = error instanceof Error ? error.message : "Worker failed";
    await creatorDb()`update public.missions set state=${/budget/i.test(problem) ? "blocked_by_budget" : "blocked_by_provider"},problem=${problem.slice(0, 500)},lease_token=null,lease_until=null where workspace=${w} and id=${id} and lease_token=${lease} and state='running'`;
  }
  return true;
}

export async function readSharedProposal(token: string) {
  const digest = createHash("sha256")
    .update(
      z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(token),
    )
    .digest("hex");
  const [proposal] =
    await creatorDb()`select p.title,p.public_content from private.proposal_shares s join public.proposals p on p.id=s.proposal_id and p.version=s.version join public.workspace_members m on m.workspace=p.workspace and m.user_id=s.approved_by where s.token_hash=${digest} and s.revoked_at is null and s.expires_at>now() and m.role in ('owner','admin') and private.founder_identity_ok(p.workspace,s.approved_by)`;
  if (!proposal) throw new Error("This proposal link is unavailable or expired");
  return { title: proposal["title"] as string, content: proposal["public_content"] as string };
}
