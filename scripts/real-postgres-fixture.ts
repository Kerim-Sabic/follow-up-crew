import postgres from "postgres";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { spec, observed } from "../tests/domain-fixture";
import { executeCommand } from "../src/server/creator-service.server";
import { creatorDb } from "../src/server/creator-db.server";
import { runBulkUnit, consumeDownload, exportStream } from "../src/server/bulk-jobs.server";

// Only an isolated local database created for this test. Never point at a user database.
const ownerUrl = process.env["CREATOR_REAL_PG_FIXTURE_URL"];
const backendPassword = process.env["CREATOR_REAL_PG_BACKEND_PASSWORD"];
if (!ownerUrl) throw new Error("CREATOR_REAL_PG_FIXTURE_URL is required");
if (!backendPassword) throw new Error("CREATOR_REAL_PG_BACKEND_PASSWORD is required");
const parsedUrl = new URL(ownerUrl);
if (
  !["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname) ||
  parsedUrl.pathname !== "/creator_alpha_fixture"
)
  throw new Error("This fixture only accepts the local creator_alpha_fixture database");
const owner = postgres(ownerUrl, { max: 2 });
try {
  await owner.unsafe(`CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE ROLE creator_fixture_backend LOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;
    CREATE PUBLICATION supabase_realtime;`);
  const [passwordDdl] =
    await owner`select format('ALTER ROLE creator_fixture_backend PASSWORD %L',${backendPassword}::text) as ddl`;
  await owner.unsafe(passwordDdl!["ddl"] as string);
  for (let n = 0; n <= 4; n++) {
    const files = [
      "0000_create_crm_schema.sql",
      "0001_add_workspaces_and_curation.sql",
      "0002_custom_lead_stages.sql",
      "0003_allow_reordering_stages.sql",
      "0004_email_mailboxes_and_messages.sql",
    ];
    await owner.unsafe(readFileSync(`drizzle/migrations/${files[n]}`, "utf8"));
  }
  await owner.unsafe(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    ('10000000-0000-4000-8000-000000000001','kerim.sabic@gmail.com',now()),
    ('10000000-0000-4000-8000-000000000002','ordinary@example.test',now());
    INSERT INTO public.leads(id,username,workspace,stage) VALUES
    ('20000000-0000-4000-8000-000000000001','fixture_legacy','docmesker','contacted'),
    ('20000000-0000-4000-8000-000000000002','fixture_justin','justin','not_contacted');
    INSERT INTO public.lead_notes(lead_id,author_id,body) VALUES
    ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','fixture retained note');`);
  if (process.platform === "win32") {
    const wsl = (...args: string[]) =>
      execFileSync("wsl.exe", ["-d", "Ubuntu", "--", "sudo", "-u", "postgres", ...args], {
        encoding: "utf8",
      });
    wsl(
      "pg_dump",
      "-Fc",
      "-f",
      "/tmp/creator_alpha_fixture_baseline.dump",
      "creator_alpha_fixture",
    );
    wsl("createdb", "creator_alpha_backup_check");
    try {
      wsl(
        "pg_restore",
        "-d",
        "creator_alpha_backup_check",
        "/tmp/creator_alpha_fixture_baseline.dump",
      );
      const checkUrl = new URL(ownerUrl);
      checkUrl.pathname = "/creator_alpha_backup_check";
      const restored = postgres(checkUrl.toString(), { max: 1 });
      try {
        const [counts] = await restored`select (select count(*)::int from public.leads) as leads,
          (select count(*)::int from public.lead_notes) as notes`;
        if (counts?.["leads"] !== 2 || counts?.["notes"] !== 1)
          throw new Error("Backup restore did not preserve legacy relationships");
      } finally {
        await restored.end();
      }
    } finally {
      wsl("dropdb", "--force", "creator_alpha_backup_check");
    }
  }
  const migrationEnv = { ...process.env, CREATOR_DATABASE_URL: ownerUrl };
  const rehearse = execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate.ts", "--adopt-legacy-baseline"],
    { env: migrationEnv, encoding: "utf8" },
  );
  if (!rehearse.includes("Rehearsal passed"))
    throw new Error("Migration rollback rehearsal did not pass");
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/migrate.ts", "--adopt-legacy-baseline", "--apply"],
    { env: migrationEnv, encoding: "utf8" },
  );
  await owner.unsafe(`GRANT USAGE ON SCHEMA public,private,auth TO creator_fixture_backend;
    GRANT SELECT ON auth.users TO creator_fixture_backend;
    GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,private TO creator_fixture_backend;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private,auth TO creator_fixture_backend;`);
  const founder = "10000000-0000-4000-8000-000000000001";
  const ordinary = "10000000-0000-4000-8000-000000000002";
  const w = "00000000-0000-4000-8000-000000000001";
  const testRls = async (actor: string) =>
    owner.begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE authenticated");
      await tx`select set_config('request.jwt.claim.sub',${actor},true)`;
      return (await tx`select count(*)::int as n from public.leads where workspace=${w}`)[0]![
        "n"
      ] as number;
    });
  if ((await testRls(founder)) !== 1 || (await testRls(ordinary)) !== 0)
    throw new Error("RLS isolation failed on separate authenticated sessions");
  const row = (
    await owner`select count(*)::int as n from public.lead_notes where body='fixture retained note'`
  )[0];
  if (row?.["n"] !== 1) throw new Error("Legacy note reconciliation failed");

  // Exercise the deployed server service with a non-superuser backend role.
  const backendUrl = new URL(ownerUrl);
  backendUrl.username = "creator_fixture_backend";
  backendUrl.password = backendPassword;
  process.env["CREATOR_DATABASE_URL"] = backendUrl.toString();
  await executeCommand(founder, {
    action: "limits",
    workspace: w,
    daily: 1000,
    monthly: 1000,
    enabled: true,
  });
  await owner`insert into private.provider_connections(workspace,provider,ciphertext,fingerprint,configuration,rights_confirmed)
    values(${w},'brave','fixture-only','fixture',${owner.json({ requestCeilingNanos: "700" })},true)`;
  const now = new Date().toISOString();
  const observation = { ...observed, observedAt: now, lastPostAt: now };
  const fields = Object.keys(observation).filter((k) => k !== "method");
  const csv =
    fields.join(",") +
    "\n" +
    fields
      .map((k) => `"${String(observation[k as keyof typeof observation]).replaceAll('"', '""')}"`)
      .join(",");
  const mission = (await executeCommand(founder, {
    action: "createMission",
    workspace: w,
    spec: { ...spec, budgetNanos: 1500 },
    csv,
    useAi: false,
  })) as { id: string; hash: string };
  await executeCommand(founder, {
    action: "approveMission",
    workspace: w,
    id: mission.id,
    hash: mission.hash,
  });
  await owner`update private.provider_connections set fingerprint='changed' where workspace=${w} and provider='brave'`;
  // Funding is bound at approval. A changed connection must fail before any paid attempt.
  const attempt = async (key: string) => {
    const sql = postgres(process.env["CREATOR_DATABASE_URL"]!, { max: 1 });
    try {
      return await sql.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub',${founder},true)`;
        return tx`select private.reserve_attempt(${w},${mission.id},${key},'brave','discovery',700::bigint,null,'test')`;
      });
    } finally {
      await sql.end();
    }
  };
  const rejectedBinding = await Promise.allSettled([attempt("binding-test")]);
  if (rejectedBinding[0]?.status !== "rejected")
    throw new Error("Funding binding did not reject changed provider configuration");
  // Restore the exact bound provider configuration and test two simultaneous connections.
  await owner`update private.provider_connections set fingerprint='fixture' where workspace=${w} and provider='brave'`;
  const concurrent = await Promise.allSettled([attempt("race-a"), attempt("race-b")]);
  const fulfilled = concurrent.filter((r) => r.status === "fulfilled").length;
  if (fulfilled !== 1)
    throw new Error(
      `Expected exactly one budget reservation; got ${fulfilled}: ${concurrent.map((r) => (r.status === "rejected" ? String(r.reason) : "approved")).join(" | ")}`,
    );
  const [first] = await owner`select id from public.usage_attempts where workspace=${w}`;
  if (!first) throw new Error("Expected a reserved attempt");
  await executeCommand(founder, {
    action: "reconcileUsage",
    workspace: w,
    attemptId: first["id"] as string,
    actualNanos: 200,
    invoiceReference: "FIXTURE-INVOICE-1",
  });
  let duplicateRejected = false;
  try {
    await executeCommand(founder, {
      action: "reconcileUsage",
      workspace: w,
      attemptId: first["id"] as string,
      actualNanos: 0,
      invoiceReference: "FIXTURE-INVOICE-DUPLICATE",
    });
  } catch {
    duplicateRejected = true;
  }
  if (!duplicateRejected) throw new Error("Duplicate invoice reconciliation was accepted");
  const afterInvoice = await Promise.allSettled([
    attempt("after-invoice"),
    attempt("after-invoice-extra"),
  ]);
  if (afterInvoice.filter((item) => item.status === "fulfilled").length !== 1)
    throw new Error("Reconciled amount did not control subsequent reservations");
  const attempts = (
    await owner`select count(*)::int as n from public.usage_attempts where workspace=${w}`
  )[0]!["n"];
  if (attempts !== 2) throw new Error("Unexpected attempt count after reconciliation");
  const [firstStage] =
    await owner`select key from public.lead_stages where workspace=${w} order by position limit 1`;
  const [secondStage] =
    await owner`select key from public.lead_stages where workspace=${w} and key<>${firstStage!["key"] as string} order by position limit 1`;
  if (!secondStage) throw new Error("Fixture requires two stages");
  await owner`insert into public.leads(username,workspace,stage) values
    ('bulk_fixture_a',${w},${firstStage!["key"] as string}),
    ('bulk_fixture_b',${w},${firstStage!["key"] as string})`;
  const filters = { query: "bulk_fixture", stage: "", owner: "", email: "" } as const;
  const exportJob = (await executeCommand(founder, {
    action: "createBulkJob",
    workspace: w,
    requestKey: crypto.randomUUID(),
    filters,
    kind: "export",
  })) as { id: string; total: number };
  if (exportJob.total !== 2) throw new Error("All-matching snapshot had incorrect count");
  // A crashed worker's expired lease must be reclaimed without losing the snapshot.
  await owner`update private.bulk_jobs set state='running',lease_token=${crypto.randomUUID()},lease_until=now()-interval '1 minute' where id=${exportJob.id}`;
  if (!(await runBulkUnit())) throw new Error("Expired bulk worker lease not reclaimed");
  const [finishedExport] =
    await owner`select state,done from private.bulk_jobs where id=${exportJob.id}`;
  if (finishedExport?.["state"] !== "completed" || Number(finishedExport["done"]) !== 2)
    throw new Error("Recovered export did not finish");
  const grant = (await executeCommand(founder, {
    action: "prepareBulkDownload",
    workspace: w,
    id: exportJob.id,
  })) as { token: string };
  let tokenRejected = false;
  await consumeDownload(exportJob.id, grant.token);
  try {
    await consumeDownload(exportJob.id, grant.token);
  } catch {
    tokenRejected = true;
  }
  if (!tokenRejected) throw new Error("Download token replay was accepted");
  const csvExport = await new Response(exportStream(founder, w, exportJob.id)).text();
  if (!csvExport.includes("bulk_fixture_a") || !csvExport.includes("bulk_fixture_b"))
    throw new Error("Export missing snapshotted rows");
  const stageJob = (await executeCommand(founder, {
    action: "createBulkJob",
    workspace: w,
    requestKey: crypto.randomUUID(),
    filters,
    kind: "stage",
    targetStage: secondStage["key"] as string,
  })) as { id: string; total: number };
  await owner`update public.leads set stage=${secondStage["key"] as string} where workspace=${w} and username='bulk_fixture_b'`;
  if (!(await runBulkUnit())) throw new Error("Stage job not processed");
  const [finishedStage] =
    await owner`select state,done,skipped from private.bulk_jobs where id=${stageJob.id}`;
  if (
    finishedStage?.["state"] !== "completed" ||
    Number(finishedStage["done"]) !== 2 ||
    Number(finishedStage["skipped"]) !== 1
  )
    throw new Error("Stage job did not preserve intervening teammate edit");
  const ordinaryJobs = await executeCommand(ordinary, { action: "bulkJobs", workspace: w }).catch(
    () => [],
  );
  if ((ordinaryJobs as unknown[]).length)
    throw new Error("Ordinary user saw another workspace's bulk jobs");
  console.log(
    JSON.stringify({
      database: "PostgreSQL 18 local WSL fixture",
      backendRole: "non-superuser BYPASSRLS",
      rls: "two authenticated users isolated",
      legacyNote: "retained",
      concurrentReservations: "one approved, one denied",
      attempts,
      invoiceReconciliation:
        "recorded once; actual amount used for the next concurrent reservation",
      bulkExport: "two matching rows, expired lease recovered, one-time scoped download",
      bulkStage: "one changed, one skipped after intervening edit",
    }),
  );
  await creatorDb().end();
} finally {
  await owner.end();
}
