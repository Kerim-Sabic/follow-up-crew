# CRM recovery — 2026-10-04

At the owner's request, restore the last working shared CRM from a3113ef in a new commit. The newer creator/mission application depends on unapplied database functions and a server database connection. It remains recoverable from prior Git commits; it is not the active application.

The database has the original enum workspace columns and additional workspace_id columns. It was not reset or migrated to the newer mission schema. Existing access policies were not changed. Migration files for that upgrade are retained for historical reference; do not blindly replay them against this partially upgraded database.

Live checks confirm 4,676 DocMesKer leads, 4,444 Justin leads, 48 notes, 13 stages, 3 email messages, 3 mailboxes, 6 users and 6 profiles. No orphan notes. A live UI stage update persisted, then its stage, status, owner and timestamps were restored exactly. Whole-table row fingerprints matched before and after verification.

Rollback-only authenticated SQL checks exposed a trigger error when adding notes: private.sync_legacy_workspace referenced NEW.workspace on lead_notes, which has no such column. The recovery hotfix nests the field access inside an IF branch. Authenticated lead and note insertion, stage changes and ownership updates passed after the fix; temporary records were rolled back.

Application dependencies remain on the current compatible TanStack versions. Type checking and the production build pass. No outreach email is sent as part of recovery verification.

The old creator test/benchmark scripts target the inactive newer application. They remain in history and their source files are retained, but their package scripts are removed from the recovered CRM.
