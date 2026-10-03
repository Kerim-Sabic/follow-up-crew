import postgres from "postgres";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const url = process.env["CREATOR_DATABASE_URL"];
if (!url)
  throw new Error(
    "Set CREATOR_DATABASE_URL to a backed-up staging database. No database was changed.",
  );
const apply = process.argv.includes("--apply");
const host = new URL(url).hostname;
if (
  apply &&
  !["localhost", "127.0.0.1", "::1"].includes(host) &&
  !process.argv.includes("--approved-remote")
)
  throw new Error(
    "Remote apply requires explicit --approved-remote after backup, reconciliation and staging tests. Default is rollback-only rehearsal.",
  );
const sql = postgres(url, { max: 1 });
const journal = JSON.parse(readFileSync("drizzle/migrations/meta/_journal.json", "utf8")) as {
  entries: { tag: string; when: number }[];
};
try {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(742619)`;
    const [existing] = await tx`select to_regclass('public.leads') is not null as present`;
    await tx`create schema if not exists private`;
    await tx`create table if not exists private.creator_migrations(tag text primary key,hash text not null,applied_at timestamptz not null default now())`;
    const applied = await tx`select tag,hash from private.creator_migrations`;
    const map = new Map(applied.map((r) => [String(r["tag"]), String(r["hash"])]));
    if (existing?.["present"] && !map.size && !process.argv.includes("--adopt-legacy-baseline"))
      throw new Error(
        "Existing database: verify migrations 0000–0004 match deployed schema, then pass --adopt-legacy-baseline for the rehearsal. Never blindly replay baseline DDL.",
      );
    const before = existing?.["present"]
      ? await tx`select (select count(*) from leads)::text as leads,(select count(*) from lead_notes)::text as notes,(select count(*) from email_messages)::text as messages`
      : [];
    for (const entry of journal.entries) {
      const source = readFileSync(`drizzle/migrations/${entry.tag}.sql`, "utf8");
      const hash = createHash("sha256").update(source).digest("hex");
      if (map.has(entry.tag)) {
        if (map.get(entry.tag) !== hash) throw new Error(`Applied migration changed: ${entry.tag}`);
        continue;
      }
      if (!(existing?.["present"] && Number(entry.tag.slice(0, 4)) < 5)) await tx.unsafe(source);
      await tx`insert into private.creator_migrations(tag,hash) values(${entry.tag},${hash})`;
    }
    const after =
      await tx`select (select count(*) from leads)::text as leads,(select count(*) from lead_notes)::text as notes,(select count(*) from email_messages)::text as messages`;
    if (before.length && JSON.stringify(before) !== JSON.stringify(after))
      throw new Error("Row-count reconciliation failed");
    const [orphan] =
      await tx`select count(*)::int as n from lead_notes n left join leads l on l.id=n.lead_id and l.workspace=n.workspace where l.id is null`;
    if (orphan?.["n"] !== 0) throw new Error("Relationship reconciliation failed");
    console.log(
      JSON.stringify({
        mode: apply ? "apply" : "dry-run rollback",
        before,
        after,
        orphanNotes: orphan?.["n"],
        migrations: journal.entries.length,
      }),
    );
    if (!apply) throw new Error("REHEARSAL_ROLLBACK");
  });
} catch (e) {
  if (e instanceof Error && e.message === "REHEARSAL_ROLLBACK")
    console.log("Rehearsal passed; all schema/data changes rolled back.");
  else throw e;
} finally {
  await sql.end();
}
