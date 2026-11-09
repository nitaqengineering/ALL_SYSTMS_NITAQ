# Stage-save incident: 2026-11-08
User reported successful edits on first few projects, then failures on current portal.

Read-only production snapshot saved to work/live-workspace-diagnostic-private.json (private, excluded from GitHub package). 12 projects, revision458 at capture. No test status changes on production.

Reproduction on restored isolated PostgreSQL plus actual frontend transition functions:
- Before010: 544 valid transitions saved, 36 accepted frontend changes rejected by DB, all on109 with already-issued permit. Error22023 Permit prerequisites are incomplete.
- After010: 580 transitions saved, 240 frontend blocks preserved (closed/unavailable/invalid operations), zero mismatches.
- 57 sequential design lifecycle saves and verified exact undo passed.
- New issuance without prerequisites still rejected; issued record remains visible after current approval changes, with review notice.
- 9 actual UI saves across105107108109111112113115116 against isolated real PG; values persisted after reload.
- 3 real leading-whitespace accounting owner names: contact edits and project details preserve exact canonical owner, validated SQL save.

Applied migration20261108_010_issued_permit_updates on production, confirmed migration record. Only function definition changed; no project statuses changed for tests.
Frontend: reject dialog identifies project; safe discard/refresh label; issued permit visibility/review notice; read-only canonical names not trimmed during unrelated edits; versioned script URLs status-3.
Updated GitHub ZIP. Full four-system audit is not claimed by this incident regression.
Claude independent review still unavailable from prior weekly usage limit; no successful review claimed.
