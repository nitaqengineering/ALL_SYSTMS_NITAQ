No blockers. I read one file, `database/crm/20261109_001_safe_mutations.sql`, and made no edits.

**Security-definer CAS/replay access still works**
- The migration creates the `receipts` table at lines 5–7 and the `SECURITY DEFINER` function `nitaq_crm_apply_v2`, so both are owned by the role that runs the migration.
- Postgres doesn't apply RLS to a table's owner unless `FORCE ROW LEVEL SECURITY` is set. The migration doesn't set it.
- So the replay `SELECT` (line 78) and receipt `INSERT` (line 146) inside the function still bypass RLS, with or without policies. Superusers and `BYPASSRLS` roles bypass it as well.

**Direct browser access is denied without new policies**
- Line 4 revokes all access to the `nitaq_crm_private` schema from `public`, `anon` and `authenticated`. Without schema `USAGE`, those roles can't reach the table at all.
- The migration grants nothing on `receipts`.
- The new line 8 is extra defence: with RLS on and no policies, any table grant someone adds later would still return no rows to non-owner roles.
- Leaving out policies is correct. Adding one would only open up access.

**Non-blocking caveats**
1. **Pre-existing table:** because of `create table if not exists`, if `receipts` already exists in some environment under a different role that isn't the function owner and lacks `BYPASSRLS`, the enabled RLS would block the function. Before this change, that setup would only have needed table grants. A quick check on the target before deploying: `select tableowner from pg_tables where schemaname='nitaq_crm_private'` should match the owner of `nitaq_crm_apply_v2`.
2. **Test fidelity:** if the local PG tests create the objects as a superuser, superuser bypass hides the owner-exemption path. To actually exercise it, the functions and table should be owned by a non-superuser role (as on Supabase, where `postgres` isn't a true superuser), and the tests should call the function as `authenticated`. They should also confirm that a direct `select` on `nitaq_crm_private.receipts` as `authenticated` fails with a permission error.