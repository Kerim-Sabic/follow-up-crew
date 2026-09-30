import { PGlite } from "@electric-sql/pglite";
import { test } from "node:test";
import assert from "node:assert/strict";

import { database } from "./database-fixture";
async function actor(db: PGlite, id: string) {
  await db.exec(
    `RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
test("real PostgreSQL fixture: legacy preservation, RLS, verified founders, invites and revocation", async () => {
  const db = await database(true);
  const founder = "10000000-0000-4000-8000-000000000001",
    user = "10000000-0000-4000-8000-000000000002";
  try {
    assert.equal((await db.query("SELECT * FROM leads")).rows.length, 2);
    assert.equal(
      (await db.query("SELECT body FROM lead_notes")).rows[0]?.["body"],
      "fixture retained note",
    );
    await db.exec(
      `SELECT private.bootstrap_user('${founder}'); SELECT private.bootstrap_user('${founder}');`,
    );
    assert.equal(
      (await db.query(`SELECT * FROM workspace_members WHERE user_id='${founder}'`)).rows.length,
      2,
    );
    await actor(db, user);
    assert.equal((await db.query("SELECT * FROM leads")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM lead_notes")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM developer_entitlements")).rows.length, 0);
    const own = (await db.query<{ id: string }>("SELECT id FROM workspaces")).rows[0]!.id;
    await db.query("INSERT INTO leads(username,workspace_id) VALUES($1,$2)", [
      "fixture_private",
      own,
    ]);
    await assert.rejects(
      db.query("INSERT INTO leads(username,workspace_id) VALUES($1,$2)", ["@FIXTURE_PRIVATE", own]),
      /already exists/,
    );
    await assert.rejects(
      db.exec(
        `INSERT INTO leads(username,workspace_id) VALUES('forged','00000000-0000-4000-8000-000000000001')`,
      ),
    );
    await actor(db, founder);
    assert.equal((await db.query("SELECT * FROM leads")).rows.length, 1);
    assert.equal((await db.query("SELECT * FROM developer_entitlements")).rows.length, 1);
    await assert.rejects(
      db.exec(
        `SELECT public.manage_workspace_member('00000000-0000-4000-8000-000000000001','${founder}',null)`,
      ),
    );
    const hash = "a".repeat(64);
    const expiredHash = "b".repeat(64);
    await db.query(
      `SELECT public.create_workspace_invitation('00000000-0000-4000-8000-000000000001','ordinary@example.test','member',$1)`,
      [expiredHash],
    );
    await db.exec("RESET ROLE");
    await db.query(
      "UPDATE workspace_invitations SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [expiredHash],
    );
    await actor(db, user);
    await assert.rejects(db.query("SELECT public.accept_workspace_invitation($1)", [expiredHash]));
    await actor(db, founder);
    await db.query(
      `SELECT public.create_workspace_invitation('00000000-0000-4000-8000-000000000001','ordinary@example.test','member',$1)`,
      [hash],
    );
    await assert.rejects(db.query("SELECT public.accept_workspace_invitation($1)", [hash]));
    await actor(db, user);
    await db.query("SELECT public.accept_workspace_invitation($1)", [hash]);
    await assert.rejects(db.query("SELECT public.accept_workspace_invitation($1)", [hash]));
    assert.equal((await db.query("SELECT * FROM leads")).rows.length, 2);
    await actor(db, founder);
    assert.equal(
      (await db.query("SELECT * FROM leads")).rows.length,
      1,
      "invite never shares personal leads",
    );
    await db.exec(
      `SELECT public.manage_workspace_member('00000000-0000-4000-8000-000000000001','${user}',null)`,
    );
    await actor(db, user);
    assert.equal((await db.query("SELECT * FROM leads")).rows.length, 1);
    await db.exec("RESET ROLE");
    await db.exec(`UPDATE auth.users SET email='changed@example.test' WHERE id='${founder}'`);
    await actor(db, founder);
    assert.equal((await db.query("SELECT * FROM developer_entitlements")).rows.length, 0);
    assert.equal(
      (await db.query("SELECT * FROM leads")).rows.length,
      0,
      "email change withdraws founder access",
    );
  } finally {
    await db.close();
  }
});
test("clean database migrates and unverified founder strings do not grant membership", async () => {
  const db = await database();
  try {
    await db.exec(
      `INSERT INTO auth.users VALUES('10000000-0000-4000-8000-000000000003','mehmed.barlov@gmail.com',null,'{"isAdmin":true}');`,
    );
    assert.equal((await db.query("SELECT * FROM workspace_members")).rows.length, 0);
    await db.exec(
      `UPDATE auth.users SET email_confirmed_at=now() WHERE id='10000000-0000-4000-8000-000000000003'`,
    );
    assert.equal((await db.query("SELECT * FROM workspace_members")).rows.length, 2);
  } finally {
    await db.close();
  }
});
