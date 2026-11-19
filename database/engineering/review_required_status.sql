-- Review-required status is a work state, never an authority approval.
begin;
do $patch$
declare src text;old_list text;new_list text;
begin
 src:=pg_get_functiondef('public.nitaq_engineering_workspace_save_v1(uuid,jsonb,jsonb,jsonb)'::regprocedure);
 old_list:=$old$array['REQ','dwg','dwg egy','SUB','COM','SUB COM','OK','READY','N/A']$old$;
 new_list:=$new$array['REQ','dwg','dwg egy','rev','SUB','COM','SUB COM','OK','READY','N/A']$new$;
 if position(old_list in src)>0 then execute replace(src,old_list,new_list);
 elsif position(new_list in src)=0 then raise exception 'Department status guard drift: review before enabling rev';end if;
end $patch$;
insert into nitaq_engineering.migrations(version) values('review_required_status') on conflict do nothing;
notify pgrst,'reload schema';
commit;
