-- Estrutura mínima sintética (espelho descartável); NÃO é prova de JWT/RLS real.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, auth, platform_private TO authenticated, anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','financeiro','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico');
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role, UNIQUE(user_id,role));
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, razao_social text, commercial_owner_organization_id uuid);
CREATE FUNCTION platform_private.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
 $$ SELECT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.profiles p ON p.user_id=ur.user_id WHERE ur.user_id=u AND ur.role=r AND p.ativo) $$;
-- Corpo representativo do predicado compartilhado de aprovação (inalterado pelo pacote).
CREATE FUNCTION platform_private.b2b_internal_commercial_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS
 $$ SELECT platform_private.has_role(auth.uid(),'administrador') OR platform_private.has_role(auth.uid(),'gestor_comercial') $$;
GRANT EXECUTE ON FUNCTION platform_private.b2b_internal_commercial_actor() TO authenticated;
