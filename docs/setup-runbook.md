# Setup and release runbook

This branch changes the existing follow-up-crew application and database. It is not safe to deploy its new UI against an unmigrated database. Nothing in this runbook authorizes paid calls, production migration, external invitations, outreach or proposal publication.

## Local development

Use Node 22.18 or newer compatible Node 22. From the repository root run `npm ci`, `npm test`, `npm run typecheck`, then `npm run dev`. Existing public Supabase values are in the tracked `.env`; **never place privileged credentials there**. Put secrets in ignored `.env.local` locally and the deployment's secret manager remotely. `.env.example` lists the names. Do not commit a copy containing real values.

The public sign-in page can run without the creator backend. The authenticated mission UI requires the migrated Supabase project, `CREATOR_DATABASE_URL` and a valid verified account. A missing connection is an explicit setup error; it does not create demonstration leads.

## Migration before deployment

1. Obtain explicit authorization for the intended database; take a restorable backup. Record per-workspace lead/note/mail counts, primary IDs, relationships and memberships. Restore a copy into **staging**. Compare its actual schema to migrations 0000–0004; do not infer deployed state from the repository.
2. Point server-only `CREATOR_DATABASE_URL` at the staging copy. Use `npm run db:migrate -- --adopt-legacy-baseline` only after validating that baseline. This defaults to a transaction that reconciles counts and then rolls back. A clean Supabase database omits the adoption flag. Plain PostgreSQL needs Supabase auth roles/schema/publication; the test harness is not a production bootstrap.
3. Inspect the reconciliation report and quarantined legacy mapping. Migration 0005 preserves IDs and renames the legacy workspace column; DocMesKer retains its company records, ambiguous Justin records move to a restricted review workspace. Do not expose or merge that review workspace until ownership is explicitly established.
4. After the staging rehearsal and approval, apply with `npm run db:migrate -- --adopt-legacy-baseline --apply --approved-remote`. The explicit remote flag is a technical guard, not a substitute for authorization. This runner owns its hash journal in `private.creator_migrations`; do not also replay these custom migrations through another tool. Do not run schema push from the empty generated Drizzle schema.
5. Run two-user, invited-user, revoked-user, viewer and founder tests through actual Supabase Auth/API/Realtime. Verify legacy CRM/mail/stages and restore rehearsal. Only then schedule a separately authorized production maintenance window and deploy the matching app/worker together.

Rollback before commit is transactional. After a production commit, restore the verified backup or implement a reviewed forward repair; **do not** drop new tables or reverse workspace mappings blindly. The migration locks and backfills existing tables and therefore needs an appropriate maintenance window. The real lock duration and disk needs are not yet measured.

## Runtime database trust boundary

The browser uses Supabase RLS. New server commands authenticate the Supabase user, then `withWorkspace` rechecks verified membership for every command and worker unit. All resource queries are scoped to that workspace. New evidence/ledger tables are SELECT-only for ordinary authenticated database clients; writes go through the server.

The server SQL identity currently needs permission to write these internal tables despite their client policies (a controlled table-owner/BYPASSRLS backend identity), access the private provider/outbox/share tables/functions and read relevant Auth identity fields. It must never be exposed to a browser. Provision a dedicated deployment role with reviewed minimal object grants and restricted network access; that role's grant matrix and connection behavior must be staging-tested before release. Do not treat successful tests using a fixture superuser as proof of production role setup.

## Founders and recovery

Run `npm run founders` with `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY`. This is read-only by default. Verify the actual UUID and verified email for each of kerim.sabic@gmail.com, mehmed.barlov@gmail.com and amrudin.naser@gmail.com. After migration, `npm run founders -- --reconcile` runs idempotent bootstrap. Confirm membership and developer entitlement in Mission Control → Setup. Missing users remain pending; send invitations only after explicit authorization using `--send-invitations`.

Kerim is the initial DocMesKer owner; the other two founders are admins. All three receive protected membership and developer entitlement. Routine member management cannot remove them. If a real founder identity must be replaced, first verify the replacement through a separate authorized recovery process. An operator can create a short-lived one-use `private.membership_recovery_grants` record with reason and authorizer, then perform the approved membership repair in a transaction. This bypass is not available through a public RPC; it is audited. No general account-erasure/recovery service is implemented. Export/retention and ownership succession must be handled before account deletion; do not casually delete Auth users.

## Sources, keys and prices

Set `CREATOR_PROVIDER_KEY_SECRET` to a securely generated base64 32-byte key, shared only by web backend and worker. It encrypts provider keys with AES-256-GCM and workspace/provider associated data. Losing this key makes stored credentials unreadable; rotation requires a planned re-encryption operation (not yet implemented).

An admin uses Mission Control → Setup to save the credential, explicitly confirm commercial rights, discover DeepSeek models, and enter human-readable USD rates and dated source links in structured forms. Saving a key is not a paid connectivity check. DeepSeek's model-list action calls `/models`; generation is separately approved within a mission. Credentials stay in the server request and encrypted connection store, never browser storage. Use a secure key source or secret manager; do not paste credentials into chat.

- DeepSeek pricing needs a version/date, discovered model, effective/expiry dates, current cache-hit/cache-miss/output USD rates per million tokens, and a source URL. The UI converts USD to exact nano-USD internally. Expired or undiscovered models block generation. Automatic pricing refresh and account balance display are not implemented; account balance is never used as attributed usage history.
- Brave needs a per-request USD ceiling, rights confirmation, and optionally a dated documented tariff for estimates. Its results discover URLs only. Search access does not grant rights to fetch or reuse underlying Instagram content. No arbitrary URL fetcher is implemented.
- Modash needs a per-request USD ceiling, confirmed **Raw API** access, actual link-field coverage review and rights confirmation. A dated documented tariff is optional. Discovery access alone is insufficient. Optional/missing bio-link fields do not prove no links. Language/adult/teaching fit remain unresolved until genuine reviewed observations supply them.

Provider responses are untrusted, size/time bounded, and requested only at fixed HTTPS endpoints. Redirects are rejected. Keys and response bodies are not printed in errors. Provider usage is reserved before network calls; unknown billing remains pending rather than becoming zero. Successful Brave/Modash calls are marked as tariff-derived estimates only when a current documented tariff is configured; otherwise exposure remains unresolved. An admin can record an actual invoice amount and reference once through Usage, creating an immutable reconciliation event that governs future budget decisions. A tariff estimate is never described as provider-reported usage or an actual invoice. Do not edit usage rows to regain budget or blindly retry an ambiguous attempt.

Migration 0011 stores a successful Brave/Modash or DeepSeek result in a private immutable replay record in the same database transaction as its usage update. A worker restart can reuse that result without another paid call. A request with no saved result remains ambiguous and blocks automatic retry even after a timeout. Review the provider invoice and resolve the attempt explicitly; do not infer zero cost from missing output. This covers the post-response persistence gap, while actual provider idempotency headers and live failure modes still require validation.

## Run one mission

1. Start `npm run worker` beside the web service using the same private server configuration. `Dockerfile.worker` and `compose.worker.yaml` are supplied for a separate long-running Node worker; Docker execution has not been tested here. Lovable/Cloudflare's default build passes, but actual PostgreSQL connectivity/runtime support must be validated. A Node deployment can use `NITRO_PRESET=node-server`; the existing default is not silently replaced.
2. In Usage, an admin sets daily/monthly budgets and enables research. Founder exemption never overrides those limits.
3. In Find creators, enter the objective and inspect the conservative follower/language/no-link/budget suggestions. Apply them explicitly to editable hard fields, correcting anything the parser missed. Choose CSV human observations, Brave or reviewed Modash. Review the documented minimum and maximum reservation exposure; unknown tariffs remain labelled unknown and the mission hard cap may stop a full plan early. Review the contract and approve its hash. Provider settings are bound to that approval; changed keys/rates require a newly approved plan.
4. The worker checks exclusions and decisive fields before optional expensive analysis. Current jobs are deliberately bounded (up to 200 candidates, 20 research selections, five drafts), not a 100,000-profile research blast. Missing fields appear for human evidence review. Enter actual observation dates and source URLs; never use fixture observations as real creators.
5. Review the next ten draft opportunities, evidence and unresolved concerns. Edit a draft freely; the current deterministic checker permits approval only for its exact sourced-excerpt or generic truthful form. Unsupported edits can be saved for revision but cannot be approved. Draft approval alone sends nothing. Copying an approved draft calls the server again to check current evidence, suppression, assignment and existing team contact. A teammate could still act outside the app after copy, so recheck before manual sending. Recording actual manual outreach is separate from approval. No unrestricted Instagram cold-DM API exists in this implementation.

The product-first search and "Find more like this" use permitted content already recorded in the current workspace. They show sources and qualification states and do not issue a new provider call or claim product demand. A long concept that has no overlapping observed content may return no matches; narrow the terms or run a separately approved discovery mission. Migration 0012 supplies its text-search indexes.

## Role matrix

| Operation                                            | Viewer | Member | Admin | Owner |
| ---------------------------------------------------- | ------ | ------ | ----- | ----- |
| Read authorized workspace leads/evidence             | yes    | yes    | yes   | yes   |
| Read own connected mailbox messages                  | yes    | yes    | yes   | yes   |
| Mutate leads, research, review, private proposals    | no     | yes    | yes   | yes   |
| Keys, spending settings, share proposal, invitations | no     | no     | yes   | yes   |
| Change/remove existing members                       | no     | no     | no    | yes   |
| Remove protected founders / final owner routinely    | no     | no     | no    | no    |

Private mailbox credentials and message bodies remain owner-scoped even in a shared company workspace. Assignment is coordination metadata, not an extra lead visibility boundary. Cross-workspace move/copy is not implemented. Proposal links are a separate deliberately limited bearer projection; the user must explicitly create the share and can revoke it. Do not create a real share merely to test the UI.

## Sending and release blockers

Email defaults off through `CREATOR_OUTREACH_ENABLED=false` and `workspaces.sending_enabled=false`. No UI silently turns either on. Before a separately authorized operator enables sending, complete mailbox/authorization/outbox regression and test ambiguous delivery, suppression, revocation, duplicate collision and replies. The outbox preserves pending attempts; there is no blind automatic retry. Suppression that arrives after a network send begins cannot recall that send.

The Leads page now supports all-matching background stage changes and exports. Selection on the visible page remains page-scoped; all-matching jobs snapshot IDs at creation, skip records changed before a stage action, and stream finished CSV through short-lived one-use downloads. Local PostgreSQL processed 100,000 synthetic rows; authenticated staging browser traffic still needs testing. Remaining product work is enumerated in implementation-status.md: adaptive search/scouts, comprehensive next actions, billing, outcome quality evaluation and operational hardening. Availability of credentials would unblock live testing but would not complete those missing features.
