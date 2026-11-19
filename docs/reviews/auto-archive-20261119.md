# Automatic DONE archive — 19 November 2026

A project whose design status is DONE is archived by status and excluded from default project/document/supervision result sets. Existing Archive view already selects DONE projects, so no records are moved, copied or deleted. HOLD projects remain in daily follow-up.

Explicit display: Archive tab; Archived DONE filter; All projects including archived; closed/stopped filter; selecting DONE as a stage status; directly focusing a particular archived project. Other filters still compose normally. The total-project statistics button requests the inclusive view explicitly; clear-filters returns to non-archived results. Search alone does not silently add archived projects.

Closing removes a row immediately; manager reopening returns it automatically. Existing project/history/status data and permissions are unchanged. Printing and CSV use the same filtered result model and therefore exclude archived rows by default.

Verification: npm run check passed, including actual visible() regression covering default, HOLD, inclusive/archived filters, DONE status filter, direct focus, search composition, close/reopen and preservation of the full project collection. No database migration is needed.
