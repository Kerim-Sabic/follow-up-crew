import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/react-query";
import { createSessionHandler } from "../src/lib/auth-session";

const session = (id: string) => ({ user: { id } });

test("logout and account changes remove cached leads, notes and mailboxes; token refresh retains them", () => {
  const client = new QueryClient();
  const applied: (string | null)[] = [];
  const handler = createSessionHandler(client, (value) => applied.push(value?.user.id ?? null));
  handler.onAuthEvent(session("alice"));
  for (const key of ["leads", "lead-notes", "mailboxes"]) client.setQueryData([key], ["private"]);
  handler.onAuthEvent(session("alice"));
  assert.equal(client.getQueryCache().getAll().length, 3);
  handler.onAuthEvent(session("bob"));
  assert.equal(client.getQueryCache().getAll().length, 0);
  client.setQueryData(["mailboxes"], ["bob-mailbox"]);
  handler.onAuthEvent(null);
  assert.equal(client.getQueryCache().getAll().length, 0);
  handler.onAuthEvent(null);
  assert.deepEqual(applied, ["alice", "alice", "bob", null, null]);
  client.clear();
});

test("a stale initial session cannot resurrect a signed-out identity", async () => {
  const client = new QueryClient();
  const applied: (string | null)[] = [];
  const handler = createSessionHandler(client, (value) => applied.push(value?.user.id ?? null));
  let resolve!: (value: ReturnType<typeof session>) => void;
  const initial = new Promise<ReturnType<typeof session>>((done) => {
    resolve = done;
  });
  const hydration = handler.hydrate(initial);
  handler.onAuthEvent(null);
  resolve(session("alice"));
  await hydration;
  assert.deepEqual(applied, [null]);
  client.clear();
});

test("logout cancels an in-flight query even when its result arrives later", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const handler = createSessionHandler(client, () => {});
  handler.onAuthEvent(session("alice"));
  let resolve!: (value: string[]) => void;
  const result = new Promise<string[]>((done) => {
    resolve = done;
  });
  const fetch = client.fetchQuery({ queryKey: ["leads"], queryFn: () => result }).catch(() => null);
  handler.onAuthEvent(null);
  resolve(["alice-private-lead"]);
  await fetch;
  assert.equal(client.getQueryData(["leads"]), undefined);
  client.clear();
});

test("failed initial session finishes loading; disposed handlers ignore late completion", async () => {
  const client = new QueryClient();
  const applied: (string | null)[] = [];
  const handler = createSessionHandler(client, (value) => applied.push(value?.user.id ?? null));
  await handler.hydrate(Promise.reject(new Error("offline")));
  assert.deepEqual(applied, [null]);
  handler.dispose();
  await handler.hydrate(Promise.resolve(session("alice")));
  handler.onAuthEvent(session("bob"));
  assert.deepEqual(applied, [null]);
  client.clear();
});
