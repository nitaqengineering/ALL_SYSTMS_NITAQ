# Final resolution: B-A and B-B are resolved, no blockers remain

I found no remaining ship blocker in what I re-checked. This round used 7 of the 8 allowed tool calls and does not certify production behaviour.

## B-A: Engineering invitations wiped by migration order — resolved
- `database/accounting/20261109_001_revenue_controls.sql:16-29` now reads the live sign-up handler before touching it. It returns without changes if the handler mentions `nitaq_engineering.auth_bindings_v2` (as 013's does) or the no-op marker.
- It only replaces the handler if it is the old `nitaq_profiles` auto-role version. Any other definition aborts the migration with a "drift" error, so it fails safe.
- `scripts/check-database.mjs:32-36` now applies accounting 001, then 001 again, then 011–013, then 001 once more.
- `scripts/database-engineering-cases.mjs:22-38` checks the outcomes that matter:
  - A matching email alone gets a 42501 refusal.
  - A manager's explicit approval binds an already-verified account.
  - An invited user (`invited_at` plus a manager invite attempt) binds to `invited-test` after the last 001 re-run.
  - Neither user gets an accounting profile.

## B-B: CRM edits stranded after the session ends — resolved
In `src/crm.jsx:2182-2205` (`handleAuthEvent`):
- **Sign-out with pending edits:** the queue and draft are kept, sync is blocked and the login screen shows. New edits are refused while signed out.
- **Sign-in as the original account:** the block is cleared and the same `cloudFlush` resumes with the same request ID. Nothing is re-read from the server until the queue is empty, so the draft isn't overwritten.
- **Sign-in as a different account:** it stays blocked.
- **Auth lock:** the `onAuthStateChange` callback is synchronous and defers the work with `setTimeout` (`:2255-2258`), outside the SDK's auth lock.

`scripts/check-safety.mjs:38-41` runs the real extracted `handleAuthEvent` for sign-out, a different account (no resume, still blocked) and the original account (resumes once, unblocked, zero server reads, queue intact). That test replaces `cloudFlush` with a counter, so "same request ID on resume" relies on the separate `cloudFlush` retry test.

## Other item spot-checked
- **Accounting link fields:** only a CRM owner can change `accountingId`, `accountingOwner` or the two plot snapshot fields. This covers both new and existing leads (CRM SQL `:128`, error 42501).

## Still conditional, not re-checked this round
1. **Earlier C-1 (one rejected change blocking all later saves):** you say the definitive-error repair test passes. I did not re-read that path, and the sign-in resume goes through the same `cloudFlush`.
2. **Not re-read:**
   - the projected accounting-match query (stable ID or project number, max 2 rows)
   - the new restore consent/counts in `backup.js`
   - the workflow-name updates on rename in `users.js`
   - the Excel byte round-trip test and the compiled-JSX check
   
   These are your descriptions, not my verification.
3. **Live and pending:**
   - the final SQL run (reverse order, invites, 5000 restore)
   - the PostgreSQL 17 run in CI
   - live definitions containing the drift-check strings
   - the live `records_select` policy for `task` rows
   - the invite edge function writing `invite_attempts` before Supabase sends the invite
   - all production migrations

   Local tests don't prove live policies.