# Shared outreach CRM

A clean, modern CRM for you and your friends to track which of your 4,477 Instagram leads have been reached out to, and what they replied. Everything updates live for everyone at once.

## What gets built

**Sign in**
- Email + password accounts. Each teammate makes their own account, so every action is stamped with who did it.
- A simple landing screen with sign in / sign up; everything else is behind login.

**The leads**
- All 4,477 rows from your file are loaded in: number, Instagram link, username, email, and the match-confidence note.
- Each lead has a stage: Not contacted, Contacted, Replied, Deal, Dead. Everything starts as Not contacted.
- Each lead also records who claimed/worked it and when it was last touched.

**Two ways to work**
- Table view: fast scrolling list of thousands of rows, with search (username or email), stage filter, "only mine" filter, and one-click stage change straight from the row. Bulk-select rows to mark several at once.
- Board view: five columns by stage, drag a card between columns to move it. Switch between table and board with a toggle.

**Lead detail**
- Side panel with the Instagram link, email (click to copy), original note, current stage, and owner.
- Notes thread: anyone can add a free-text note; each shows the author's name and timestamp. This is where replies get recorded.

**Live updates**
- Stage changes, claims, and new notes appear for everyone instantly without refreshing.

**Progress dashboard**
- Top bar showing totals: contacted, replied, deals, remaining, plus a per-person leaderboard of how many each teammate has reached out to.

## Design

Clean modern workspace look: light neutral canvas, one confident accent color, soft cards, generous spacing, crisp small-caps status pills, keyboard-friendly. No clutter — the table is the hero.

## Technical notes

- Lovable Cloud gets enabled for the database, accounts, and realtime.
- Tables: `profiles` (display name per user, auto-created on signup), `leads` (imported CSV columns + status enum + owner + timestamps), `lead_notes` (lead id, author, body, created_at).
- All 4,477 leads are inserted as literal rows in the migration so the app has real data on first load.
- Row-level security: any signed-in teammate can read and update all leads and notes; notes are author-stamped and only the author can edit/delete theirs.
- Supabase realtime subscriptions on `leads` and `lead_notes` invalidate the query cache for instant shared updates.
- Table view is virtualized so thousands of rows stay smooth.
