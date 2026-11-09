--
-- PostgreSQL database dump
--

\restrict ZUKxqp2nsGvRMDxDczB6TDamWhNc5wVxr7K3YEeIiQvguYLUeIP11PVjpXUNhzB

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: nitaq_bundle_reason_v1(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_bundle_reason_v1(old_data jsonb, new_data jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE meta jsonb:=new_data->'_financialCorrection';token text:=meta->>'id';reason text:=btrim(meta->>'reason');
BEGIN
 IF public.nitaq_role() IS DISTINCT FROM 'owner' OR auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_BUNDLE_OWNER_REASON_REQUIRED';END IF;
 IF jsonb_typeof(meta) IS DISTINCT FROM 'object' OR meta->>'kind' IS DISTINCT FROM 'data_correction'
 OR jsonb_typeof(meta->'reason') IS DISTINCT FROM 'string' OR reason IS NULL OR length(reason) NOT BETWEEN 3 AND 500 OR reason !~ '[^[:space:]]'
 OR jsonb_typeof(meta->'id') IS DISTINCT FROM 'string' OR token IS NULL OR length(token) NOT BETWEEN 1 AND 128
 OR token IS NOT DISTINCT FROM (old_data#>>'{_financialCorrection,id}') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_BUNDLE_FRESH_REASON_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM public.nitaq_financial_audit_v1 WHERE after_row#>>'{data,_financialCorrection,id}'=token) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_BUNDLE_CORRECTION_REUSED';END IF;
END;$$;


--
-- Name: FUNCTION nitaq_bundle_reason_v1(old_data jsonb, new_data jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nitaq_bundle_reason_v1(old_data jsonb, new_data jsonb) IS 'NITAQ_FINANCIAL_BUNDLE_V1';


--
-- Name: nitaq_employee_directory_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_employee_directory_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE directory_id text:='sd-'||NEW.id;
BEGIN
 IF NEW.entity<>'employees' THEN RETURN NULL;END IF;
 IF EXISTS(SELECT 1 FROM public.nitaq_records WHERE id=directory_id AND entity<>'staffDir') THEN RAISE EXCEPTION 'NITAQ_DIRECTORY_ID_COLLISION';END IF;
 INSERT INTO public.nitaq_records(id,entity,data) VALUES(directory_id,'staffDir',jsonb_build_object('id',directory_id,'empId',NEW.id,'name',COALESCE(NEW.data->>'name','')))
 ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data WHERE public.nitaq_records.data IS DISTINCT FROM EXCLUDED.data;
 RETURN NULL;
END;$$;


--
-- Name: FUNCTION nitaq_employee_directory_v1(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nitaq_employee_directory_v1() IS 'NITAQ_FINANCIAL_BUNDLE_V1';


--
-- Name: nitaq_financial_audit_capture_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_financial_audit_capture_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
    DECLARE old_doc jsonb; new_doc jsonb; entity_name text; reason text;
    BEGIN
      IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'nitaq_records' OR TG_WHEN<>'AFTER' OR TG_LEVEL<>'ROW' THEN
        RAISE EXCEPTION 'NITAQ_AUDIT_WRONG_TRIGGER';
      END IF;
      IF TG_OP<>'INSERT' THEN old_doc:=to_jsonb(OLD); END IF;
      IF TG_OP<>'DELETE' THEN new_doc:=to_jsonb(NEW); END IF;
      IF COALESCE(old_doc->>'entity','') <> ALL(ARRAY['projects','contracts','payments','govFees','officeExpenses','projectCosts','recurringBills','treasury','employees','overtime','advances','leaves','settings','attendance','staffDir'])
         AND COALESCE(new_doc->>'entity','') <> ALL(ARRAY['projects','contracts','payments','govFees','officeExpenses','projectCosts','recurringBills','treasury','employees','overtime','advances','leaves','settings','attendance','staffDir']) THEN
        RETURN NULL;
      END IF;
      IF TG_OP='UPDATE' AND OLD.id=NEW.id AND OLD.entity=NEW.entity AND OLD.data IS NOT DISTINCT FROM NEW.data THEN RETURN NULL; END IF;
      entity_name:=COALESCE(new_doc->>'entity',old_doc->>'entity');
      -- Reasons are labelled as client supplied, NOT yet enforced by this foundation.
      IF new_doc IS NOT NULL THEN
        IF (new_doc#>>'{data,_financialCorrection,id}') IS DISTINCT FROM (old_doc#>>'{data,_financialCorrection,id}') AND new_doc#>>'{data,_financialCorrection,id}' IS NOT NULL THEN
          reason:=NULLIF(btrim(new_doc#>>'{data,_financialCorrection,reason}'),'');
        END IF;
        IF reason IS NULL AND (new_doc->'data'->>'lastCorrectionReason') IS DISTINCT FROM (old_doc->'data'->>'lastCorrectionReason') THEN
          reason:=NULLIF(btrim(new_doc->'data'->>'lastCorrectionReason'),'');
        END IF;
        IF reason IS NULL AND (new_doc->'data'->'archived')='true'::jsonb
           AND (old_doc->'data'->'archived') IS DISTINCT FROM (new_doc->'data'->'archived') THEN
          reason:=NULLIF(btrim(new_doc->'data'->>'archiveReason'),'');
        END IF;
      END IF;
      INSERT INTO public.nitaq_financial_audit_v1(transaction_id,actor_user_id,actor_role,database_role,operation,record_id,record_entity,before_row,after_row,reason_as_supplied)
      VALUES(txid_current(),auth.uid(),public.nitaq_role(),current_setting('role',true),TG_OP,COALESCE(new_doc->>'id',old_doc->>'id'),entity_name,old_doc,new_doc,reason);
      RETURN NULL;
    END;
    $$;


--
-- Name: FUNCTION nitaq_financial_audit_capture_v1(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nitaq_financial_audit_capture_v1() IS 'NITAQ_FINANCIAL_AUDIT_V1_TRIGGER';


--
-- Name: nitaq_financial_bundle_guard_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_financial_bundle_guard_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $_$
DECLARE specs jsonb:=$spec${"officeExpenses":{"fields":["amount","date","account","bankName","bankRef","vatable","payStatus","kind","month","category","chequeNo","chequeDueDate"],"numbers":["amount"]},"projectCosts":{"fields":["projectId","amount","date","account","bankName","vatable","category","chequeNo","chequeDueDate","payStatus"],"numbers":["amount"]},"treasury":{"fields":["amount","date","type","account","toAccount","kind","month"],"numbers":["amount"]},"otherIncome":{"fields":["category","vatable","account","date","payer","note"],"numbers":["amount"]},"advances":{"fields":["employeeId","type","mode","amount","monthlyInstallment","startMonth","date"],"numbers":["amount","monthlyInstallment"]},"govFees":{"fields":["projectId","amount","date","account","payerType","paidStatus","reimburseStatus","receiptNo","department"],"numbers":["amount"]},"employees":{"fields":["baseSalary","grossSalary","hireDate"],"numbers":["baseSalary","grossSalary"]},"overtime":{"fields":["employeeId","hours","rate","date"],"numbers":["hours","rate"]},"leaves":{"fields":["employeeId","type","fromDate","toDate","days"],"numbers":["days"]},"recurringBills":{"fields":["amount","frequency","account","bankName","nextDueDate","active"],"numbers":["amount"]}}$spec$::jsonb;spec jsonb;old_data jsonb;v jsonb;field text;entity_name text;
 actor_role text:=public.nitaq_role();old_posted boolean:=false;new_posted boolean;old_arch boolean:=false;new_arch boolean;needs_reason boolean:=false;
 canonical jsonb;employee_record public.nitaq_records%ROWTYPE;period text;old_period text;day_key text;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'nitaq_records' OR TG_WHEN<>'BEFORE' THEN RAISE EXCEPTION 'NITAQ_WRONG_BUNDLE_TRIGGER';END IF;
 entity_name:=CASE WHEN TG_OP='DELETE' THEN OLD.entity ELSE NEW.entity END;
 IF TG_OP='UPDATE' THEN old_data:=OLD.data;END IF;
 IF entity_name='staffDir' THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_DIRECTORY_DELETE_DENIED';END IF;
   SELECT * INTO employee_record FROM public.nitaq_records WHERE entity='employees' AND id=NEW.data->>'empId';
   IF FOUND THEN canonical:=jsonb_build_object('id',NEW.id,'empId',employee_record.id,'name',COALESCE(employee_record.data->>'name',''));
   ELSE
     IF TG_OP='INSERT' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_DIRECTORY_EMPLOYEE_REQUIRED';END IF;
     IF COALESCE(OLD.data->>'empId','')='' THEN RAISE EXCEPTION 'NITAQ_DIRECTORY_INVALID_EXISTING';END IF;
     canonical:=jsonb_build_object('id',NEW.id,'empId',OLD.data->>'empId','name',COALESCE(OLD.data->>'name',''));
   END IF;
   NEW.data:=canonical;RETURN NEW;
 END IF;
 IF entity_name='attendance' THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_ATTENDANCE_HARD_DELETE_DENIED';END IF;
   IF auth.uid() IS NULL OR actor_role IS NULL OR actor_role NOT IN ('owner','accountant') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_BUNDLE_WRITE_DENIED';END IF;
   IF NEW.data->>'id' IS DISTINCT FROM NEW.id OR jsonb_typeof(NEW.data->'empId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_ATTENDANCE_ID_INVALID';END IF;
   IF TG_OP='UPDATE' AND old_data->'empId' IS DISTINCT FROM NEW.data->'empId' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_ATTENDANCE_EMPLOYEE_IMMUTABLE';END IF;
   IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM public.nitaq_records WHERE (entity='employees' AND id=NEW.data->>'empId') OR (entity='staffDir' AND data->>'empId'=NEW.data->>'empId')) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_ATTENDANCE_EMPLOYEE_REQUIRED';END IF;
   IF jsonb_typeof(NEW.data->'map') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_ATTENDANCE_MAP_INVALID';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(NEW.data->'map') e WHERE jsonb_typeof(e.value)<>'string') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_ATTENDANCE_STATUS_INVALID';END IF;
   FOR day_key IN SELECT jsonb_object_keys(COALESCE(old_data->'map','{}'::jsonb)||NEW.data->'map') LOOP
     IF old_data->'map'->day_key IS DISTINCT FROM NEW.data->'map'->day_key
        AND EXISTS(SELECT 1 FROM public.nitaq_payroll_month_v1 WHERE month=left(day_key,7)) THEN needs_reason:=true;END IF;
   END LOOP;
   IF needs_reason THEN PERFORM public.nitaq_bundle_reason_v1(old_data,NEW.data);END IF;
   RETURN NEW;
 END IF;
 spec:=specs->entity_name;IF spec IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_BUNDLE_HARD_DELETE_DENIED';END IF;
 IF jsonb_typeof(NEW.data) IS DISTINCT FROM 'object' OR NEW.data->>'id' IS DISTINCT FROM NEW.id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_DATA_INVALID';END IF;
 FOR field IN SELECT jsonb_array_elements_text(spec->'fields') EXCEPT SELECT jsonb_array_elements_text(spec->'numbers') LOOP
   IF NEW.data->field IS NOT NULL AND NEW.data->field<>'null'::jsonb AND jsonb_typeof(NEW.data->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_TEXT_INVALID';END IF;
 END LOOP;
 FOR field IN SELECT jsonb_array_elements_text(spec->'numbers') LOOP
   v:=NEW.data->field;
   IF v IS NULL AND field NOT IN ('grossSalary','monthlyInstallment') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_NUMBER_REQUIRED';END IF;
   IF v IS NOT NULL AND jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_NUMBER_INVALID';END IF;
   IF entity_name IN ('employees','overtime','leaves') AND jsonb_typeof(v)='number' AND (v#>>'{}')::numeric<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_NEGATIVE_INVALID';END IF;
 END LOOP;
 -- ↓↓↓ التعديل: أضفنا otherIncome لفحص وجود amount وعدم سالبيته ↓↓↓
 IF entity_name IN ('officeExpenses','projectCosts','treasury','advances','govFees','recurringBills','otherIncome') THEN
   IF jsonb_typeof(NEW.data->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_AMOUNT_REQUIRED';END IF;
   IF entity_name NOT IN ('officeExpenses','projectCosts') AND (NEW.data->>'amount')::numeric<0 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_NEGATIVE_INVALID';END IF;
 END IF;
 IF entity_name='treasury' AND (COALESCE(NEW.data->>'type','') NOT IN ('قبض','صرف','تحويل') OR COALESCE(NEW.data->>'account','') NOT IN ('البنك','الخزينة') OR (NEW.data->>'type'='تحويل' AND (COALESCE(NEW.data->>'toAccount','') NOT IN ('البنك','الخزينة') OR NEW.data->>'toAccount'=NEW.data->>'account'))) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_TRANSFER_INVALID';END IF;
 IF entity_name='advances' AND NEW.data->>'mode'='مقسّط' THEN
   IF jsonb_typeof(NEW.data->'monthlyInstallment') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_INSTALLMENT_INVALID';END IF;
   IF (NEW.data->>'monthlyInstallment')::numeric<=0 OR (NEW.data->>'monthlyInstallment')::numeric>(NEW.data->>'amount')::numeric THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_INSTALLMENT_INVALID';END IF;
 END IF;
 old_arch:=((old_data->'archived'='true'::jsonb OR old_data->'cancelled'='true'::jsonb) IS TRUE);
 new_arch:=((NEW.data->'archived'='true'::jsonb OR NEW.data->'cancelled'='true'::jsonb) IS TRUE);
 IF (NEW.data ? 'archived' AND jsonb_typeof(NEW.data->'archived') IS DISTINCT FROM 'boolean') OR (NEW.data ? 'cancelled' AND jsonb_typeof(NEW.data->'cancelled') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_FLAG_INVALID';END IF;
 old_posted:=old_data IS NOT NULL AND CASE WHEN entity_name='officeExpenses' THEN COALESCE(old_data->>'payStatus','')<>'معلق' WHEN entity_name='govFees' THEN old_data->>'paidStatus'='مدفوع' OR old_data->>'reimburseStatus'='مسترد' OR COALESCE(old_data->>'receiptNo','')<>'' ELSE true END;
 new_posted:=CASE WHEN entity_name='officeExpenses' THEN COALESCE(NEW.data->>'payStatus','')<>'معلق' WHEN entity_name='govFees' THEN (NEW.data->>'paidStatus'='مدفوع' OR NEW.data->>'reimburseStatus'='مسترد' OR COALESCE(NEW.data->>'receiptNo','')<>'') IS TRUE ELSE true END;
 IF auth.uid() IS NULL OR actor_role IS NULL OR (actor_role NOT IN ('owner','accountant') AND NOT (actor_role='engineer' AND entity_name='govFees' AND NOT COALESCE(old_posted,false) AND NOT new_posted)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_BUNDLE_WRITE_DENIED';END IF;
 IF TG_OP='INSERT' AND new_arch THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_BUNDLE_CREATE_ARCHIVED_DENIED';END IF;
 IF NOT old_arch AND new_arch AND (CASE WHEN TG_OP='INSERT' THEN new_posted ELSE COALESCE(old_posted,false) END) AND entity_name NOT IN ('employees','recurringBills') THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_BUNDLE_POSTED_ARCHIVE_DENIED';END IF;
 needs_reason:=TG_OP='UPDATE' AND (old_arch IS DISTINCT FROM new_arch OR (COALESCE(old_posted,false) AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(spec->'fields') k WHERE old_data->k IS DISTINCT FROM NEW.data->k)));
 IF TG_OP='INSERT' AND entity_name IN ('officeExpenses','projectCosts') AND (NEW.data->>'amount')::numeric<0 THEN needs_reason:=true;END IF;
 IF needs_reason THEN PERFORM public.nitaq_bundle_reason_v1(old_data,NEW.data);END IF;
 IF entity_name IN ('advances','overtime','leaves') AND (TG_OP='INSERT' OR old_data->'employeeId' IS DISTINCT FROM NEW.data->'employeeId') AND NOT EXISTS(SELECT 1 FROM public.nitaq_records WHERE entity='employees' AND id=NEW.data->>'employeeId') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_EMPLOYEE_REQUIRED';END IF;
 IF entity_name IN ('projectCosts','govFees') AND (TG_OP='INSERT' OR old_data->'projectId' IS DISTINCT FROM NEW.data->'projectId') AND NOT EXISTS(SELECT 1 FROM public.nitaq_records WHERE entity='projects' AND id=NEW.data->>'projectId') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BUNDLE_PROJECT_REQUIRED';END IF;
 IF entity_name IN ('officeExpenses','treasury') THEN
   IF TG_OP='UPDATE' AND old_data->>'kind'='رواتب' AND (NEW.data->>'kind' IS DISTINCT FROM 'رواتب' OR NEW.data->>'month' IS DISTINCT FROM old_data->>'month') THEN DELETE FROM public.nitaq_payroll_month_v1 WHERE record_id=OLD.id;END IF;
   IF NEW.data->>'kind'='رواتب' THEN
     IF (NEW.data->>'amount')::numeric<0 OR (NEW.entity='treasury' AND NEW.data->>'type' IS DISTINCT FROM 'صرف') OR (NEW.entity='officeExpenses' AND NEW.data->>'payStatus'='معلق') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYROLL_OUTFLOW_REQUIRED';END IF;
     period:=NEW.data->>'month';IF period IS NULL OR period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYROLL_MONTH_REQUIRED';END IF;
     IF NOT EXISTS(SELECT 1 FROM public.nitaq_payroll_month_v1 WHERE month=period AND record_id=NEW.id) THEN
       BEGIN INSERT INTO public.nitaq_payroll_month_v1(month,record_id,source_entity) VALUES(period,NEW.id,NEW.entity);
       EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_PAYROLL_ALREADY_RECORDED';END;
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END;$_$;


--
-- Name: FUNCTION nitaq_financial_bundle_guard_v1(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nitaq_financial_bundle_guard_v1() IS 'NITAQ_FINANCIAL_BUNDLE_V1';


--
-- Name: nitaq_handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.nitaq_profiles (user_id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    case when (select count(*) from public.nitaq_profiles) = 0 then 'owner' else 'engineer' end
  );
  return new;
end; $$;


--
-- Name: nitaq_payment_guard_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_payment_guard_v1() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public', 'pg_temp'
    AS $$
DECLARE
 actor_role text; old_data jsonb; new_data jsonb; old_net numeric:=0; new_net numeric:=0;
 old_archived boolean:=false; new_archived boolean; archive_changed boolean:=false;
 old_account text; new_account text; structural boolean:=false; documents boolean:=false;
 collection boolean:=false; normal_increase boolean:=false; needs_correction boolean:=false;
 meta jsonb; correction_id text; reason text;
BEGIN
 IF TG_TABLE_SCHEMA<>'public' OR TG_TABLE_NAME<>'nitaq_records' OR TG_WHEN<>'BEFORE' OR TG_LEVEL<>'ROW' THEN RAISE EXCEPTION 'NITAQ_WRONG_PAYMENT_TRIGGER'; END IF;
 IF TG_OP='DELETE' THEN
   IF OLD.entity='payments' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_PAYMENT_HARD_DELETE_DENIED'; END IF;
   RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.entity IS DISTINCT FROM OLD.entity) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_RECORD_IDENTITY_IMMUTABLE';
 END IF;
 IF NEW.entity<>'payments' THEN RETURN NEW; END IF;
 actor_role:=public.nitaq_role();
 IF auth.uid() IS NULL OR actor_role IS NULL OR actor_role NOT IN ('owner','accountant') THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_PAYMENT_WRITE_DENIED';
 END IF;
 new_data:=NEW.data;
 IF jsonb_typeof(new_data) IS DISTINCT FROM 'object' OR new_data->>'id' IS DISTINCT FROM NEW.id
    OR jsonb_typeof(new_data->'amount') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYMENT_DATA_INVALID';
 END IF;
 -- ↓↓↓ التعديل الوحيد: أضفنا 'ملغاة' إلى قائمة الحالات المسموحة ↓↓↓
 IF (new_data->>'amount')::numeric<0 OR COALESCE(new_data->>'status','') NOT IN ('مدفوعة','مدفوعة جزئياً','معلقة','متأخرة','ملغاة') THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYMENT_AMOUNT_OR_STATUS_INVALID';
 END IF;
 IF new_data->>'status'='مدفوعة جزئياً' THEN
   IF jsonb_typeof(new_data->'collectedAmount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYMENT_PARTIAL_INVALID'; END IF;
   IF (new_data->>'collectedAmount')::numeric<=0 OR (new_data->>'collectedAmount')::numeric>(new_data->>'amount')::numeric THEN
     RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYMENT_PARTIAL_INVALID';
   END IF;
 END IF;
 IF (new_data ? 'archived' AND jsonb_typeof(new_data->'archived') IS DISTINCT FROM 'boolean')
    OR (new_data ? 'cancelled' AND jsonb_typeof(new_data->'cancelled') IS DISTINCT FROM 'boolean') THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYMENT_ARCHIVE_FLAG_INVALID';
 END IF;
 new_archived:=((new_data->'archived'='true'::jsonb OR new_data->'cancelled'='true'::jsonb) IS TRUE);
 IF TG_OP='UPDATE' THEN
   old_data:=OLD.data;
   old_archived:=((old_data->'archived'='true'::jsonb OR old_data->'cancelled'='true'::jsonb) IS TRUE);
   IF NOT old_archived THEN
     IF old_data->>'status'='مدفوعة' AND jsonb_typeof(old_data->'amount')='number' THEN old_net:=(old_data->>'amount')::numeric;
     ELSIF old_data->>'status'='مدفوعة جزئياً' AND jsonb_typeof(old_data->'collectedAmount')='number' THEN old_net:=(old_data->>'collectedAmount')::numeric; END IF;
   END IF;
   archive_changed:=(old_archived IS DISTINCT FROM new_archived);
 END IF;
 IF NOT new_archived THEN
   new_net:=CASE WHEN new_data->>'status'='مدفوعة' THEN (new_data->>'amount')::numeric WHEN new_data->>'status'='مدفوعة جزئياً' THEN (new_data->>'collectedAmount')::numeric ELSE 0 END;
 END IF;
 IF new_archived AND (old_net>0 OR new_net>0 OR (new_data->>'status' IN ('مدفوعة','مدفوعة جزئياً') AND
    CASE WHEN new_data->>'status'='مدفوعة' THEN (new_data->>'amount')::numeric ELSE (new_data->>'collectedAmount')::numeric END>0)) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_PAYMENT_COLLECTED_ARCHIVE_DENIED';
 END IF;
 IF TG_OP='INSERT' AND new_archived THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_PAYMENT_CREATE_ARCHIVED_DENIED'; END IF;
 old_account:=COALESCE(NULLIF(old_data->>'account',''),CASE WHEN old_data->>'method'='نقداً' THEN 'الخزينة' ELSE 'البنك' END);
 new_account:=COALESCE(NULLIF(new_data->>'account',''),CASE WHEN new_data->>'method'='نقداً' THEN 'الخزينة' ELSE 'البنك' END);
 IF TG_OP='UPDATE' THEN
   structural:=(COALESCE(old_data->>'invoiceNo','')<>'' OR COALESCE(old_data->>'receiptNo','')<>'' OR old_net>0)
     AND EXISTS(SELECT 1 FROM unnest(ARRAY['projectId','contractId','phase','taxable','amount','label','month','date','dueDate']) k WHERE old_data->k IS DISTINCT FROM new_data->k);
   documents:=EXISTS(SELECT 1 FROM unnest(ARRAY['invoiceNo','receiptNo']) k WHERE COALESCE(old_data->>k,'')<>'' AND old_data->k IS DISTINCT FROM new_data->k)
      OR (old_data->'docSnapshot' IS NOT NULL AND old_data->'docSnapshot'<>'null'::jsonb AND old_data->'docSnapshot' IS DISTINCT FROM new_data->'docSnapshot');
   normal_increase:=new_net>old_net AND new_data->'amount' IS NOT DISTINCT FROM old_data->'amount'
      AND new_data->'taxable' IS NOT DISTINCT FROM old_data->'taxable' AND new_account=old_account
      AND COALESCE(old_data->>'method','')=COALESCE(new_data->>'method','');
   collection:=old_net>0 AND NOT normal_increase AND (new_account<>old_account
      OR EXISTS(SELECT 1 FROM unnest(ARRAY['status','collectedAmount','paidDate','method','refNo']) k WHERE old_data->k IS DISTINCT FROM new_data->k));
   needs_correction:=archive_changed OR structural OR documents OR collection;
 END IF;
 IF new_net>0 AND (TG_OP='INSERT' OR old_net=0) THEN
   IF COALESCE(new_data->>'paidDate','')='' OR COALESCE(new_data->>'method','') NOT IN ('نقداً','شيك','تحويل بنكي','بطاقة') OR new_account NOT IN ('البنك','الخزينة') THEN
     RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYMENT_COLLECTION_DETAILS_REQUIRED';
   END IF;
 END IF;
 IF COALESCE(new_data->>'receiptNo','')<>'' AND (old_data->>'receiptNo') IS DISTINCT FROM (new_data->>'receiptNo') AND new_net<=0 THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_PAYMENT_RECEIPT_WITHOUT_COLLECTION';
 END IF;
 IF TG_OP='INSERT' OR old_data->'projectId' IS DISTINCT FROM new_data->'projectId' OR old_data->'contractId' IS DISTINCT FROM new_data->'contractId' THEN
   IF NOT EXISTS(SELECT 1 FROM public.nitaq_records WHERE entity='projects' AND id=new_data->>'projectId') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYMENT_PROJECT_REQUIRED'; END IF;
   IF COALESCE(new_data->>'contractId','')<>'' AND NOT EXISTS(SELECT 1 FROM public.nitaq_records WHERE entity='contracts' AND id=new_data->>'contractId' AND data->>'projectId'=new_data->>'projectId') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_PAYMENT_CONTRACT_PROJECT_MISMATCH'; END IF;
 END IF;
 IF needs_correction THEN
   IF actor_role<>'owner' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_PAYMENT_CORRECTION_OWNER_REQUIRED'; END IF;
   meta:=new_data->'_financialCorrection';correction_id:=meta->>'id';reason:=btrim(meta->>'reason');
   IF jsonb_typeof(meta) IS DISTINCT FROM 'object' OR meta->>'kind' IS DISTINCT FROM 'data_correction'
      OR jsonb_typeof(meta->'reason') IS DISTINCT FROM 'string' OR reason IS NULL OR length(reason) NOT BETWEEN 3 AND 500 OR reason !~ '[^[:space:]]'
      OR jsonb_typeof(meta->'id') IS DISTINCT FROM 'string' OR correction_id IS NULL OR length(correction_id) NOT BETWEEN 1 AND 128
      OR correction_id IS NOT DISTINCT FROM (old_data->'_financialCorrection'->>'id') THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_PAYMENT_FRESH_CORRECTION_REASON_REQUIRED';
   END IF;
   IF EXISTS(SELECT 1 FROM public.nitaq_financial_audit_v1 WHERE after_row#>>'{data,_financialCorrection,id}'=correction_id) THEN
     RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_PAYMENT_CORRECTION_TOKEN_REUSED';
   END IF;
 END IF;
 RETURN NEW;
END;
$$;


--
-- Name: FUNCTION nitaq_payment_guard_v1(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nitaq_payment_guard_v1() IS 'NITAQ_PAYMENT_CONTROLS_V1';


--
-- Name: nitaq_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from public.nitaq_profiles where user_id = auth.uid();
$$;


--
-- Name: nitaq_sync_apply_v1(text, text, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_sync_apply_v1(p_operation_id text, p_kind text, p_id text, p_entity text, p_data jsonb, p_expected jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  actor uuid:=auth.uid();
  request_doc jsonb;
  previous_receipt public.nitaq_sync_receipts_v1%ROWTYPE;
  current_record public.nitaq_records%ROWTYPE;
  final_record public.nitaq_records%ROWTYPE;
  record_exists boolean;
  response_doc jsonb;
  changed integer;
BEGIN
  IF actor IS NULL OR public.nitaq_role() IS NULL OR public.nitaq_role() NOT IN ('owner','accountant','engineer') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_AUTH_REQUIRED';
  END IF;
  IF p_operation_id IS NULL OR length(p_operation_id) NOT BETWEEN 1 AND 128
     OR p_id IS NULL OR length(p_id) NOT BETWEEN 1 AND 512
     OR p_entity IS NULL OR length(p_entity) NOT BETWEEN 1 AND 100
     OR p_kind IS NULL OR p_kind NOT IN ('upsert','delete') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BAD_REQUEST';
  END IF;
  IF p_kind='upsert' AND (p_data IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_DATA_OBJECT_REQUIRED';
  END IF;
  IF p_kind='upsert' AND p_data ? 'id' AND (p_data->>'id') IS DISTINCT FROM p_id THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_ID_MISMATCH';
  END IF;
  IF p_expected IS NOT NULL AND p_expected<>'null'::jsonb THEN
    IF jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
       OR NOT (p_expected ?& ARRAY['id','entity','data','updated_at'])
       OR (p_expected->>'id') IS DISTINCT FROM p_id
       OR (p_expected->>'entity') IS DISTINCT FROM p_entity
       OR jsonb_typeof(p_expected->'data') IS DISTINCT FROM 'object'
       OR nullif(p_expected->>'updated_at','') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_BAD_EXPECTED_SNAPSHOT';
    END IF;
  END IF;
  request_doc:=jsonb_build_object('kind',p_kind,'id',p_id,'entity',p_entity,'data',p_data,'expected',p_expected);
  -- Same operation is serialized per user; no duplicate replay after lost response.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_operation_id,0));
  SELECT * INTO previous_receipt FROM public.nitaq_sync_receipts_v1
    WHERE user_id=actor AND operation_id=p_operation_id;
  IF FOUND THEN
    IF previous_receipt.request IS DISTINCT FROM request_doc THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='NITAQ_OPERATION_ID_REUSED';
    END IF;
    RETURN previous_receipt.result||jsonb_build_object('replayed',true);
  END IF;
  -- Row locking and RLS operate with the caller's privileges, never postgres privileges.
  SELECT * INTO current_record FROM public.nitaq_records WHERE id=p_id FOR UPDATE;
  record_exists:=FOUND;
  IF record_exists THEN
    IF p_expected IS NULL OR p_expected='null'::jsonb
       OR current_record.entity IS DISTINCT FROM p_entity
       OR current_record.data IS DISTINCT FROM (p_expected->'data')
       OR current_record.updated_at IS DISTINCT FROM (p_expected->>'updated_at')::timestamptz THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='NITAQ_CONFLICT',DETAIL='Server row changed. Preserve local edits and reload before resolving.';
    END IF;
  ELSIF p_expected IS NOT NULL AND p_expected<>'null'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='NITAQ_CONFLICT_OR_NOT_VISIBLE',DETAIL='Row was removed or is not accessible. No write performed.';
  END IF;
  IF p_kind='delete' THEN
    IF NOT record_exists THEN
      RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='NITAQ_DELETE_NOT_CONFIRMED';
    END IF;
    DELETE FROM public.nitaq_records WHERE id=p_id;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed<>1 THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_DELETE_DENIED'; END IF;
    response_doc:=jsonb_build_object('ok',true,'operation_id',p_operation_id,'kind','delete','id',p_id,'entity',p_entity,'replayed',false);
  ELSE
    IF record_exists THEN
      UPDATE public.nitaq_records SET data=p_data WHERE id=p_id RETURNING * INTO final_record;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_UPDATE_DENIED'; END IF;
    ELSE
      BEGIN
        INSERT INTO public.nitaq_records(id,entity,data) VALUES(p_id,p_entity,p_data) RETURNING * INTO final_record;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_INSERT_DENIED'; END IF;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='NITAQ_CONFLICT_OR_NOT_VISIBLE';
      END;
    END IF;
    response_doc:=jsonb_build_object('ok',true,'operation_id',p_operation_id,'kind','upsert','id',p_id,'entity',p_entity,'row',to_jsonb(final_record),'replayed',false);
  END IF;
  INSERT INTO public.nitaq_sync_receipts_v1(user_id,operation_id,request,result)
    VALUES(actor,p_operation_id,request_doc,response_doc);
  RETURN response_doc;
END;
$$;


--
-- Name: FUNCTION nitaq_sync_apply_v1(p_operation_id text, p_kind text, p_id text, p_entity text, p_data jsonb, p_expected jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nitaq_sync_apply_v1(p_operation_id text, p_kind text, p_id text, p_entity text, p_data jsonb, p_expected jsonb) IS 'NITAQ_SYNC_V1_RPC';


--
-- Name: nitaq_sync_capabilities_v1(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_sync_capabilities_v1() RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR public.nitaq_role() NOT IN ('owner','accountant','engineer') OR public.nitaq_role() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='NITAQ_AUTH_REQUIRED';
  END IF;
  RETURN jsonb_build_object('protocol',1,'expected_mode','row_snapshot','idempotent',true,'rls_preserved',true,'financial_controls',1,'financial_scope','payments','financial_bundle',1,'directory_privacy',true);
END;
$$;


--
-- Name: FUNCTION nitaq_sync_capabilities_v1(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.nitaq_sync_capabilities_v1() IS 'NITAQ_SYNC_V1_RPC';


--
-- Name: nitaq_touch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_touch() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: nitaq_financial_audit_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nitaq_financial_audit_v1 (
    event_id bigint NOT NULL,
    occurred_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    transaction_id bigint NOT NULL,
    actor_user_id uuid,
    actor_role text,
    database_role text,
    operation text NOT NULL,
    record_id text NOT NULL,
    record_entity text NOT NULL,
    before_row jsonb,
    after_row jsonb,
    reason_as_supplied text,
    CONSTRAINT nitaq_financial_audit_v1_operation_check CHECK ((operation = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: TABLE nitaq_financial_audit_v1; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.nitaq_financial_audit_v1 IS 'NITAQ_FINANCIAL_AUDIT_V1';


--
-- Name: nitaq_financial_audit_v1_event_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.nitaq_financial_audit_v1 ALTER COLUMN event_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.nitaq_financial_audit_v1_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: nitaq_payroll_month_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nitaq_payroll_month_v1 (
    month text NOT NULL,
    record_id text NOT NULL,
    source_entity text NOT NULL,
    CONSTRAINT nitaq_payroll_month_v1_month_check CHECK ((month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'::text)),
    CONSTRAINT nitaq_payroll_month_v1_source_entity_check CHECK ((source_entity = ANY (ARRAY['officeExpenses'::text, 'treasury'::text])))
);


--
-- Name: TABLE nitaq_payroll_month_v1; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.nitaq_payroll_month_v1 IS 'NITAQ_PAYROLL_MONTH_V1';


--
-- Name: nitaq_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nitaq_profiles (
    user_id uuid NOT NULL,
    email text,
    name text,
    role text DEFAULT 'engineer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT nitaq_profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'accountant'::text, 'engineer'::text])))
);


--
-- Name: nitaq_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nitaq_records (
    id text NOT NULL,
    entity text NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);

ALTER TABLE ONLY public.nitaq_records REPLICA IDENTITY FULL;


--
-- Name: nitaq_sync_receipts_v1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nitaq_sync_receipts_v1 (
    user_id uuid NOT NULL,
    operation_id text NOT NULL,
    request jsonb NOT NULL,
    result jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT nitaq_sync_receipts_v1_operation_id_check CHECK (((length(operation_id) >= 1) AND (length(operation_id) <= 128))),
    CONSTRAINT nitaq_sync_receipts_v1_request_check CHECK ((jsonb_typeof(request) = 'object'::text)),
    CONSTRAINT nitaq_sync_receipts_v1_result_check CHECK ((jsonb_typeof(result) = 'object'::text))
);


--
-- Name: TABLE nitaq_sync_receipts_v1; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.nitaq_sync_receipts_v1 IS 'NITAQ_SYNC_V1_RECEIPTS';


--
-- Name: nitaq_financial_audit_v1 nitaq_financial_audit_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_financial_audit_v1
    ADD CONSTRAINT nitaq_financial_audit_v1_pkey PRIMARY KEY (event_id);


--
-- Name: nitaq_payroll_month_v1 nitaq_payroll_month_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_payroll_month_v1
    ADD CONSTRAINT nitaq_payroll_month_v1_pkey PRIMARY KEY (month);


--
-- Name: nitaq_payroll_month_v1 nitaq_payroll_month_v1_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_payroll_month_v1
    ADD CONSTRAINT nitaq_payroll_month_v1_record_id_key UNIQUE (record_id);


--
-- Name: nitaq_profiles nitaq_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_profiles
    ADD CONSTRAINT nitaq_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: nitaq_records nitaq_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_records
    ADD CONSTRAINT nitaq_records_pkey PRIMARY KEY (id);


--
-- Name: nitaq_sync_receipts_v1 nitaq_sync_receipts_v1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_sync_receipts_v1
    ADD CONSTRAINT nitaq_sync_receipts_v1_pkey PRIMARY KEY (user_id, operation_id);


--
-- Name: nitaq_financial_audit_correction_id_v1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nitaq_financial_audit_correction_id_v1 ON public.nitaq_financial_audit_v1 USING btree (((after_row #>> '{data,_financialCorrection,id}'::text[])));


--
-- Name: nitaq_records_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX nitaq_records_entity_idx ON public.nitaq_records USING btree (entity);


--
-- Name: nitaq_records nitaq_employee_directory_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nitaq_employee_directory_v1 AFTER INSERT OR UPDATE ON public.nitaq_records FOR EACH ROW WHEN ((new.entity = 'employees'::text)) EXECUTE FUNCTION public.nitaq_employee_directory_v1();


--
-- Name: nitaq_records nitaq_financial_audit_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nitaq_financial_audit_v1 AFTER INSERT OR DELETE OR UPDATE ON public.nitaq_records FOR EACH ROW EXECUTE FUNCTION public.nitaq_financial_audit_capture_v1();


--
-- Name: nitaq_records nitaq_financial_bundle_guard_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nitaq_financial_bundle_guard_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.nitaq_records FOR EACH ROW EXECUTE FUNCTION public.nitaq_financial_bundle_guard_v1();


--
-- Name: nitaq_records nitaq_payment_guard_v1; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nitaq_payment_guard_v1 BEFORE INSERT OR DELETE OR UPDATE ON public.nitaq_records FOR EACH ROW EXECUTE FUNCTION public.nitaq_payment_guard_v1();


--
-- Name: nitaq_records nitaq_records_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER nitaq_records_touch BEFORE INSERT OR UPDATE ON public.nitaq_records FOR EACH ROW EXECUTE FUNCTION public.nitaq_touch();


--
-- Name: nitaq_profiles nitaq_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_profiles
    ADD CONSTRAINT nitaq_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: nitaq_records nitaq_records_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_records
    ADD CONSTRAINT nitaq_records_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: nitaq_sync_receipts_v1 nitaq_sync_receipts_v1_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_sync_receipts_v1
    ADD CONSTRAINT nitaq_sync_receipts_v1_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: nitaq_records nitaq_bundle_private_read_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_bundle_private_read_v1 ON public.nitaq_records AS RESTRICTIVE FOR SELECT TO authenticated USING (((public.nitaq_role() = ANY (ARRAY['owner'::text, 'accountant'::text])) OR ((public.nitaq_role() = 'engineer'::text) AND (entity = ANY (ARRAY['projects'::text, 'contracts'::text, 'decisions'::text, 'govFees'::text, 'cars'::text, 'staffDir'::text])))));


--
-- Name: nitaq_financial_audit_v1 nitaq_financial_audit_read_v1; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_financial_audit_read_v1 ON public.nitaq_financial_audit_v1 FOR SELECT TO authenticated USING ((public.nitaq_role() = ANY (ARRAY['owner'::text, 'accountant'::text])));


--
-- Name: nitaq_financial_audit_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nitaq_financial_audit_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: nitaq_payroll_month_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nitaq_payroll_month_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: nitaq_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nitaq_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: nitaq_profiles nitaq_profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_profiles_select ON public.nitaq_profiles FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: nitaq_profiles nitaq_profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_profiles_update ON public.nitaq_profiles FOR UPDATE USING ((public.nitaq_role() = 'owner'::text));


--
-- Name: nitaq_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nitaq_records ENABLE ROW LEVEL SECURITY;

--
-- Name: nitaq_records nitaq_records_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_records_delete ON public.nitaq_records FOR DELETE USING (((public.nitaq_role() = 'owner'::text) OR ((public.nitaq_role() = 'accountant'::text) AND (entity = ANY (ARRAY['payments'::text, 'govFees'::text, 'officeExpenses'::text, 'projectCosts'::text, 'treasury'::text, 'overtime'::text, 'advances'::text, 'decisions'::text]))) OR ((public.nitaq_role() = 'engineer'::text) AND (entity = 'decisions'::text))));


--
-- Name: nitaq_records nitaq_records_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_records_insert ON public.nitaq_records FOR INSERT WITH CHECK (((public.nitaq_role() = ANY (ARRAY['owner'::text, 'accountant'::text])) OR ((public.nitaq_role() = 'engineer'::text) AND (entity = ANY (ARRAY['projects'::text, 'contracts'::text, 'decisions'::text, 'govFees'::text])))));


--
-- Name: nitaq_records nitaq_records_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_records_select ON public.nitaq_records FOR SELECT USING (((public.nitaq_role() = ANY (ARRAY['owner'::text, 'accountant'::text])) OR ((public.nitaq_role() = 'engineer'::text) AND (entity = ANY (ARRAY['projects'::text, 'contracts'::text, 'decisions'::text, 'govFees'::text, 'cars'::text, 'staffDir'::text])))));


--
-- Name: nitaq_records nitaq_records_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_records_update ON public.nitaq_records FOR UPDATE USING (((public.nitaq_role() = ANY (ARRAY['owner'::text, 'accountant'::text])) OR ((public.nitaq_role() = 'engineer'::text) AND (entity = ANY (ARRAY['projects'::text, 'contracts'::text, 'decisions'::text, 'govFees'::text])))));


--
-- Name: nitaq_sync_receipts_v1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nitaq_sync_receipts_v1 ENABLE ROW LEVEL SECURITY;

--
-- Name: nitaq_sync_receipts_v1 nitaq_sync_v1_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_sync_v1_insert_own ON public.nitaq_sync_receipts_v1 FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: nitaq_sync_receipts_v1 nitaq_sync_v1_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY nitaq_sync_v1_select_own ON public.nitaq_sync_receipts_v1 FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: supabase_realtime nitaq_records; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.nitaq_records;


--
-- PostgreSQL database dump complete
--

\unrestrict ZUKxqp2nsGvRMDxDczB6TDamWhNc5wVxr7K3YEeIiQvguYLUeIP11PVjpXUNhzB

