-- Costuras SINTÉTICAS para PostgreSQL descartável. Não são prova de JWT/RLS/Auth hospedados.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA cf_user_guards_v1;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA platform_private TO service_role;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(auth.jwt()->>'sub', '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO PUBLIC;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_change text);
CREATE TYPE public.app_role AS ENUM ('superadmin','administrador','gestor','administrativo','financeiro','gestor_comercial','producao','aplicador','operador_onfarm','consultor_tecnico','tecnico_agronomo','vendedor','cliente_produtor','parceiro_b2b','parceiro_b2b_tecnico');
CREATE TYPE public.access_level_tecnico AS ENUM ('read','execute','manage');
-- profiles com as colunas capturadas de produção:
CREATE TABLE public.profiles (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid PRIMARY KEY, nome text NOT NULL DEFAULT '', email text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), telefone text, cargo text, cpf_cnpj text, ativo boolean NOT NULL DEFAULT true, cliente_id uuid, crea text, especialidade text, data_admissao date, observacoes_internas text, organization_id uuid, senha_provisoria boolean NOT NULL DEFAULT false);
CREATE TABLE public.platform_org_admin_invites (user_id uuid, access_operation_status text, access_valid_after timestamptz);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE (user_id, role));
CREATE TABLE public.clientes (id uuid PRIMARY KEY, nome text, razao_social text, organization_id uuid);
-- Capturado (estrutura) de produção:
CREATE TABLE public.user_clientes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  principal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), is_active boolean NOT NULL DEFAULT true, access_level public.access_level_tecnico NOT NULL DEFAULT 'execute',
  assigned_by uuid, valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz, revoked_at timestamptz, revoked_by uuid, UNIQUE (user_id, cliente_id));
CREATE UNIQUE INDEX uq_user_clientes_principal ON public.user_clientes (user_id) WHERE principal = true;
CREATE TABLE public.partner_accounts (id uuid PRIMARY KEY, ativo boolean DEFAULT true, deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL, user_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), papel text NOT NULL DEFAULT 'gestor', valid_from timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, revoked_by uuid, revoke_reason text, tenant_id uuid, version integer NOT NULL DEFAULT 1);
CREATE TABLE cf_user_guards_v1.state (singleton boolean PRIMARY KEY, revision bigint NOT NULL); INSERT INTO cf_user_guards_v1.state VALUES (true, 0);
CREATE TABLE platform_private.authz_tickets (txid bigint, scope text, target uuid); -- SINTÉTICO (só para has_ticket)
CREATE FUNCTION platform_private.has_ticket(_scope text, _target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$ SELECT EXISTS (SELECT 1 FROM platform_private.authz_tickets WHERE txid = txid_current() AND scope = _scope AND target = _target) $$; -- corpo capturado
-- Capturados (corpo) de produção 17/11/2026, verbatim:
CREATE OR REPLACE FUNCTION platform_private.platform_actor_access_ready(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE)
 AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND auth.uid()=p_user AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after)));
$function$
;
CREATE OR REPLACE FUNCTION platform_private.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id));
$function$
;
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$ SELECT platform_private.has_role(_user_id,_role) $$;
CREATE FUNCTION public.is_platform_superadmin(_u uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_u AND role='superadmin') $$;
CREATE FUNCTION platform_private.is_same_tenant_user(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles a JOIN public.profiles b ON a.organization_id=b.organization_id WHERE a.user_id=auth.uid() AND b.user_id=p) $$;
CREATE FUNCTION platform_private.is_tenant_admin_for_user(p_target_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'administrador'::public.app_role)
     AND NOT public.is_platform_superadmin(auth.uid()) AND NOT public.is_platform_superadmin(p_target_user_id)
     AND platform_private.is_same_tenant_user(p_target_user_id) $$;
-- Gatilhos: carregados VERBATIM de captured-prod-user-triggers-20261117.sql (todos os 28, habilitados).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA platform_private TO authenticated; -- espelha produção: public.has_role (INVOKER) chama platform_private.has_role
