# CRM recovery follow-up verification

The recovery commit `472dd75` committed a truncated tool transcript as `package-lock.json`. It includes a `Warning: truncated output` prefix and a truncation marker inside the JSON. A clean `npm ci` fails before dependency installation.

Restore the complete valid lock from `4a0c68a`, then reconcile it with the recovered application's package manifest using `npm install --package-lock-only`. This preserves the current exact TanStack versions requested by the manifest.

Follow-up triage found retained-workflow bugs: cached lead/mailbox data and open CRM state could survive an account change; a late initial-session result could reverse logout; outgoing mail accepted header control characters; and an HTML MIME part could shadow a later plain-text alternative. The repair clears caches on identity changes, remounts workspace state per user, ignores stale/disposed session completions, rejects header injection, and parses only plain-text MIME parts with snippet fallback. Each realtime subscription has a distinct channel name so pending cleanup cannot unsubscribe a remounted CRM. Gmail helpers now use explicit response types. No live mail is sent in testing.

Verification in the Windows desktop checkout:

- `npm ci --ignore-scripts`: passed, 456 installed packages. Lifecycle scripts were not executed.
- `npm run typecheck`: passed after the follow-up changes.
- `npm run build`: passed after the follow-up changes. The first lockfile-only attempt encountered Windows EPERM replacing the generated route file; route generation then completed and subsequent full client/server builds passed.
- `npm test`: eight CRM regression tests passed, zero skipped. Covers cache/account/logout races, late query completion, header injection, Unicode/reply MIME, multipart parsing, and a synthetic PGlite CRM fixture. The fixture reproduces the old note-trigger failure, applies the committed hotfix, verifies note/stage writes and rollback, and checks authenticated note-author restrictions.
- `npm run test:creator-migrations`: two retained migration fixture tests passed. These exercise the proposed complete creator schema, not the live partially upgraded database.
- Full lint: failed with 1,157 errors and 14 warnings, down from 1,238 errors. There are 1,156 pre-existing formatting findings and one pre-existing `prefer-const` finding in automatically generated preview auth storage. Focused auth/mail/lead-module and new-test lint has zero errors and one existing fast-refresh warning. The AppShell change is limited to a user identity key; its inherited formatting remains counted in full lint.
- The original domain, Modash and service tests imported removed modules and failed to load. Their source and fixtures are preserved under `tests/creator-archive` with original import targets maintained. They are explicitly inactive and have no passing acceptance claim; no creator feature is restored.
- Live landing/sign-in and logged-out lead-route redirect smoke passed before follow-up. The updated local sign-in page renders and reloads without reported page errors. Authenticated lead, note, inbox and realtime browser flows remain unverified: Opera requested authentication repeatedly, and the isolated browser has no existing app login. No further Opera authentication attempt was made during follow-up.

The main branch already contains CRM recovery commits `472dd75` and `efca376`. Their earlier acceptance claims are documented separately in `crm-recovery.md`; this report records this repair's independent checks. No outreach, billing, credential creation, remote data writes, access-policy changes, merge, or production deployment was performed.
