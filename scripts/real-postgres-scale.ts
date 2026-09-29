import postgres from "postgres";
import { executeCommand } from "../src/server/creator-service.server";
import { runBulkUnit, exportStream } from "../src/server/bulk-jobs.server";
import { creatorDb } from "../src/server/creator-db.server";

const ownerUrl = process.env["CREATOR_REAL_PG_FIXTURE_URL"];
const backendPassword = process.env["CREATOR_REAL_PG_BACKEND_PASSWORD"];
if (!ownerUrl || !backendPassword) throw new Error("Local fixture credentials required");
const parsed = new URL(ownerUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
  parsed.pathname !== "/creator_alpha_fixture"
)
  throw new Error("Scale script only accepts the isolated local fixture database");
const backendUrl = new URL(ownerUrl);
backendUrl.username = "creator_fixture_backend";
backendUrl.password = backendPassword;
process.env["CREATOR_DATABASE_URL"] = backendUrl.toString();
const sql = postgres(ownerUrl, { max: 2 });
const founder = "10000000-0000-4000-8000-000000000001";
const workspace = "00000000-0000-4000-8000-000000000001";
try {
  const [stage] =
    await sql`select key from public.lead_stages where workspace=${workspace} order by position limit 1`;
  const start = performance.now();
  for (let startAt = 1; startAt <= 100000; startAt += 1000)
    await sql`insert into public.leads(workspace,username,stage)
      select ${workspace},'synthetic_scale_' || n::text,${stage!["key"] as string}
      from generate_series(${startAt}::integer,${startAt + 999}::integer) n on conflict do nothing`;
  const insertedMs = Math.round(performance.now() - start);
  await sql`analyze public.leads`;
  const before = performance.now();
  const job = (await executeCommand(founder, {
    action: "createBulkJob",
    workspace,
    requestKey: crypto.randomUUID(),
    kind: "export",
    filters: { query: "synthetic_scale_", stage: "", owner: "", email: "" },
  })) as { id: string; total: number };
  if (job.total !== 100000) throw new Error(`Expected 100000 matching records, found ${job.total}`);
  const snapshotMs = Math.round(performance.now() - before);
  let units = 0;
  while (await runBulkUnit()) {
    units++;
    const [state] = await sql`select state from private.bulk_jobs where id=${job.id}`;
    if (state!["state"] === "completed") break;
    if (units > 1001) throw new Error("Bulk worker did not finish within expected units");
  }
  const workerMs = Math.round(performance.now() - before - snapshotMs);
  const [done] =
    await sql`select state,total,done,skipped from private.bulk_jobs where id=${job.id}`;
  if (
    done!["state"] !== "completed" ||
    Number(done!["done"]) !== 100000 ||
    Number(done!["skipped"]) !== 0
  )
    throw new Error("100000-row export did not complete exactly once");
  const stream = exportStream(founder, workspace, job.id);
  const reader = stream.getReader();
  let bytes = 0,
    lines = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    bytes += value!.length;
    lines += decoder.decode(value).split("\n").length - 1;
  }
  if (lines !== 100001)
    throw new Error(`Export line count ${lines} did not match header plus 100000 records`);
  console.log(
    JSON.stringify({
      kind: "synthetic local PostgreSQL, not real creators",
      records: 100000,
      insertedMs,
      snapshotMs,
      workerMs,
      units,
      exportedBytes: bytes,
      exportedLines: lines,
    }),
  );
} catch (error) {
  console.error("Scale fixture failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await creatorDb().end({ timeout: 5 });
  await sql.end({ timeout: 5 });
}
