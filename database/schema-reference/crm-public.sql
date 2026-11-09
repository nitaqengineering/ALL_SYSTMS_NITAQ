--
-- PostgreSQL database dump
--

\restrict h85aaldmXl7VVIqire3MnJhe3uynsUsuOcoT8FzokTG6oT5NPW6LYqFrivGklLQ

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
-- Name: nitaq_handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  existing_id text;
  cnt int;
begin
  select id into existing_id from nitaq_crm_profiles
    where lower(email) = lower(new.email) and auth_user_id is null limit 1;

  if existing_id is not null then
    update nitaq_crm_profiles set auth_user_id = new.id, active = true where id = existing_id;
  else
    select count(*) into cnt from nitaq_crm_profiles;
    insert into nitaq_crm_profiles (id, auth_user_id, name, email, role, active)
    values (
      gen_random_uuid()::text,
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
      new.email,
      case when cnt = 0 then 'owner' else 'engineer' end,
      true
    );
  end if;
  return new;
end;
$$;


--
-- Name: nitaq_is_active_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_is_active_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(select 1 from nitaq_crm_profiles where auth_user_id = auth.uid() and active = true)
$$;


--
-- Name: nitaq_lead_is_mine(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_lead_is_mine(p_lead_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists(
    select 1 from nitaq_crm_records lr
    where lr.entity = 'lead' and lr.data->>'id' = p_lead_id
      and (lr.data->>'ownerId' = nitaq_my_profile_id() or lr.data->>'engineerId' = nitaq_my_profile_id())
  )
$$;


--
-- Name: nitaq_my_profile_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_my_profile_id() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from nitaq_crm_profiles where auth_user_id = auth.uid() and active = true limit 1
$$;


--
-- Name: nitaq_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_my_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from nitaq_crm_profiles where auth_user_id = auth.uid() and active = true limit 1
$$;


--
-- Name: nitaq_see_all(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nitaq_see_all() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(role = 'owner' or (perms->>'seeAll')::boolean, false)
  from nitaq_crm_profiles where auth_user_id = auth.uid() and active = true limit 1
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: nitaq_crm_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nitaq_crm_profiles (
    id text NOT NULL,
    auth_user_id uuid,
    name text NOT NULL,
    email text,
    role text DEFAULT 'engineer'::text NOT NULL,
    perms jsonb DEFAULT '{"del": false, "dash": false, "data": false, "assign": false, "groups": true, "seeAll": false, "editAll": false, "lookups": false, "reports": false}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nitaq_crm_profiles_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'engineer'::text])))
);


--
-- Name: nitaq_crm_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nitaq_crm_records (
    id text NOT NULL,
    entity text NOT NULL,
    data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nitaq_crm_records_entity_check CHECK ((entity = ANY (ARRAY['client'::text, 'lead'::text, 'inter'::text, 'audit'::text, 'settings'::text])))
);


--
-- Name: nitaq_crm_profiles nitaq_crm_profiles_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_crm_profiles
    ADD CONSTRAINT nitaq_crm_profiles_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: nitaq_crm_profiles nitaq_crm_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_crm_profiles
    ADD CONSTRAINT nitaq_crm_profiles_pkey PRIMARY KEY (id);


--
-- Name: nitaq_crm_records nitaq_crm_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_crm_records
    ADD CONSTRAINT nitaq_crm_records_pkey PRIMARY KEY (id);


--
-- Name: idx_nitaq_crm_records_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nitaq_crm_records_entity ON public.nitaq_crm_records USING btree (entity);


--
-- Name: idx_nitaq_crm_records_inter_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nitaq_crm_records_inter_lead ON public.nitaq_crm_records USING btree (((data ->> 'leadId'::text))) WHERE (entity = 'inter'::text);


--
-- Name: idx_nitaq_crm_records_lead_engineer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nitaq_crm_records_lead_engineer ON public.nitaq_crm_records USING btree (((data ->> 'engineerId'::text))) WHERE (entity = 'lead'::text);


--
-- Name: idx_nitaq_crm_records_lead_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nitaq_crm_records_lead_owner ON public.nitaq_crm_records USING btree (((data ->> 'ownerId'::text))) WHERE (entity = 'lead'::text);


--
-- Name: nitaq_crm_profiles nitaq_crm_profiles_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nitaq_crm_profiles
    ADD CONSTRAINT nitaq_crm_profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: nitaq_crm_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nitaq_crm_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: nitaq_crm_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nitaq_crm_records ENABLE ROW LEVEL SECURITY;

--
-- Name: nitaq_crm_profiles profiles_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_delete_owner ON public.nitaq_crm_profiles FOR DELETE USING ((public.nitaq_my_role() = 'owner'::text));


--
-- Name: nitaq_crm_profiles profiles_insert_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_owner ON public.nitaq_crm_profiles FOR INSERT WITH CHECK ((public.nitaq_my_role() = 'owner'::text));


--
-- Name: nitaq_crm_profiles profiles_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select ON public.nitaq_crm_profiles FOR SELECT USING (public.nitaq_is_active_user());


--
-- Name: nitaq_crm_profiles profiles_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_owner ON public.nitaq_crm_profiles FOR UPDATE USING ((public.nitaq_my_role() = 'owner'::text)) WITH CHECK (true);


--
-- Name: nitaq_crm_profiles profiles_update_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_self ON public.nitaq_crm_profiles FOR UPDATE USING ((auth_user_id = auth.uid())) WITH CHECK ((auth_user_id = auth.uid()));


--
-- Name: nitaq_crm_records records_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY records_delete ON public.nitaq_crm_records FOR DELETE USING ((public.nitaq_is_active_user() AND ((public.nitaq_my_role() = 'owner'::text) OR (EXISTS ( SELECT 1
   FROM public.nitaq_crm_profiles
  WHERE ((nitaq_crm_profiles.auth_user_id = auth.uid()) AND ((nitaq_crm_profiles.perms ->> 'del'::text))::boolean))) OR ((entity = 'inter'::text) AND public.nitaq_lead_is_mine((data ->> 'leadId'::text))))));


--
-- Name: nitaq_crm_records records_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY records_insert ON public.nitaq_crm_records FOR INSERT WITH CHECK ((public.nitaq_is_active_user() AND ((entity = ANY (ARRAY['client'::text, 'audit'::text, 'inter'::text])) OR (entity = 'lead'::text) OR ((entity = 'settings'::text) AND ((public.nitaq_my_role() = 'owner'::text) OR (EXISTS ( SELECT 1
   FROM public.nitaq_crm_profiles
  WHERE ((nitaq_crm_profiles.auth_user_id = auth.uid()) AND ((nitaq_crm_profiles.perms ->> 'lookups'::text))::boolean))))))));


--
-- Name: nitaq_crm_records records_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY records_select ON public.nitaq_crm_records FOR SELECT USING ((public.nitaq_is_active_user() AND ((entity = ANY (ARRAY['client'::text, 'settings'::text])) OR public.nitaq_see_all() OR ((entity = 'lead'::text) AND (((data ->> 'ownerId'::text) = public.nitaq_my_profile_id()) OR ((data ->> 'engineerId'::text) = public.nitaq_my_profile_id()))) OR ((entity = 'audit'::text) AND ((data ->> 'byId'::text) = public.nitaq_my_profile_id())) OR ((entity = 'inter'::text) AND public.nitaq_lead_is_mine((data ->> 'leadId'::text))))));


--
-- Name: nitaq_crm_records records_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY records_update ON public.nitaq_crm_records FOR UPDATE USING ((public.nitaq_is_active_user() AND ((entity = 'client'::text) OR public.nitaq_see_all() OR ((entity = 'lead'::text) AND (((data ->> 'ownerId'::text) = public.nitaq_my_profile_id()) OR ((data ->> 'engineerId'::text) = public.nitaq_my_profile_id()))) OR ((entity = 'settings'::text) AND ((public.nitaq_my_role() = 'owner'::text) OR (EXISTS ( SELECT 1
   FROM public.nitaq_crm_profiles
  WHERE ((nitaq_crm_profiles.auth_user_id = auth.uid()) AND ((nitaq_crm_profiles.perms ->> 'lookups'::text))::boolean)))))))) WITH CHECK (true);


--
-- Name: supabase_realtime nitaq_crm_profiles; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.nitaq_crm_profiles;


--
-- Name: supabase_realtime nitaq_crm_records; Type: PUBLICATION TABLE; Schema: public; Owner: -
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.nitaq_crm_records;


--
-- PostgreSQL database dump complete
--

\unrestrict h85aaldmXl7VVIqire3MnJhe3uynsUsuOcoT8FzokTG6oT5NPW6LYqFrivGklLQ

