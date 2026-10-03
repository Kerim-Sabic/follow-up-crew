import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const alice = "10000000-0000-4000-8000-000000000001";
const bob = "10000000-0000-4000-8000-000000000002";

test("legacy CRM note trigger, stage transitions, rollback and note-author restrictions", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA private;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth,private TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    // Recovered CRM baseline only. Do not apply the inactive creator schema.
    for (const file of readdirSync("drizzle/migrations")
      .filter((name) => /^000[0-4].*\.sql$/.test(name))
      .sort()) {
      await db.exec(
        readFileSync(`drizzle/migrations/${file}`, "utf8").replace(
          /ALTER PUBLICATION supabase_realtime ADD TABLE public\.\w+;/g,
          "",
        ),
      );
    }
    await db.exec(`INSERT INTO auth.users(id,email) VALUES('${alice}','alice@example.test'),('${bob}','bob@example.test');
      ALTER TABLE leads ADD COLUMN workspace_id uuid;
      ALTER TABLE lead_notes ADD COLUMN workspace_id uuid;
      INSERT INTO leads(username,workspace,workspace_id) VALUES('fixture-doc','docmesker','00000000-0000-4000-8000-000000000001'),('fixture-justin','justin','00000000-0000-4000-8000-000000000002');
      CREATE FUNCTION private.sync_legacy_workspace() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.workspace_id IS NULL THEN SELECT workspace_id INTO NEW.workspace_id FROM public.leads WHERE id=NEW.lead_id; END IF;
        IF TG_TABLE_NAME <> 'lead_notes' AND NEW.workspace IS NULL THEN NEW.workspace:='docmesker'; END IF;
        RETURN NEW; END $$;
      CREATE TRIGGER a_note_scope BEFORE INSERT ON lead_notes FOR EACH ROW EXECUTE FUNCTION private.sync_legacy_workspace();
      SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${alice}',false);`);
    const lead = (
      await db.query<{ id: string }>("SELECT id FROM leads WHERE username='fixture-doc'")
    ).rows[0]!.id;
    // Reproduce the exact missing-record-field failure before the recovery hotfix.
    await assert.rejects(
      db.query("INSERT INTO lead_notes(lead_id,author_id,body) VALUES($1,$2,'broken')", [
        lead,
        alice,
      ]),
      /no field.*workspace/,
    );
    await db.exec("RESET ROLE");
    await db.exec(
      readFileSync(
        "supabase/migrations/20261003220748_repair_legacy_note_workspace_trigger.sql",
        "utf8",
      ),
    );
    await db.exec(
      `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${alice}',false);`,
    );
    assert.equal(
      (await db.query<{ current_user: string }>("SELECT current_user")).rows[0]!.current_user,
      "authenticated",
    );
    await db.exec("BEGIN");
    for (const body of ["first note", "second note"]) {
      await db.query("INSERT INTO lead_notes(lead_id,author_id,body) VALUES($1,$2,$3)", [
        lead,
        alice,
        body,
      ]);
    }
    const notes = (await db.query<{ workspace_id: string }>("SELECT workspace_id FROM lead_notes"))
      .rows;
    assert.equal(notes.length, 2);
    assert.ok(notes.every((note) => note.workspace_id === "00000000-0000-4000-8000-000000000001"));
    await db.query("UPDATE leads SET stage='contacted',owner_id=$1 WHERE id=$2", [alice, lead]);
    assert.equal(
      (await db.query<{ status: string }>("SELECT status FROM leads WHERE id=$1", [lead])).rows[0]!
        .status,
      "contacted",
    );
    await db.exec("ROLLBACK");
    assert.equal((await db.query("SELECT * FROM lead_notes")).rows.length, 0);
    assert.equal(
      (await db.query<{ status: string }>("SELECT status FROM leads WHERE id=$1", [lead])).rows[0]!
        .status,
      "not_contacted",
    );
    await db.exec(
      `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${alice}',false);`,
    );
    assert.equal(
      (await db.query<{ current_user: string }>("SELECT current_user")).rows[0]!.current_user,
      "authenticated",
    );
    await assert.rejects(
      db.query("INSERT INTO lead_notes(lead_id,author_id,body) VALUES($1,$2,'forged author')", [
        lead,
        bob,
      ]),
      /row-level security/,
    );
    assert.equal((await db.query("SELECT * FROM leads")).rows.length, 2);
  } finally {
    await db.close();
  }
});
