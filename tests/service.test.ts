import { test } from "node:test";
import assert from "node:assert/strict";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { database } from "./database-fixture";
import {
  executeCommand,
  runWorkerUnit,
  readSharedProposal,
} from "../src/server/creator-service.server";
import { creatorDb, withWorkspace } from "../src/server/creator-db.server";
import { spec, observed } from "./domain-fixture";
import type { Observation } from "../src/lib/mission-domain";

test("complete imported mission through production services, durable worker, approval, changed evidence, budget attempts and tenant denial", async (t) => {
  const db = await database(true);
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1", maxConnections: 1 });
  await server.start();
  process.env["CREATOR_DATABASE_URL"] =
    "postgresql://postgres:postgres@" + server.getServerConn() + "/postgres";
  const actor = "10000000-0000-4000-8000-000000000001",
    w = "00000000-0000-4000-8000-000000000001";
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("External calls forbidden in fixture tests");
  };
  try {
    await executeCommand(actor, {
      action: "limits",
      workspace: w,
      daily: 1000,
      monthly: 2000,
      enabled: true,
    });
    const now = new Date().toISOString();
    const o = { ...observed, observedAt: now, lastPostAt: now };
    const fields = Object.keys(o).filter((k) => k !== "method");
    const csv =
      fields.join(",") +
      "\n" +
      fields
        .map((k) => '"' + String(o[k as keyof Observation]).replaceAll('"', '""') + '"')
        .join(",");
    const created = (await executeCommand(actor, {
      action: "createMission",
      workspace: w,
      spec: { ...spec, budgetNanos: 1000 },
      csv,
      useAi: false,
    })) as { id: string; hash: string };
    await assert.rejects(
      executeCommand("10000000-0000-4000-8000-000000000002", { action: "overview", workspace: w }),
    );
    await assert.rejects(
      executeCommand(actor, {
        action: "approveMission",
        workspace: w,
        id: created.id,
        hash: "0".repeat(64),
      }),
    );
    await executeCommand(actor, {
      action: "approveMission",
      workspace: w,
      id: created.id,
      hash: created.hash,
    });
    assert.equal(await runWorkerUnit(), true);
    const view = (await executeCommand(actor, { action: "overview", workspace: w })) as {
      missions: { state: string; checkpoint: number }[];
      drafts: { id: string; state: string; body: string; lead_id: string }[];
    };
    assert.equal(view.missions[0]?.state, "completed");
    assert.equal(view.missions[0]?.checkpoint, 1);
    assert.equal(view.drafts.length, 1);
    const draft = view.drafts[0]!;
    await executeCommand(actor, {
      action: "feedback",
      workspace: w,
      leadId: draft.lead_id,
      decision: "strong_fit",
      reason: "FIXTURE teaching skill fits",
    });
    await executeCommand(actor, {
      action: "preferences",
      workspace: w,
      topics: ["knife skills"],
      reason: "FIXTURE adopted topic",
    });
    const privateProposal = (await executeCommand(actor, {
      action: "saveProposal",
      workspace: w,
      leadId: draft.lead_id,
      title: "FIXTURE concept",
      content: "FIXTURE approved proposal only",
    })) as { id: string };
    const shared = (await executeCommand(actor, {
      action: "shareProposal",
      workspace: w,
      id: privateProposal.id,
      days: 1,
    })) as { token: string };
    assert.deepEqual(await readSharedProposal(shared.token), {
      title: "FIXTURE concept",
      content: "FIXTURE approved proposal only",
    });
    await assert.rejects(readSharedProposal("0".repeat(64)));
    await executeCommand(actor, { action: "revokeProposal", workspace: w, id: privateProposal.id });
    await assert.rejects(readSharedProposal(shared.token));
    await executeCommand(actor, {
      action: "handoff",
      workspace: w,
      leadId: draft.lead_id,
      scope: "FIXTURE agreed validation workshop",
      agreementReference: "FIXTURE agreement record",
      validationTask: "FIXTURE interview five learners",
      agreedTerms: "FIXTURE no actual agreement",
    });
    await executeCommand(actor, {
      action: "review",
      workspace: w,
      id: draft.id,
      decision: "approve",
    });
    // New comparable observation invalidates existing approved claim/draft.
    await executeCommand(actor, {
      action: "recheck",
      workspace: w,
      leadId: draft.lead_id,
      missionId: created.id,
      observation: { ...o, bioLinks: "PRESENT" },
    });
    await assert.rejects(
      executeCommand(actor, {
        action: "review",
        workspace: w,
        id: draft.id,
        decision: "record_manual",
      }),
    );
    assert.equal(await runWorkerUnit(), false, "completed mission never replays");
    const reserve = (key: string, amount: number) =>
      withWorkspace(actor, w, true, async (sql) => {
        await sql`insert into private.provider_connections(workspace,provider,ciphertext,fingerprint,configuration,rights_confirmed) values(${w},'brave','fixture ciphertext never used for a request','fixture-fingerprint','{}',true) on conflict do nothing`;
        await sql`update public.missions set state='queued',provider_bindings='{"brave":{"fingerprint":"fixture-fingerprint","configuration":{},"rights":true}}' where workspace=${w} and id=${created.id}`;
        return sql`select private.reserve_attempt(${w},${created.id},${key},'brave','fixture',${amount}::bigint,null,'fixture-price')`;
      });
    await reserve("settlement-pending", 700);
    await assert.rejects(reserve("overspend", 700));
    await assert.rejects(reserve("settlement-pending", 700));
    const usage = (await executeCommand(actor, { action: "overview", workspace: w })) as {
      usage: { pending_nanos: string }[];
    };
    assert.equal(usage.usage[0]?.pending_nanos, "700", "ambiguous outcomes retain exposure");
    await t.test(
      "DeepSeek HTTP fixture: encrypted key, discovered model, bound funding and attributed measured usage",
      async () => {
        process.env["CREATOR_PROVIDER_KEY_SECRET"] = Buffer.alloc(32, 17).toString("base64");
        let calls = 0;
        globalThis.fetch = async (input, init) => {
          const url = String(input);
          assert.equal(
            new Headers(init?.headers).get("Authorization"),
            "Bearer FIXTURE_SECRET_NOT_LIVE",
          );
          if (url === "https://api.deepseek.com/models")
            return new Response(JSON.stringify({ data: [{ id: "fixture-model" }] }));
          assert.equal(url, "https://api.deepseek.com/chat/completions");
          calls++;
          return new Response(
            JSON.stringify({
              model: "fixture-model",
              usage: {
                prompt_tokens: 1000,
                prompt_cache_hit_tokens: 400,
                prompt_cache_miss_tokens: 600,
                completion_tokens: 100,
              },
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      concept: "FIXTURE workshop hypothesis",
                      validation: "FIXTURE interview learners",
                      risk: "FIXTURE demand unknown",
                    }),
                  },
                },
              ],
            }),
          );
        };
        await executeCommand(actor, {
          action: "limits",
          workspace: w,
          daily: 2_000_000_000,
          monthly: 5_000_000_000,
          enabled: true,
        });
        const pricing = {
          version: "fixture-price-v1",
          model: "fixture-model",
          effectiveAt: new Date(Date.now() - 86_400_000).toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          sourceUrl: "https://example.test/fixture-prices",
          hitNanosPerMillion: "100000000",
          missNanosPerMillion: "500000000",
          outputNanosPerMillion: "1000000000",
        };
        await executeCommand(actor, {
          action: "saveProvider",
          workspace: w,
          provider: "deepseek",
          key: "FIXTURE_SECRET_NOT_LIVE",
          configuration: { pricing },
          rights: true,
        });
        await executeCommand(actor, { action: "testDeepSeek", workspace: w });
        const encrypted = await withWorkspace(
          actor,
          w,
          false,
          async (sql) =>
            (
              await sql`select ciphertext from private.provider_connections where workspace=${w} and provider='deepseek'`
            )[0]!["ciphertext"],
        );
        assert.equal(String(encrypted).includes("FIXTURE_SECRET_NOT_LIVE"), false);
        const aiMission = (await executeCommand(actor, {
          action: "createMission",
          workspace: w,
          spec: { ...spec, budgetNanos: 1_000_000_000 },
          csv: csv.replaceAll("fixture_creator", "fixture_ai_creator"),
          useAi: true,
        })) as { id: string; hash: string };
        // Clear the earlier deliberately queued budget fixture before running this mission.
        await withWorkspace(actor, w, true, async (sql) => {
          await sql`update public.missions set state='completed' where workspace=${w} and id=${created.id}`;
        });
        await executeCommand(actor, {
          action: "approveMission",
          workspace: w,
          id: aiMission.id,
          hash: aiMission.hash,
        });
        await runWorkerUnit();
        assert.equal(calls, 1);
        const result = (await executeCommand(actor, { action: "overview", workspace: w })) as {
          usage: {
            actor: string;
            provider: string;
            settled_nanos: string;
            pending_nanos: string;
          }[];
        };
        const aiUsage = result.usage.find((u) => u.provider === "deepseek");
        assert.equal(aiUsage?.settled_nanos, "440000");
        assert.equal(aiUsage?.pending_nanos, "0");
        assert.equal(aiUsage?.actor, actor);
        await runWorkerUnit();
        assert.equal(calls, 1, "completed worker cannot rebill generation");
      },
    );
  } finally {
    globalThis.fetch = priorFetch;
    await creatorDb().end({ timeout: 1 });
    await server.stop();
    await db.close();
  }
});
