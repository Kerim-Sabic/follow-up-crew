import { database } from "../tests/database-fixture";
import { performance } from "node:perf_hooks";
import { platform, arch, cpus } from "node:os";
import { writeFileSync } from "node:fs";
const db = await database(true);
const w = "00000000-0000-4000-8000-000000000001";
try {
  const seedStart = performance.now();
  // PGlite has no autovacuum worker. Refresh statistics between bounded import batches.
  for (let start = 1; start <= 100000; start += 1000) {
    await db.exec(
      `INSERT INTO leads(workspace,username,email,number) SELECT '${w}', 'SYNTHETIC_CAPACITY_'||i, CASE WHEN i%2=0 THEN 'fixture'||i||'@example.test' ELSE NULL END,i FROM generate_series(${start},${start + 999}) i; ANALYZE leads;`,
    );
  }
  const seedMs = performance.now() - seedStart;
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);`,
  );
  const times: number[] = [];
  let cursor: string | null = null;
  let maximumRows = 0;
  let maximumBytes = 0;
  for (let i = 0; i < 40; i++) {
    const t = performance.now();
    const result = await db.query<{ id: string }>(
      "SELECT * FROM public.lead_page($1,$2,$3,$4,$5,$6,101)",
      [w, i % 2 ? "synthetic_capacity_" : "", "", "", i % 3 ? "yes" : "", cursor],
    );
    times.push(performance.now() - t);
    maximumRows = Math.max(maximumRows, result.rows.length);
    maximumBytes = Math.max(maximumBytes, Buffer.byteLength(JSON.stringify(result.rows)));
    cursor = result.rows.at(99)?.id ?? null;
  }
  const sorted = [...times].sort((a, b) => a - b);
  const result = {
    label: "SYNTHETIC FIXTURE ONLY — not real creators",
    timestamp: new Date().toISOString(),
    environment: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      node: process.version,
      database: "PGlite embedded PostgreSQL; single session, no network latency",
    },
    syntheticRows: 100000,
    seedMs,
    queries: times.length,
    concurrency: 1,
    p50Ms: sorted[Math.floor(sorted.length * 0.5)],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    maximumRows,
    maximumBytes,
    limits:
      "Only keyset pagination and filters measured. Durable bulk/export and true concurrent PostgreSQL benchmark remain untested.",
  };
  writeFileSync("docs/benchmark-result.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} finally {
  await db.close();
}
