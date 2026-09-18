# Premium outreach operating system redesign

## Scope
Rebuild the authenticated CRM experience around a persistent application shell, dense lead operations, and fast daily workflows while preserving authentication, all 4,477 imported leads, realtime updates, notes, ownership, stages, search, bulk status changes, add-lead, and drag-and-drop behavior.

## Build sequence
1. **Design system and shell**
   - Replace the current warm visual language with a neutral Geist-based system, compact controls, restrained status colors, consistent focus states, motion, skeletons, and responsive rules.
   - Add a collapsible desktop sidebar, compact mobile navigation, global top bar, command palette, profile menu, quick add, and route-aware navigation.

2. **Leads workspace**
   - Replace analytics-heavy content with a compact page header, clickable status strip, saved-view rail, sticky filter/action toolbar, active filter chips, sorting, and table/board controls.
   - Upgrade the virtualized lead table with dense lead identity cells, sticky header, selectable rows, owner/status actions, last-touch and next-action fields, row hover actions, keyboard navigation, persistent view preferences, loading skeletons, and useful empty/error states.
   - Upgrade bulk mode with stage changes, assignment, export, and context-aware actions supported by the current schema.

3. **Lead detail and creation**
   - Expand the lead drawer to a 560px workspace with overview, activity, notes, and communication context derived from real lead fields and notes.
   - Add fast contact/copy/open actions, ownership controls, stage history presentation, keyboard closing, and improved feedback.
   - Refine quick-add to remain fast and only expose fields supported by the current database.

4. **Operational routes**
   - Make `/` route authenticated users into an operational dashboard showing priorities, work queue, compact pipeline, recent activity, and small performance summaries from real leads.
   - Add `/outreach`, `/replies`, `/follow-ups`, `/pipeline`, `/analytics`, `/templates`, and `/settings` as functional views using existing lead and note data.
   - Outreach will support sequential lead processing, message drafting/copying, marking contacted, and moving to the next lead.
   - Follow-ups and replies will use honest heuristics from existing timestamps, statuses, and notes; unsupported scheduling or inbox-sync features will not be faked.

5. **Quality pass**
   - Preserve realtime query invalidation and virtualized rendering.
   - Verify route metadata, desktop/tablet/mobile layouts, keyboard workflows, focus behavior, overflow, drawer/modal clipping, empty/loading/error states, and core interactions in the live preview.

## Technical notes
- Keep the existing Lovable Cloud schema and browser data client unchanged.
- Reuse existing query keys and mutations; add only client-side derived views and schema-compatible mutations.
- Keep the five persisted stages (`Not contacted`, `Contacted`, `Replied`, `Deal`, `Dead`). “Qualified” will not be fabricated without a database migration.
- Use TanStack Router route files for every navigation destination and preserve `/leads`.
- Use the existing virtualizer for high-volume table rendering and local persistence for UI preferences only.
