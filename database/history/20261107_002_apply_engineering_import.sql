-- Run only after the import batch is uploaded and verified.
begin;
do $$
declare
  batch nitaq_engineering.import_batches%rowtype;
  item jsonb;
  source_record public.nitaq_records%rowtype;
begin
  select * into strict batch from nitaq_engineering.import_batches;
  if jsonb_array_length(batch.source_document->'projects') <> 12 then
    raise exception 'Unexpected project count';
  end if;
  for item in select value from jsonb_array_elements(batch.source_document->'projects') loop
    select * into strict source_record from public.nitaq_records
      where entity='projects' and id=item->>'accountingProjectId';
    if source_record.data->>'projectNo' is distinct from item->>'id'
       or btrim(source_record.data->>'owner', E' \t\r\n') is distinct from btrim(item->>'name', E' \t\r\n') then
      raise exception 'Accounting source mismatch for %', item->>'id';
    end if;
    insert into nitaq_engineering.projects(id,accounting_id,import_id,data)
      values(item->>'id',item->>'accountingProjectId',batch.id,item-'stages');
    insert into nitaq_engineering.stages(project_id,stage_key,data)
      select item->>'id',key,value from jsonb_each(item->'stages');
  end loop;
  if (select count(*) from nitaq_engineering.stages) <> 168 then
    raise exception 'Unexpected stage count';
  end if;
  if exists (
    select 1 from nitaq_engineering.projects p
    where (p.data || jsonb_build_object('stages',(
      select jsonb_object_agg(s.stage_key,s.data)
      from nitaq_engineering.stages s where s.project_id=p.id
    ))) is distinct from (
      select value from jsonb_array_elements(batch.source_document->'projects')
      where value->>'id'=p.id
    )
  ) then raise exception 'Imported values differ from source'; end if;
end $$;
commit;
select count(*) as projects from nitaq_engineering.projects;
