# Acceptance evidence

Date: 2026-09-29. Baseline: `a3113ef60d5b0714e339d9a77048ebc4761676b7`.

## Repository inspection

Read AGENTS.md, all baseline Drizzle migrations, authentication middleware, workspace/CRM data flow, mailbox encryption and services, and Hermes integration. Revalidated broad authenticated-access RLS, fixed workspace enum, browser fetch-all, generated discovery usernames and guessed scores at this HEAD. Those findings were confirmed in code, not accepted merely from a previous audit. Existing Lovable history was preserved; work uses an ordinary local branch.

## Executed checks

- `npm run typecheck`: PASS.
- `npm test`: PASS, 9 tests (8 top-level plus one nested HTTP test), zero skipped/failed. Tests prohibit external fetch except the explicitly mocked DeepSeek test.
- `npm run build`: PASS with the existing default deployment configuration. This is a build, not a deployment or proof that the target supports the configured PostgreSQL connection.
- ESLint on newly added TypeScript/TSX files: PASS. Full repository lint: FAIL, 8,899 problems (8,884 errors, 15 warnings), compared with baseline 11,299 problems (11,285 errors, 14 warnings). No lint rule was disabled. Most failures are inherited formatting; full lint is not a passing release gate.
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
| Preserve data                  | Clean and seeded legacy migrations; retained lead/note rows and relationship; ambiguous legacy scope isolated                            | Production-shaped backup restoration, duplicate/orphan/failure drills, actual counts                                     |
| Filters                        | Missing/rounded/stale/future/partial/search-only values do not pass; Modash optional fields fail closed                                  | Authorized current observations from real profiles                                                                       |
| No fake discovery              | Old generated discovery page removed; missing server credentials produce setup error; HTTP tests explicitly mocked                       | Live source access/coverage and partial/error payloads                                                                   |
| Usage                          | Cache hit+miss/output math, missing/inconsistent usage pending; encrypted fixture key; actual service settlement/attribution             | Provider invoice matching, varied rates/currencies, ambiguous network outcomes                                           |
| Atomic budgets/jobs            | SQL locked reservation; sequential overspend and duplicate denied; completed job redelivery does not duplicate                           | PGlite socket is single-session: true concurrent PostgreSQL races, mid-request crash, pause/revoke under load NOT proven |
| Grounded outreach              | Exact extractive-template checker rejects fabricated additions and injection; changed bio invalidates approval/manual record             | Freeform claim checker, authorized live delivery, suppression arriving during in-flight network call                     |
| Scale                          | 100,000 synthetic inserts; bounded page/filter timings, bytes and row counts                                                             | Concurrent backend/browser load, durable bulk jobs and full-workspace exports                                            |
| Preferences/proposals/handoff  | Production service fixture covers explicit feedback, versioned preferences, limited share projection/revocation, agreement-based handoff | Negative-example retrieval learning, live recipient and account revocation browser tests                                 |
| Existing CRM/auth/mail/billing | Typecheck/build, public auth smoke; mailbox ownership/resource checks implemented                                                        | Authenticated end-to-end regression and billing webhooks NOT complete                                                    |

## Benchmark interpretation

The benchmark uses embedded PGlite PostgreSQL on local Windows, no network latency, concurrency one. Batches contain 1,000 synthetic rows and explicitly refresh planner statistics because PGlite has no autovacuum worker. The first single-statement import attempt after adding duplicate protection was stopped when it became slow; a normalized-handle index and bounded/statistics-refreshed import were added before rerunning. Query timings do not prove end-to-end UI response or mass-export performance. The results file records CPU, runtime, timestamps, sample size, p50/p95, bytes and limitations.

## External integration truth

DeepSeek HTTP is fixture-tested; Brave and Modash network retrieval are implemented but not live-tested. Modash's optional field mapping is separately fixture-tested. The public Supabase values already in the repository were preserved; no service key, creator database URL, or paid-provider credential was supplied. Docker engine is unavailable, so worker container execution is untested. No migrations applied to a remote database, no purchase, no provider generation charge, no outreach, no live proposal sharing, no deployment.

## Documentation consulted

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- DeepSeek model registry: https://api-docs.deepseek.com/api/list-models/
- DeepSeek token cache categories: https://api-docs.deepseek.com/guides/kv_cache/
- DeepSeek pricing: https://api-docs.deepseek.com/quick_start/pricing
- Modash Raw API contract: https://docs.modash.io/products/raw_api/openapi_doc/raw/instagram-raw-data

Models and prices are deployment-reviewed configuration, not facts inferred from these references forever. No precision percentage, creator-response rate, revenue or market validation has been fabricated.
