# Acceptance evidence

Date: 2026-09-30. Baseline: `a3113ef60d5b0714e339d9a77048ebc4761676b7`. Continuation source: published `4f4d58f` on `codex/creator-partnership-intelligence`; work stayed on that ordinary branch.

## Repository inspection

Read AGENTS.md, all baseline Drizzle migrations, authentication middleware, workspace/CRM data flow, mailbox encryption and services, and Hermes integration. Revalidated broad authenticated-access RLS, fixed workspace enum, browser fetch-all, generated discovery usernames and guessed scores at this HEAD. Those findings were confirmed in code, not accepted merely from a previous audit. Existing Lovable history was preserved; work uses an ordinary local branch.

## Executed checks

- `npm run typecheck`: PASS.
- `npm test`: PASS, 13 tests (10 top-level plus three nested HTTP fixtures), zero skipped/failed. External fetch is prohibited except explicitly mocked DeepSeek and Brave tests. Successful provider results replay without another paid call; an ambiguous timeout remains pending and blocks retry. Unsupported edited outreach is denied approval.
- `npm run build`: PASS with the existing default deployment configuration. This is a build, not a deployment or proof that the target supports the configured PostgreSQL connection.
- Full repository `npm run lint`: PASS with 0 errors, 14 warnings. Existing formatting was corrected without disabling rules. Warnings are React hook dependency and fast-refresh notices.
- `NITRO_PRESET=node-server npm run build`: PASS; local Node server started and returned HTTP 200 for `/` and `/auth`. This is unauthenticated runtime smoke, not staging authentication or production deployment.
- `scripts/real-postgres-fixture.ts`: PASS on PostgreSQL 18 in local WSL. An old-schema database with two leads and a note was backed up with `pg_dump`, restored to a separate database and checked, then migration rollback rehearsal and apply ran through 0012. Separate authenticated synthetic user sessions proved RLS isolation. A non-superuser BYPASSRLS backend role ran the production service. Two separate PostgreSQL connections competed for one budget slot: one succeeded, one was denied; invoice reconciliation was immutable and changed the next budget decision. A bulk export recovered an expired lease, its download token was one-use, and an intervening stage edit was skipped.
- `scripts/real-postgres-scale.ts`: PASS on the same isolated PostgreSQL fixture. Inserted 100,000 synthetic leads in 1,000-row transactions in 23,605 ms; all-matching snapshot took 780 ms; 1,000 worker units processed the export in 53,136 ms; streamed 9,488,960 bytes and exactly 100,001 CSV lines. This measures local server-side work, not 100,000 real discovered creators or browser throughput. A single 100,000-row insertion failed the local server's `max_locks_per_transaction`; the script uses bounded transactions. The WSL server required a persistent process during the test.
- Migration 0012 adds a permitted-content text index and latest-evidence index. The service fixture retrieved a creator through observed teaching content, excluded it from its own similarity results, and denied the same search to a user outside the workspace. No search result was presented as a new or live provider discovery. Migration 0012 passed local PostgreSQL rehearsal but has not been tested on staging.
- `npm audit --omit=dev --json`: zero reported production dependency vulnerabilities at execution time. Full install reports four moderate development dependency findings; no forced breaking upgrades performed.
- Public browser smoke using agent-browser: landing and sign-in rendered, sign-in controls present, browser error report empty. The new public proposal page without a token displays its explicit invalid-link alert after hydration, with no browser errors. No authenticated browser flow claimed.
- `npm run founders`: all three PENDING_PROVISIONING due to missing privileged configuration; no mail sent.
- `npm run benchmark`: see benchmark-result.json for the measured final run. Synthetic fixtures only; not live creators or a production SLO.

## Test traceability

| Requirement                    | Actual evidence                                                                                                                          | Remaining verification                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Tenant isolation               | database.test.ts: private RLS denial, forged scope denied; service.test.ts: unauthorized actor denied                                    | Live API/storage/realtime/export/browser negative matrix                                                                 |
| Invitations                    | Fixture expired/mismatched identity/replay denied, acceptance exposes named team only, revoke removes access                                     | Browser acceptance and live invitation delivery                                                            |
| Founders                       | Verified bootstrap idempotence; forged/unverified metadata denied; protected membership; changed email withdraws privilege               | Three actual verified Auth UUIDs and deployed membership/entitlement report                                              |
| Preserve data                  | Clean and seeded migrations plus local PostgreSQL backup/restore and rollback rehearsal retained lead/note rows and relationship; ambiguous legacy scope isolated | Authorized staging copy and deployed-schema comparison, duplicate/orphan/failure drills |
| Filters                        | Missing/rounded/stale/future/partial/search-only values do not pass; Modash optional fields fail closed                                  | Authorized current observations from real profiles                                                                       |
| No fake discovery              | Old generated discovery page removed; missing server credentials produce setup error; HTTP tests explicitly mocked                       | Live source access/coverage and partial/error payloads                                                                   |
| Usage                          | Cache hit+miss/output math, missing/inconsistent usage pending; encrypted fixture key; immutable tariff-estimate and invoice records; actor attribution | Actual provider invoice matching, shared provider-account caps, varied rates/currencies, ambiguous network outcomes |
| Atomic budgets/jobs            | SQL locked reservation tested through separate local PostgreSQL connections; competing requests one accepted/one denied, duplicate invoice rejected; bulk lease expiry recovered | Paid-request midflight crashes and real provider invoices; staging traffic |
| Grounded outreach              | Exact extractive and generic safe variants; free text edits saved, unsupported wording blocks approval; changed bio invalidates approval/manual record. A pre-copy service call rechecks current team/contact state and blocked an already-contacted fixture lead | Broad semantic claim mapping, authorized live delivery, suppression arriving after copy or during in-flight network call |
| Scale                          | 100,000 synthetic rows and durable all-matching export through local PostgreSQL, with measured snapshot/worker/byte/line counts | Multi-connection authenticated API/browser load and target-host SLOs |
| Product-first / similarity     | Permitted existing observation content search with source URL, qualification and explained matching factors; cross-workspace denial | Live content rights/coverage, semantic relevance sample and new-provider retrieval |
| Preferences/proposals/handoff  | Production service fixture covers explicit feedback, versioned preferences, limited share projection/revocation, agreement-based handoff | Negative-example retrieval learning, live recipient and account revocation browser tests                                 |
| Existing CRM/auth/mail/billing | Typecheck/build, public auth smoke; mailbox ownership/resource checks implemented                                                        | Authenticated end-to-end regression and billing webhooks NOT complete                                                    |

## Benchmark interpretation

The benchmark uses embedded PGlite PostgreSQL on local Windows, no network latency, concurrency one. Batches contain 1,000 synthetic rows and explicitly refresh planner statistics because PGlite has no autovacuum worker. The first single-statement import attempt after adding duplicate protection was stopped when it became slow; a normalized-handle index and bounded/statistics-refreshed import were added before rerunning. Query timings do not prove end-to-end UI response or mass-export performance. The results file records CPU, runtime, timestamps, sample size, p50/p95, bytes and limitations.

## External integration truth

DeepSeek HTTP is fixture-tested; Brave and Modash network retrieval are implemented but not live-tested. Modash's optional field mapping is separately fixture-tested. The public Supabase values already in the repository were preserved; no staging service key, creator staging database URL, or paid-provider credential was supplied. `.env.local` was absent at this check. Docker engine is unavailable, so worker container execution is untested. No migrations applied to a remote database, no purchase, no provider generation charge, no outreach, no live proposal sharing, no deployment. The user has indicated they can configure staging access, but no real staging identity or connection has yet been verified.

## Documentation consulted

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- DeepSeek model registry: https://api-docs.deepseek.com/api/list-models/
- DeepSeek token cache categories: https://api-docs.deepseek.com/guides/kv_cache/
- DeepSeek pricing: https://api-docs.deepseek.com/quick_start/pricing
- Modash Raw API contract: https://docs.modash.io/products/raw_api/openapi_doc/raw/instagram-raw-data

Models and prices are deployment-reviewed configuration, not facts inferred from these references forever. No precision percentage, creator-response rate, revenue or market validation has been fabricated.
