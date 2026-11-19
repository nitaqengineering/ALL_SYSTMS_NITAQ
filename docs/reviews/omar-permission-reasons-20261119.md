# OMAR project 109 permission diagnosis — 19 November 2026

Confirmed on production:
- The verified bound OMAR profile is active, an engineer, with edit=true, assign=true, editAll=true.
- The production log rejection was `Project administration requires manager`, not `Stage is assigned to another engineer`.
- An authenticated stage-only save for project 109 using the bound actor succeeded inside a transaction that was rolled back. No test changes were committed to company data.
- editAll grants stage editing across assignments; it does not grant project identity/document administration, permit administration, or workspace management. No account roles, permissions, RLS or grants were changed.

Frontend fix:
- Project identity/category forms open read-only for non-managers; full owner data remains readable.
- Submission guard rejects administrative form edits before local mutation or queueing; new-project action is hidden where the database already prohibits creation.
- Stage forms retain their existing permission behavior.
- Permission errors explain the actual server reason instead of always suggesting editAll. Pending rejected edits remain available for download/recovery.

Verification: npm run check passed; real save-handler regression tests confirm the error reason and retained draft; actual project form tests confirm engineer read-only/admin submit denial, editable stage forms and unchanged manager editing. No authenticated browser interaction was performed as OMAR. The user's exact click path is still requested to distinguish project-form edits from another administrative field.
