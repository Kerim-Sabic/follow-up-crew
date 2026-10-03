# Recovery lockfile verification

The recovery commit `472dd75` committed a truncated tool transcript as `package-lock.json`. It includes a `Warning: truncated output` prefix and a truncation marker inside the JSON. A clean `npm ci` fails before dependency installation.

Restore the complete valid lock from `4a0c68a`, then reconcile it with the recovered application's package manifest using `npm install --package-lock-only`. This preserves the current exact TanStack versions requested by the manifest. No application, data, access-policy, or deployment changes are included.

Verification in the Windows desktop checkout:

- `npm ci --ignore-scripts`: passed, 456 installed packages. Lifecycle scripts were not executed.
- `npm run typecheck`: passed.
- `npm run build`: passed on retry. The first attempt encountered Windows EPERM replacing the generated route file; route generation then completed and the full client/server build passed.
- `npm run lint`: failed with 1,238 errors and 14 warnings after normalizing local checkout line endings. Existing formatting and ten non-formatting errors remain outside this lockfile change.
- `node --import tsx --test tests/*.test.ts`: two passes, three failures. The retained domain, Modash, and service tests import modules removed by the CRM recovery. They do not constitute authenticated CRM acceptance tests.
- Live landing and sign-in browser smoke: rendered, no reported page errors. Authenticated lead, note, inbox, realtime, repeat and interruption flows were not verified in this task: Opera repeatedly requests authentication; the isolated browser has no existing app login.

The main branch already contains CRM recovery commits `472dd75` and `efca376`. Their earlier acceptance claims are documented separately in `crm-recovery.md`; this report only records checks performed for the lockfile repair. No outreach, billing, credential creation, remote data writes, merge, or production deployment was performed.
