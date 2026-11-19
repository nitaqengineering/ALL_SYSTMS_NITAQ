# Distinct status palette — 19 November 2026

REQ slate; dwg blue; dwg egy purple; rev orange; READY gold; SUB cyan; COM rust; SUB COM indigo; OK green; HOLD rose; DONE solid navy/white; N/A light neutral.

Each default status has an independent colour class. The selected status, native Windows option menu, manager colour choices, separate HOLD/DONE legend, mobile cards, and bilingual owner/tender report use the same palette. Status codes remain visible. Disabled status selects retain colour while remaining non-interactive.

No project values, stage rules, permissions or SQL were changed by the palette update. Saved colour overrides for custom statuses are preserved. Live settings were inspected: built-in READY has a label override only, no colour overrides to migrate.

Verification: npm run check passed. check-status-colours checks all 12 default classes and backgrounds are unique, text contrast >=4.5:1, report colours match, option colours exist and HOLD/DONE are separate. Actual report generation checks dwg/SUB COM/rev selection, translations and interactive class switching. Visual acceptance in a live browser was not performed for this palette revision.
