# Review-required status — 19 November 2026

Added built-in rev: المخططات تحتاج مراجعة / Drawings need review.
Orange foreground #8a4800 on #fff0d9; visible status code remains present.
Available alongside dwg in drafting-stage dropdowns, filters, legend and bilingual owner/tender reports. Design and coordination keep their dedicated existing state lists. rev is not an approval and cannot satisfy permit prerequisites.

Tests: npm run check passed; owner report generation verifies selected rev, both languages, grouping/legend and interactive colour; local PostgreSQL saves/reloads rev across drafting departments, rejects premature permit submission and accepts migration replay. Existing project-data permission tests still pass.

Applied review_required_status migration through the Supabase connector. Live verification: rev_enabled=true and project_data_permission_preserved=true. No project statuses or user permissions were changed by the migration.
