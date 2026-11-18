-- Accounting/engineering project only. No project values or grants are changed.
begin;
do $patch$
declare src text;old_guard text;new_guard text;
begin
 src:=pg_get_functiondef('public.nitaq_engineering_workspace_save_v1(uuid,jsonb,jsonb,jsonb)'::regprocedure);
 old_guard:=$old$next_doc#>>'{stages,coordination,status}' not in ('REQ','COM','OK','HOLD','DONE')$old$;
 new_guard:=$new$next_doc#>>'{stages,coordination,status}' not in ('REQ','READY','COM','OK','HOLD','DONE')$new$;
 if position(old_guard in src)>0 then execute replace(src,old_guard,new_guard);
 elsif position(new_guard in src)=0 then raise exception 'Review coordination status guard drift before enabling READY';end if;
end $patch$;
insert into nitaq_engineering.migrations(version) values('20261118110729_ready_for_coordination') on conflict do nothing;
notify pgrst,'reload schema';
commit;
