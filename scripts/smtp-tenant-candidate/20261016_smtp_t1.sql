-- REVIEW ONLY — canonical swzpzcwiasxmjutrmvkm; no automatic application.
-- Additive DRAFT-only foundation. No worker/runtime, Auth or global-setting mutations.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('platform_private.platform_actor_access_ready(uuid)') IS NULL
 OR to_regprocedure('public.is_platform_superadmin(uuid)') IS NULL
 OR to_regprocedure('vault.create_secret(text,text,text,uuid)') IS NULL
 OR to_regprocedure('vault.update_secret(uuid,text,text,text,uuid)') IS NULL THEN
  RAISE EXCEPTION 'SMTP dependency unavailable';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('vault.create_secret(text,text,text,uuid)') AND pronargdefaults>=1)
 OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid=to_regprocedure('vault.update_secret(uuid,text,text,text,uuid)') AND pronargdefaults>=1)
 OR NOT has_function_privilege(current_user,'vault.create_secret(text,text,text,uuid)','EXECUTE')
 OR NOT has_function_privilege(current_user,'vault.update_secret(uuid,text,text,text,uuid)','EXECUTE')
 OR NOT has_schema_privilege('authenticated','platform_private','USAGE') THEN
  RAISE EXCEPTION 'SMTP dependency ACL/default unavailable';
 END IF;
END $preflight$;

CREATE TABLE IF NOT EXISTS public.communication_tenant_email_settings (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 config jsonb NOT NULL,
 version bigint NOT NULL,
 credential_configured boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'DRAFT',
 sender_verified boolean NOT NULL DEFAULT false,
 dispatch_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.communication_tenant_email_settings TO authenticated;
GRANT ALL ON public.communication_tenant_email_settings TO service_role;
REVOKE ALL ON public.communication_tenant_email_settings FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.communication_tenant_email_settings FROM authenticated;
ALTER TABLE public.communication_tenant_email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_tenant_email_settings FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.communication_tenant_email_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 actor_id uuid NOT NULL,
 version bigint NOT NULL,
 action text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.communication_tenant_email_audit TO authenticated;
GRANT ALL ON public.communication_tenant_email_audit TO service_role;
REVOKE ALL ON public.communication_tenant_email_audit FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.communication_tenant_email_audit FROM authenticated;
ALTER TABLE public.communication_tenant_email_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_tenant_email_audit FORCE ROW LEVEL SECURITY;
GRANT USAGE, SELECT ON SEQUENCE public.communication_tenant_email_audit_id_seq TO service_role;

-- Private opaque references. No client/service grants or secret reader.
CREATE TABLE IF NOT EXISTS platform_private.communication_tenant_email_secret_refs (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
 secret_id uuid NOT NULL
);
REVOKE ALL ON platform_private.communication_tenant_email_secret_refs FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE platform_private.communication_tenant_email_secret_refs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION platform_private.tenant_email_actor_org()
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid;
BEGIN
 IF auth.uid() IS NULL OR public.is_platform_superadmin(auth.uid())
 OR platform_private.platform_actor_access_ready(auth.uid()) IS DISTINCT FROM true
 OR public.has_role(auth.uid(),'administrador'::public.app_role) IS DISTINCT FROM true THEN
  RETURN NULL;
 END IF;
 SELECT p.organization_id INTO v_org FROM public.profiles p
 JOIN public.organizations o ON o.id=p.organization_id
 WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE AND o.ativo IS TRUE;
 RETURN v_org;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_email_actor_org() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_email_actor_org() TO authenticated;

-- Separate persistent server fence: UI/Edge review flags alone cannot authorize
-- direct PostgREST credential submission before ACL/Vault/application-log review.
-- HTTPS + Vault accepted by owner; no infrastructure-log suppression guarantee.
CREATE TABLE IF NOT EXISTS platform_private.communication_tenant_email_review_gate (
 id boolean PRIMARY KEY DEFAULT true,
 approved boolean NOT NULL DEFAULT false
);
REVOKE ALL ON platform_private.communication_tenant_email_review_gate FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform_private.communication_tenant_email_review_gate ENABLE ROW LEVEL SECURITY;
INSERT INTO platform_private.communication_tenant_email_review_gate(id,approved) VALUES(true,false) ON CONFLICT(id) DO NOTHING;
CREATE OR REPLACE FUNCTION platform_private.tenant_email_require_review()
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_private.communication_tenant_email_review_gate WHERE id=true AND approved=true) THEN
  RAISE EXCEPTION 'SMTP_UNAVAILABLE' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_email_require_review() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION platform_private.tenant_email_settings_scope()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
 SELECT platform_private.tenant_email_actor_org() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION platform_private.tenant_email_settings_scope() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_email_settings_scope() TO authenticated;
CREATE OR REPLACE FUNCTION public.tenant_email_settings_scope()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT platform_private.tenant_email_settings_scope()
$$;
REVOKE ALL ON FUNCTION public.tenant_email_settings_scope() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_email_settings_scope() TO authenticated;

DROP POLICY IF EXISTS tenant_email_read ON public.communication_tenant_email_settings;
CREATE POLICY tenant_email_read ON public.communication_tenant_email_settings FOR SELECT TO authenticated
 USING (organization_id=platform_private.tenant_email_actor_org());
DROP POLICY IF EXISTS tenant_email_fence ON public.communication_tenant_email_settings;
CREATE POLICY tenant_email_fence ON public.communication_tenant_email_settings AS RESTRICTIVE FOR ALL TO authenticated
 USING (organization_id=platform_private.tenant_email_actor_org()) WITH CHECK (organization_id=platform_private.tenant_email_actor_org());
DROP POLICY IF EXISTS tenant_email_audit_read ON public.communication_tenant_email_audit;
CREATE POLICY tenant_email_audit_read ON public.communication_tenant_email_audit FOR SELECT TO authenticated
 USING (organization_id=platform_private.tenant_email_actor_org());
DROP POLICY IF EXISTS tenant_email_audit_fence ON public.communication_tenant_email_audit;
CREATE POLICY tenant_email_audit_fence ON public.communication_tenant_email_audit AS RESTRICTIVE FOR ALL TO authenticated
 USING (organization_id=platform_private.tenant_email_actor_org()) WITH CHECK (organization_id=platform_private.tenant_email_actor_org());

CREATE OR REPLACE FUNCTION platform_private.tenant_email_validate_config(p_config jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_key text; v text;
BEGIN
 IF p_config IS NULL OR jsonb_typeof(p_config)<>'object'
 OR (SELECT count(*) FROM jsonb_object_keys(p_config))<>7
 OR NOT p_config ?& ARRAY['host','port','tls_mode','username','from_email','reply_to','from_name'] THEN
  RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023';
 END IF;
 FOREACH v_key IN ARRAY ARRAY['host','tls_mode','username','from_email','reply_to','from_name'] LOOP
  IF jsonb_typeof(p_config->v_key)<>'string' THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
  v:=p_config->>v_key;
  IF length(v)>255 OR v ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 END LOOP;
 v:=p_config->>'host';
 IF length(v)>253 OR v !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$'
 OR v ~ '(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$'
 OR v ~ '(^|\.)(metadata|metadata\.google\.internal)$' THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p_config->'port')<>'number' OR (p_config->>'port')!~ '^[0-9]{1,5}$'
 OR (p_config->>'port')::int NOT BETWEEN 1 AND 65535 OR (p_config->>'port')::int=25
 OR p_config->>'tls_mode' NOT IN ('implicit_tls','starttls_required')
 OR length(p_config->>'username')=0 OR length(p_config->>'from_name')=0
 OR (p_config->>'from_email') !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$'
 OR ((p_config->>'reply_to')<>'' AND (p_config->>'reply_to') !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$') THEN
  RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023';
 END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_email_validate_config(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION platform_private.tenant_email_invariant()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 PERFORM platform_private.tenant_email_validate_config(NEW.config);
 IF NEW.state IS DISTINCT FROM 'DRAFT' OR NEW.sender_verified IS DISTINCT FROM false
 OR NEW.dispatch_enabled IS DISTINCT FROM false OR NEW.version<1
 OR (TG_OP='UPDATE' AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.version<>OLD.version+1)) THEN
  RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_email_invariant() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS tenant_email_invariant ON public.communication_tenant_email_settings;
CREATE TRIGGER tenant_email_invariant BEFORE INSERT OR UPDATE ON public.communication_tenant_email_settings
 FOR EACH ROW EXECUTE FUNCTION platform_private.tenant_email_invariant();

CREATE OR REPLACE FUNCTION platform_private.tenant_email_audit_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_email_audit_immutable() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS tenant_email_audit_immutable ON public.communication_tenant_email_audit;
CREATE TRIGGER tenant_email_audit_immutable BEFORE UPDATE OR DELETE ON public.communication_tenant_email_audit
 FOR EACH ROW EXECUTE FUNCTION platform_private.tenant_email_audit_immutable();

CREATE OR REPLACE FUNCTION platform_private.tenant_email_settings_get()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; v_version bigint; v_config jsonb; v_credential_configured boolean;
BEGIN
 v_org:=platform_private.tenant_email_actor_org();
 IF v_org IS NULL THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT version,config,credential_configured INTO v_version,v_config,v_credential_configured
 FROM public.communication_tenant_email_settings WHERE organization_id=v_org;
 RETURN jsonb_build_object('ok',true,'version',coalesce(v_version,0),'config',v_config,
 'credential_configured',coalesce(v_credential_configured,false),'state','DRAFT','sender_verified',false,'dispatch_enabled',false);
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_email_settings_get() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_email_settings_get() TO authenticated;
CREATE OR REPLACE FUNCTION public.tenant_email_settings_get()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT platform_private.tenant_email_settings_get()
$$;
REVOKE ALL ON FUNCTION public.tenant_email_settings_get() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_email_settings_get() TO authenticated;

CREATE OR REPLACE FUNCTION platform_private.tenant_email_settings_save(p_expected_version bigint,p_config jsonb,p_password text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid; v_version bigint; v_secret uuid;
BEGIN
 v_org:=platform_private.tenant_email_actor_org();
 IF v_org IS NULL THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.tenant_email_require_review();
 IF p_expected_version IS NULL OR p_expected_version<0 OR p_expected_version>9007199254740991 THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM platform_private.tenant_email_validate_config(p_config);
 IF p_password IS NOT NULL AND (length(p_password)<1 OR length(p_password)>4096 OR p_password ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023'; END IF;
 -- Serializes first insertion and updates; hash collision only causes extra serialization.
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text,0));
 -- Prevent revoke/inactivation during a queued operation from writing.
 IF platform_private.tenant_email_actor_org() IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.tenant_email_require_review();
 SELECT version INTO v_version FROM public.communication_tenant_email_settings WHERE organization_id=v_org FOR UPDATE;
 v_version:=coalesce(v_version,0);
 IF p_expected_version<>v_version THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT secret_id INTO v_secret FROM platform_private.communication_tenant_email_secret_refs WHERE organization_id=v_org;
 IF v_secret IS NULL AND p_password IS NULL THEN RAISE EXCEPTION 'SMTP_CREDENTIAL_REQUIRED' USING ERRCODE='22023'; END IF;
 IF p_password IS NOT NULL THEN
  IF v_secret IS NULL THEN
   v_secret:=vault.create_secret(p_password,'tenant_email_'||v_org::text,'');
   INSERT INTO platform_private.communication_tenant_email_secret_refs VALUES(v_org,v_secret);
  ELSE
   PERFORM vault.update_secret(v_secret,p_password,'tenant_email_'||v_org::text,'');
  END IF;
 END IF;
 INSERT INTO public.communication_tenant_email_settings(organization_id,config,version,credential_configured)
 VALUES(v_org,p_config,v_version+1,true)
 ON CONFLICT(organization_id) DO UPDATE SET config=EXCLUDED.config,version=EXCLUDED.version,
 credential_configured=true,state='DRAFT',sender_verified=false,dispatch_enabled=false,updated_at=now();
 INSERT INTO public.communication_tenant_email_audit(organization_id,actor_id,version,action)
 VALUES(v_org,auth.uid(),v_version+1,CASE WHEN p_password IS NULL THEN 'draft_saved' ELSE 'credential_rotated' END);
 RETURN platform_private.tenant_email_settings_get();
EXCEPTION
 WHEN SQLSTATE '42501' THEN RAISE EXCEPTION 'SMTP_FORBIDDEN' USING ERRCODE='42501';
 WHEN SQLSTATE '40001' THEN RAISE EXCEPTION 'SMTP_CONFLICT' USING ERRCODE='40001';
 WHEN SQLSTATE '22023' THEN RAISE EXCEPTION 'SMTP_INVALID' USING ERRCODE='22023';
 WHEN OTHERS THEN RAISE EXCEPTION 'SMTP_INTERNAL' USING ERRCODE='P0001';
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_email_settings_save(bigint,jsonb,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION platform_private.tenant_email_settings_save(bigint,jsonb,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.tenant_email_settings_save(p_expected_version bigint,p_config jsonb,p_password text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT platform_private.tenant_email_settings_save(p_expected_version,p_config,p_password)
$$;
REVOKE ALL ON FUNCTION public.tenant_email_settings_save(bigint,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.tenant_email_settings_save(bigint,jsonb,text) TO authenticated;
CREATE OR REPLACE FUNCTION platform_private.tenant_email_review_fence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM platform_private.tenant_email_require_review();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.tenant_email_review_fence() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS tenant_email_review_fence ON public.communication_tenant_email_settings;
CREATE TRIGGER tenant_email_review_fence BEFORE INSERT OR UPDATE ON public.communication_tenant_email_settings
 FOR EACH ROW EXECUTE FUNCTION platform_private.tenant_email_review_fence();
COMMIT;
