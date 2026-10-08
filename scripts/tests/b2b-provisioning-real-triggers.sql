-- Live trigger bodies, read-only verified 2026-10-08; reduced DDL, not full Auth transport.
CREATE SCHEMA cf_user_guards_v1;
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY, revision bigint NOT NULL);
INSERT INTO cf_user_guards_v1.state VALUES(true,0);
ALTER TABLE public.profiles ADD COLUMN id uuid DEFAULT gen_random_uuid(), ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN data_admissao date, ADD COLUMN observacoes_internas text;
ALTER TYPE public.app_role ADD VALUE 'superadmin';
ALTER TYPE public.app_role ADD VALUE 'cliente_produtor';
CREATE FUNCTION cf_user_guards_v1.acquire_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass,'auth.users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL THEN RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION cf_user_guards_v1.advance_stamp() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond'); RETURN NEW; END $$;
CREATE FUNCTION cf_user_guards_v1.touch_related_profiles() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_id uuid; new_id uuid; item uuid;
BEGIN
 IF TG_LEVEL<>'ROW' OR TG_RELID NOT IN ('public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'INSERT' THEN old_id:=OLD.user_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.user_id; END IF;
 FOR item IN SELECT DISTINCT x FROM unnest(ARRAY[old_id,new_id]) x WHERE x IS NOT NULL ORDER BY x LOOP UPDATE public.profiles SET updated_at=updated_at WHERE user_id=item; END LOOP;
 RETURN NULL;
END $$;
CREATE FUNCTION cf_user_guards_v1.require_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r USING(user_id) WHERE p.ativo IS TRUE AND r.role='administrador') THEN RAISE EXCEPTION 'user_last_active_admin' USING ERRCODE='PT409'; END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION public.guard_profile_sensitive_fields() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF; IF public.has_role(auth.uid(),'administrador'::public.app_role) THEN RETURN NEW; END IF; IF TG_OP='INSERT' THEN IF NEW.ativo IS DISTINCT FROM true OR NEW.cliente_id IS NOT NULL OR NEW.organization_id IS NOT NULL OR NEW.data_admissao IS NOT NULL OR NEW.observacoes_internas IS NOT NULL THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF; ELSE IF OLD.ativo IS NOT TRUE OR ROW(NEW.id,NEW.user_id,NEW.email,NEW.ativo,NEW.cliente_id,NEW.organization_id,NEW.created_at,NEW.data_admissao,NEW.observacoes_internas) IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.email,OLD.ativo,OLD.cliente_id,OLD.organization_id,OLD.created_at,OLD.data_admissao,OLD.observacoes_internas) THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF; END IF; RETURN NEW; END $$;
-- Existing ticket dependency: no conclusion path is exercised here.
CREATE FUNCTION platform_private.has_ticket(text,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.guard_profile_senha_provisoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.senha_provisoria IS TRUE THEN
      RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria THEN
    RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.guard_profile_senha_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF session_user = 'authenticator'
     AND OLD.senha_provisoria IS TRUE AND NEW.senha_provisoria IS DISTINCT FROM TRUE
     AND NOT platform_private.has_ticket('pwd_conclude', NEW.user_id) THEN
    RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING errcode='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.guard_profile_tenant_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() = OLD.user_id AND NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.guard_superadmin_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $fn$
DECLARE
  v_touches boolean := false;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.role = 'superadmin'::public.app_role THEN
    v_touches := true;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.role = 'superadmin'::public.app_role THEN
    v_touches := true;
  END IF;

  IF v_touches AND current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'superadmin_role_reserved'
      USING ERRCODE = '42501',
            HINT = 'O papel de plataforma so pode ser atribuido ou removido pelo mecanismo interno.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.h15_profile_organization_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $h15$
BEGIN
 IF current_setting('role',true) IN ('authenticated','anon') THEN
 IF TG_OP='INSERT' THEN
 IF NEW.organization_id IS NOT NULL THEN RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
 RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501';
 END IF;
 END IF;
 RETURN NEW;
END $h15$;
CREATE OR REPLACE FUNCTION public.enforce_cliente_id_for_produtor()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_role app_role;
  v_count int;
BEGIN
  -- Lógica específica para a tabela user_roles
  IF TG_TABLE_NAME = 'user_roles' THEN
    -- Aqui o record NEW possui o campo 'role'
    IF NEW.role = 'cliente_produtor' THEN
      SELECT count(*) INTO v_count
        FROM public.user_clientes WHERE user_id = NEW.user_id;
      IF v_count = 0 THEN
        RAISE EXCEPTION 'Para a função "Produtor (Portal)" é obrigatório vincular o usuário a pelo menos um cliente.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Lógica específica para a tabela user_clientes (que não possui campo 'role')
  IF TG_TABLE_NAME = 'user_clientes' THEN
    v_user := COALESCE(NEW.user_id, OLD.user_id);
    
    -- Verifica se o usuário tem a role de produtor
    SELECT role INTO v_role FROM public.user_roles
      WHERE user_id = v_user AND role = 'cliente_produtor' LIMIT 1;
      
    IF v_role IS NOT NULL THEN
      -- Conta quantos vínculos restariam após a operação
      IF TG_OP = 'DELETE' THEN
        SELECT count(*) INTO v_count FROM public.user_clientes
          WHERE user_id = v_user AND id <> OLD.id;
      ELSE
        SELECT count(*) INTO v_count FROM public.user_clientes
          WHERE user_id = v_user;
      END IF;

      IF v_count = 0 THEN
        RAISE EXCEPTION 'Este usuário é Produtor e precisa permanecer vinculado a pelo menos um cliente.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;$$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR UPDATE OR DELETE ON public.partner_users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR UPDATE OR DELETE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR UPDATE OR DELETE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
CREATE TRIGGER guard_profile_senha_provisoria BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_senha_provisoria();
CREATE TRIGGER guard_profile_sensitive_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_sensitive_fields();
CREATE TRIGGER h15_profile_organization_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.h15_profile_organization_guard();
CREATE TRIGGER guard_profile_senha_ticket BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_senha_ticket();
CREATE TRIGGER guard_profile_tenant_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_tenant_fields();
CREATE TRIGGER update_updated_at_column BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER z99_cf_profile_stamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp();
CREATE TRIGGER trg_guard_superadmin_role_assignment BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.guard_superadmin_role_assignment();
CREATE TRIGGER trg_user_roles_enforce_cliente BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_cliente_id_for_produtor();
CREATE TRIGGER trg_profiles_enforce_cliente BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_cliente_id_for_produtor();
