# Inactive creator application tests

The CRM recovery intentionally removed the mission/domain, Modash, and creator-service modules. Their tests and fixtures are retained here rather than deleted or silently marked passed. They can run again if that application is restored from Git history. Relative imports retain their original targets.

`npm test` runs the recovered CRM's offline regression coverage. `npm run test:creator-migrations` separately runs the existing `tests/database.test.ts` and its unchanged fixture at their original paths; these exercise the proposed complete creator schema, not the partially upgraded live database. Domain/Modash/service acceptance remains inactive and has no passing claim in this repair.
