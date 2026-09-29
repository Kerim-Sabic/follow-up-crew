import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { creatorDb, requireAdmin, withWorkspace } from "./creator-db.server";

export const leadFilterSchema = z
  .object({
    query: z.string().max(100),
    stage: z.string().max(80),
    owner: z.enum(["", "mine", "unassigned"]),
    email: z.enum(["", "yes", "no"]),
  })
  .strict();
export type LeadFilter = z.infer<typeof leadFilterSchema>;

function csvCell(value: unknown) {
  const raw = value == null ? "" : String(value);
  const safe = /^[\s]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
const csvLine = (row: Record<string, unknown>) =>
  ["id", "number", "username", "full_name", "email", "instagram_url", "niche", "stage"]
    .map((key) => csvCell(row[key]))
    .join(",");

export async function createBulkJob(
  actor: string,
  w: string,
  requestKey: string,
  filters: LeadFilter,
  kind: "stage" | "export",
  targetStage?: string,
) {
  const f = leadFilterSchema.parse(filters);
  return withWorkspace(actor, w, true, async (sql) => {
    await sql`select id from public.workspaces where id=${w} for update`;
    const [existing] =
      await sql`select id,total,state from private.bulk_jobs where workspace=${w} and actor=${actor} and request_key=${requestKey}`;
    if (existing) return existing;
    if (kind === "stage") {
      if (!targetStage) throw new Error("Select a stage before starting a bulk change");
      const [stage] =
        await sql`select 1 from public.lead_stages where workspace=${w} and key=${targetStage}`;
      if (!stage) throw new Error("Stage unavailable in this workspace");
    }
    const [job] =
      await sql`insert into private.bulk_jobs(workspace,actor,request_key,kind,target_stage,filters)
      values(${w},${actor},${requestKey},${kind},${targetStage ?? null},${sql.json(f)}) returning id`;
    const id = job!["id"] as string;
    const [snapshot] =
      await sql`with inserted as (insert into private.bulk_job_items(job_id,workspace,lead_id,original_stage,position)
      select ${id},l.workspace,l.id,l.stage,row_number() over(order by l.id)
      from public.leads l where l.workspace=${w}
      and (${f.query}='' or strpos(lower(l.username||' '||coalesce(l.full_name,'')||' '||coalesce(l.email,'')),lower(${f.query}))>0)
      and (${f.stage}='' or l.stage=${f.stage})
      and (${f.owner}='' or (${f.owner}='mine' and l.owner_id=${actor}) or (${f.owner}='unassigned' and l.owner_id is null))
      and (${f.email}='' or (${f.email}='yes' and l.email is not null and l.email<>'') or (${f.email}='no' and (l.email is null or l.email='')))
      returning 1) select count(*)::int as total from inserted`;
    const total = Number(snapshot!["total"]);
    await sql`update private.bulk_jobs set total=${total},state=${total ? "queued" : "completed"},completed_at=${total ? null : new Date()} where id=${id}`;
    await sql`insert into public.audit_events(workspace,actor,action,resource_id) values(${w},${actor},${"bulk." + kind + ".queued"},${id})`;
    return { id, total, state: total ? "queued" : "completed" };
  });
}

export async function listBulkJobs(actor: string, w: string) {
  return withWorkspace(
    actor,
    w,
    false,
    async (sql, role) =>
      sql`select id,actor,kind,target_stage,filters,state,total,done,skipped,problem,created_at,completed_at
      from private.bulk_jobs where workspace=${w} and (${role} in ('owner','admin') or actor=${actor})
      order by created_at desc limit 30`,
  );
}

export async function cancelBulkJob(actor: string, w: string, id: string) {
  return withWorkspace(actor, w, true, async (sql, role) => {
    const [job] =
      await sql`select actor,state from private.bulk_jobs where workspace=${w} and id=${id} for update`;
    if (!job || (job["actor"] !== actor && !["owner", "admin"].includes(role)))
      throw new Error("Bulk job unavailable");
    if (!["queued", "running"].includes(String(job["state"])))
      throw new Error("Only active jobs can be cancelled");
    await sql`update private.bulk_jobs set state='cancelled',lease_token=null,lease_until=null where id=${id}`;
    return { cancelled: true };
  });
}

export async function runBulkUnit() {
  const lease = randomUUID();
  const [claimed] = await creatorDb().begin(async (sql) => {
    const [job] = await sql`select id,workspace,actor from private.bulk_jobs
      where state='queued' or (state='running' and lease_until<now())
      order by created_at for update skip locked limit 1`;
    if (!job) return [];
    await sql`update private.bulk_jobs set state='running',lease_token=${lease},lease_until=now()+interval '2 minutes' where id=${job["id"]}`;
    return [job];
  });
  if (!claimed) return false;
  const id = claimed["id"] as string,
    w = claimed["workspace"] as string,
    actor = claimed["actor"] as string;
  try {
    await withWorkspace(actor, w, true, async (sql) => {
      const [job] =
        await sql`select * from private.bulk_jobs where workspace=${w} and id=${id} for update`;
      if (!job || job["state"] !== "running" || job["lease_token"] !== lease)
        throw new Error("Bulk job cancelled or lease replaced");
      const rows = await sql`select i.lead_id,i.original_stage,i.position,l.id,l.number,l.username,
        l.full_name,l.email,l.instagram_url,l.niche,l.stage from private.bulk_job_items i
        left join public.leads l on l.id=i.lead_id and l.workspace=i.workspace
        where i.job_id=${id} and not i.processed order by i.position limit 100 for update of i`;
      if (!rows.length) {
        await sql`update private.bulk_jobs set state='completed',completed_at=now(),lease_token=null,lease_until=null where id=${id}`;
        return;
      }
      let skipped = 0;
      if (job["kind"] === "stage") {
        const changed =
          await sql`update public.leads l set stage=${job["target_stage"] as string},last_touched_by=${actor},last_touched_at=now()
          from private.bulk_job_items i where i.job_id=${id} and i.lead_id=l.id and l.workspace=${w}
          and not i.processed and i.position>=${rows[0]!["position"] as number} and i.position<=${rows.at(-1)!["position"] as number}
          and l.stage is not distinct from i.original_stage returning l.id`;
        const changedIds = new Set(changed.map((row) => row["id"] as string));
        const updates = rows.map((row) => ({
          lead_id: row["lead_id"],
          skipped: !changedIds.has(row["lead_id"] as string),
        }));
        skipped = updates.filter((row) => row.skipped).length;
        await sql`update private.bulk_job_items i set processed=true,skipped=x.skipped
          from jsonb_to_recordset(${sql.json(updates)}::jsonb) as x(lead_id uuid,skipped boolean)
          where i.job_id=${id} and i.lead_id=x.lead_id`;
      } else {
        const updates = rows.map((row) => ({
          lead_id: row["lead_id"],
          skipped: row["id"] == null,
          csv_line: row["id"] == null ? null : csvLine(row),
        }));
        skipped = updates.filter((row) => row.skipped).length;
        await sql`update private.bulk_job_items i set processed=true,skipped=x.skipped,csv_line=x.csv_line
          from jsonb_to_recordset(${sql.json(updates)}::jsonb) as x(lead_id uuid,skipped boolean,csv_line text)
          where i.job_id=${id} and i.lead_id=x.lead_id`;
      }
      const done = Number(job["done"]) + rows.length;
      const complete = done >= Number(job["total"]);
      await sql`update private.bulk_jobs set done=${done},skipped=skipped+${skipped},state=${complete ? "completed" : "queued"},
        completed_at=${complete ? new Date() : null},lease_token=null,lease_until=null where id=${id}`;
    });
  } catch (error) {
    await creatorDb()`update private.bulk_jobs set state='failed',problem=${String(error).slice(0, 300)},lease_token=null,lease_until=null
      where id=${id} and lease_token=${lease}`;
  }
  return true;
}

export async function prepareDownload(actor: string, w: string, id: string) {
  return withWorkspace(actor, w, false, async (sql, role) => {
    const [job] =
      await sql`select actor,kind,state from private.bulk_jobs where workspace=${w} and id=${id}`;
    if (
      !job ||
      job["kind"] !== "export" ||
      job["state"] !== "completed" ||
      (job["actor"] !== actor && !["owner", "admin"].includes(role))
    )
      throw new Error("Completed export unavailable");
    const token = randomBytes(32).toString("hex");
    const digest = createHash("sha256").update(token).digest("hex");
    await sql`insert into private.bulk_downloads(token_hash,workspace,job_id,actor,expires_at)
      values(${digest},${w},${id},${actor},now()+interval '5 minutes')`;
    return { token };
  });
}

export async function consumeDownload(id: string, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Invalid download token");
  const digest = createHash("sha256").update(token).digest("hex");
  const [grant] = await creatorDb().begin(async (sql) => {
    const [row] = await sql`select d.workspace,d.actor,j.state,j.kind from private.bulk_downloads d
      join private.bulk_jobs j on j.id=d.job_id and j.workspace=d.workspace
      where d.token_hash=${digest} and d.job_id=${id} and d.used_at is null and d.expires_at>now() for update of d`;
    if (!row || row["state"] !== "completed" || row["kind"] !== "export") return [];
    await sql`select set_config('request.jwt.claim.sub',${row["actor"] as string},true)`;
    const [membership] =
      await sql`select private.member_role(${row["workspace"] as string}::uuid) as role`;
    if (!membership?.["role"]) return [];
    await sql`update private.bulk_downloads set used_at=now() where token_hash=${digest}`;
    return [{ workspace: row["workspace"], actor: row["actor"] }];
  });
  if (!grant) throw new Error("Download unavailable, expired or revoked");
  return grant as { workspace: string; actor: string };
}

export function exportStream(actor: string, w: string, id: string) {
  let position = 0;
  let header = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const rows = await withWorkspace(actor, w, false, async (sql) => {
          const [job] =
            await sql`select state from private.bulk_jobs where workspace=${w} and id=${id}`;
          if (!job || job["state"] !== "completed") throw new Error("Export no longer available");
          return sql`select position,csv_line from private.bulk_job_items where job_id=${id} and position>${position}
            order by position limit 200`;
        });
        let chunk = header
          ? ""
          : "\ufeffid,number,username,full_name,email,instagram_url,niche,stage\r\n";
        header = true;
        for (const row of rows) {
          position = Number(row["position"]);
          if (row["csv_line"] != null) chunk += `${row["csv_line"]}\r\n`;
        }
        if (chunk) controller.enqueue(new TextEncoder().encode(chunk));
        if (rows.length < 200) controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
