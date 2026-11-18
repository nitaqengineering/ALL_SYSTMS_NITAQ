-- Accounting/engineering only. Repair the permit-ordering regression introduced by
-- full save_v1 replacements in migrations 016-018, preserving all current guards.
begin;
do $migration$
declare src text; old_check text; new_check text;
begin
 src:=pg_get_functiondef('public.nitaq_engineering_workspace_save_v1(uuid,jsonb,jsonb,jsonb)'::regprocedure);
 old_check:=$old$(next_doc#>array['workflow',k,'submissions', '-1'] is not null and
               next_doc#>>array['workflow',k,'submissions','-1','outcome'] is distinct from 'اعتماد')$old$;
 new_check:=$new$(nitaq_engineering.latest_submission_v2(next_doc#>array['workflow',k,'submissions']) is not null and
               nitaq_engineering.latest_submission_v2(next_doc#>array['workflow',k,'submissions'])->>'outcome' is distinct from 'اعتماد')$new$;
 if position(old_check in src)>0 then
   execute replace(src,old_check,new_check);
 elsif position(new_check in src)=0 then
   raise exception 'Review save_v1 permit definition drift before applying migration 019';
 end if;
end $migration$;
insert into nitaq_engineering.migrations(version) values('20261118_019_preserve_latest_submission') on conflict do nothing;
notify pgrst,'reload schema';
commit;
