-- Costuras SINTÉTICAS para PostgreSQL descartável. Não são prova de JWT/RLS/Auth hospedados.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA cf_user_guards_v1;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA platform_private TO service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO PUBLIC;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE TYPE public.app_role AS ENUM ('superadmin','administrador','gestor','administrativo','financeiro','gestor_comercial','producao','aplicador','operador_onfarm','consultor_tecnico','tecnico_agronomo','vendedor','cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico');
CREATE TYPE public.access_level_tecnico AS ENUM ('read','execute','manage');
CREATE TABLE public.profiles (id uuid DEFAULT gen_random_uuid(), user_id uuid PRIMARY KEY, nome text, email text, ativo boolean DEFAULT true, organization_id uuid);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE (user_id, role));
CREATE TABLE public.clientes (id uuid PRIMARY KEY, nome text, razao_social text, organization_id uuid);
-- Capturado (estrutura) de produção:
CREATE TABLE public.user_clientes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  principal boolean DEFAULT false, created_at timestamptz DEFAULT now(), is_active boolean DEFAULT true, access_level public.access_level_tecnico DEFAULT 'read',
  assigned_by uuid, valid_from timestamptz DEFAULT now(), valid_until timestamptz, revoked_at timestamptz, revoked_by uuid, UNIQUE (user_id, cliente_id));
CREATE UNIQUE INDEX uq_user_clientes_principal ON public.user_clientes (user_id) WHERE principal = true;
CREATE TABLE public.partner_accounts (id uuid PRIMARY KEY, ativo boolean DEFAULT true, deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, user_id uuid, papel text, revoked_at timestamptz, revoked_by uuid, revoke_reason text, tenant_id uuid);
-- Capturado (corpo) de produção, com platform_actor_access_ready simplificado:
CREATE FUNCTION platform_private.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo IS TRUE) $$;
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$ SELECT platform_private.has_role(_user_id,_role) $$;
CREATE FUNCTION public.is_platform_superadmin(_u uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_u AND role='superadmin') $$;
CREATE FUNCTION platform_private.is_same_tenant_user(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles a JOIN public.profiles b ON a.organization_id=b.organization_id WHERE a.user_id=auth.uid() AND b.user_id=p) $$;
CREATE FUNCTION platform_private.is_tenant_admin_for_user(p_target_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'administrador'::public.app_role)
     AND NOT public.is_platform_superadmin(auth.uid()) AND NOT public.is_platform_superadmin(p_target_user_id)
     AND platform_private.is_same_tenant_user(p_target_user_id) $$;
CREATE FUNCTION public.fn_authz_uid_scope_ok(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NULL OR (_uid IS NOT NULL AND _uid = auth.uid()) OR public.has_role(auth.uid(), 'administrador'::app_role) $$;
CREATE FUNCTION public.has_active_user_cliente_access(_user_id uuid, _cliente_id uuid, _levels text[] DEFAULT ARRAY['read','execute','manage']) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN RETURN false; END IF;
  IF NOT public.fn_authz_uid_scope_ok(_user_id) THEN RETURN false; END IF;
  IF public.has_role(_user_id, 'administrador'::public.app_role) THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.user_clientes uc WHERE uc.user_id=_user_id AND uc.cliente_id=_cliente_id AND uc.is_active AND uc.revoked_at IS NULL
     AND (uc.valid_from IS NULL OR uc.valid_from <= now()) AND (uc.valid_until IS NULL OR uc.valid_until >= now()) AND uc.access_level::text = ANY(_levels));
END $$;
-- Gatilhos capturados: require_admin (statement) e enforce_cliente_id_for_produtor (parte user_roles).
CREATE FUNCTION cf_user_guards_v1.require_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r USING(user_id) WHERE p.ativo IS TRUE AND r.role='administrador') THEN RAISE EXCEPTION 'user_last_active_admin' USING ERRCODE='PT409'; END IF; RETURN NULL; END $$;
CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
CREATE FUNCTION public.enforce_cliente_id_for_produtor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN IF NEW.role='cliente_produtor' AND NOT EXISTS (SELECT 1 FROM public.user_clientes WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'produtor_sem_cliente' USING ERRCODE='check_violation'; END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_user_roles_enforce_cliente BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.enforce_cliente_id_for_produtor();
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
