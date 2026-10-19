-- Disposable PostgreSQL only. Reduced schema; auth.uid/jwt emulate claims, not JWT validation.
CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE anon;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','administrativo','consultor_tecnico','tecnico_agronomo','aplicador','producao','operador_onfarm','financeiro','cliente_produtor','parceiro_b2b');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
CREATE TABLE public.organizations(id uuid PRIMARY KEY,ativo boolean DEFAULT true);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean DEFAULT true,senha_provisoria boolean DEFAULT false,cliente_id uuid);
CREATE TABLE public.user_roles(user_id uuid,role public.app_role);
CREATE TABLE public.platform_org_admin_invites(user_id uuid,access_operation_status text,access_valid_after timestamptz);
CREATE TABLE public.clientes(id uuid PRIMARY KEY,organization_id uuid);
CREATE TABLE public.user_clientes(user_id uuid,cliente_id uuid,is_active boolean DEFAULT true,revoked_at timestamptz,valid_from timestamptz,valid_until timestamptz);
CREATE TABLE public.ordens_servico(id uuid PRIMARY KEY,organization_id uuid,cliente_id uuid);
CREATE TABLE public.ordens_servico_onfarm(id uuid PRIMARY KEY,cliente_id uuid);
CREATE TABLE public.aplicacoes(id uuid PRIMARY KEY,organization_id uuid,ordem_servico_id uuid,ordem_servico_onfarm_id uuid);
GRANT USAGE ON SCHEMA public,auth,platform_private TO authenticated,service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER TABLE public.aplicacoes ENABLE ROW LEVEL SECURITY;
-- Mirrors the relevant helper call, not a complete hosted policy reproduction.