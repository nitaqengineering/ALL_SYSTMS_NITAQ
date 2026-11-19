# Explicit project data editing — 19 November 2026

Owner explicitly authorized OMAR to edit the project form, including its description.

A separate editProject permission now controls metadata edits to existing projects: name (unless owned by Accounting), sketch, category, work kind, Arabic/English description, location, responsible engineer (requires assign), utility/telecom provider, municipality and system. No user is promoted to manager. No creation, permission management, financial fields, accounting links or owner/parcel data from Accounting are granted by this flag.

The permission is visible as a separate checkbox in engineering user management. Stage editAll retains its existing meaning. Permission removal takes effect on the next server save.

Production:
- Applied project_data_edit_permission migration through the Supabase connector after isolated SQL tests passed.
- Enabled editProject only on the one active, email-confirmed and explicitly bound OMAR profile; existing flags and engineer role were retained, workspace revision incremented.
- Actual authenticated save_v2 description edit for project 109 returned saved within a rolled-back transaction. No test project description was committed.

Validation: npm run check; actual form and user-profile checkbox grant/revoke tests; full disposable PostgreSQL integration including metadata save/reload, finance/link/identity/assignment/stage/create denials, revocation and idempotence. Browser session as OMAR has not been operated.
