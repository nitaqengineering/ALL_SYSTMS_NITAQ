-- Lossless transport only. Stored documents, history and CAS/save functions are unchanged.
begin;
create or replace function public.nitaq_engineering_workspace_read_v3(p_after text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare original jsonb; packed jsonb;
begin
 -- Reuse the existing membership check, page bounds, revision and cursor contract.
 original:=public.nitaq_engineering_workspace_read_v2(p_after);
 with docs as materialized (
   select ordinality n,value d from jsonb_array_elements(original->'projects') with ordinality
 ), history_dict as materialized (
   select h,(row_number() over(order by h)-1)::integer idx
   from (select distinct d->'history' h from docs where jsonb_typeof(d->'history')='array') histories
 ), events as materialized (
   select d.idx n,e.ordinality ord,e.value v from history_dict d cross join lateral
    jsonb_array_elements(d.h) with ordinality e
 ), stage_values as (
   select d->'stages' v from docs where jsonb_typeof(d->'stages')='object'
   union select v->'stages' from events where jsonb_typeof(v)='object' and jsonb_typeof(v->'stages')='object'
 ), stage_dict as materialized (
   select v,(row_number() over(order by v)-1)::integer idx from stage_values
 ), event_values as materialized (
   select e.n,e.ord,case when s.idx is null then jsonb_build_object('value',e.v)
     else jsonb_build_object('value',e.v-'stages','stage_ref',s.idx) end payload
   from events e left join stage_dict s on jsonb_typeof(e.v)='object' and e.v->'stages'=s.v
 ), event_dict as materialized (
   select payload,(row_number() over(order by payload)-1)::integer idx from (select distinct payload from event_values) distinct_events
 ), history_refs as (
   select e.n,jsonb_agg(d.idx order by e.ord) refs from event_values e join event_dict d on e.payload=d.payload group by e.n
 ), encoded_projects as (
   select d.n,jsonb_build_object('data',
     case when jsonb_typeof(d.d->'history')='array' then
       (case when s.idx is not null then d.d-'stages' else d.d end)-'history'
       else case when s.idx is not null then d.d-'stages' else d.d end end)
     ||case when s.idx is not null then jsonb_build_object('stage_ref',s.idx) else '{}'::jsonb end
     ||case when h.idx is not null then jsonb_build_object('history_ref',h.idx) else '{}'::jsonb end payload
   from docs d left join stage_dict s on d.d->'stages'=s.v left join history_dict h on h.h=d.d->'history'
 )
 select (original-'projects')||jsonb_build_object('wire_format','dictionary-v1',
   'projects',coalesce((select jsonb_agg(payload order by n) from encoded_projects),'[]'::jsonb),
   'stage_sets',coalesce((select jsonb_agg(v order by idx) from stage_dict),'[]'::jsonb),
   'history_entries',coalesce((select jsonb_agg(payload order by idx) from event_dict),'[]'::jsonb),
   'histories',coalesce((select jsonb_agg(coalesce(r.refs,'[]'::jsonb) order by h.idx) from history_dict h left join history_refs r on r.n=h.idx),'[]'::jsonb)) into packed;
 -- Unique/small documents can cost more to pack. Never send a larger representation.
 if octet_length(packed::text)>=octet_length(original::text) then return original;end if;
 return packed;
end $function$;
revoke all on function public.nitaq_engineering_workspace_read_v3(text) from public,anon;
grant execute on function public.nitaq_engineering_workspace_read_v3(text) to authenticated;
insert into nitaq_engineering.migrations(version) values('20261120_021_compact_workspace_read') on conflict do nothing;
notify pgrst,'reload schema';
commit;
