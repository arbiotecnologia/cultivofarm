-- Esquema mínimo descartável: corpos LIVE capturados são carregados por cima (test_pg.py).
-- Auth simulada por claims SQL (request.jwt.claims) — NÃO é prova de JWT/PostgREST hospedado.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE ROLE authenticator NOINHERIT LOGIN; GRANT anon, authenticated, service_role TO authenticator;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO PUBLIC;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb->>'role' $$;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','financeiro','consultor','superadmin');
CREATE SCHEMA platform_private; GRANT USAGE ON SCHEMA platform_private TO authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, partner_account_id uuid,
  ativo boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  responsavel_user_id uuid, responsavel_definido_em timestamptz, status text NOT NULL DEFAULT 'ativa', razao_social text, nome_fantasia text,
  cnpj text, cnpj_normalizado text, email_corporativo text, onboarding_dados jsonb NOT NULL DEFAULT '{}', fuso_horario text,
  onboarding_concluido_em timestamptz, ativada_em timestamptz,
  CONSTRAINT organizations_status_chk CHECK (status = ANY (ARRAY['rascunho','aguardando_ativacao','onboarding','ativa','suspensa','cancelada'])));
GRANT SELECT, UPDATE ON public.organizations TO authenticated; GRANT ALL ON public.organizations TO service_role;
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid REFERENCES public.organizations(id), ativo boolean NOT NULL DEFAULT true);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role, PRIMARY KEY(user_id, role));
GRANT SELECT ON public.profiles, public.user_roles TO authenticated;
CREATE TABLE public.organization_status_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, status_anterior text,
  status_novo text, ator_id uuid, motivo text, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.organization_status_audit TO authenticated;
CREATE TABLE public.saas_plans(id uuid PRIMARY KEY, name text);
CREATE TABLE public.organization_subscriptions(organization_id uuid, plan_id uuid, status text);
CREATE TABLE platform_private.authz_tickets(txid bigint, scope text, target uuid, PRIMARY KEY(txid, scope, target));
CREATE FUNCTION platform_private.has_ticket(_s text, _t uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS
 $$ SELECT EXISTS(SELECT 1 FROM platform_private.authz_tickets WHERE txid=txid_current() AND scope=_s AND target=_t) $$;
CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.h15_require_staff() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN IF platform_private.h15_actor_organization() IS NULL THEN RAISE EXCEPTION 'H15_FORBIDDEN' USING errcode='42501'; END IF; END $$;
CREATE FUNCTION public._fiscal_rtc_can_read(_u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS
 $$ SELECT platform_private.has_role(_u,'administrador') OR platform_private.has_role(_u,'gestor') OR platform_private.has_role(_u,'financeiro') $$;
CREATE TABLE public.company_fiscal_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, is_active boolean,
  fiscal_environment text, configuration_status text, fiscal_provider text, nfe_provider text, nfse_provider text, nfe_enabled boolean,
  nfse_enabled boolean, production_enabled boolean, last_validation_status text, configuration_version int, created_by uuid, updated_by uuid,
  rtc_configuration jsonb, razao_social text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.company_fiscal_pis_cofins_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, company_settings_id uuid);
CREATE TABLE public.fiscal_certificates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_settings_id uuid, display_name text);
CREATE TABLE public.fiscal_document_series(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, serie text);
CREATE TABLE public.fiscal_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, numero int);
CREATE TABLE public.fiscal_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, tipo text);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['company_fiscal_settings','company_fiscal_pis_cofins_history','fiscal_invoices','fiscal_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  EXECUTE format('CREATE POLICY tenant_rw ON public.%I FOR ALL TO authenticated USING (organization_id = platform_private.h15_actor_organization()) WITH CHECK (organization_id = platform_private.h15_actor_organization())', t);
END LOOP; END $$;
ALTER TABLE public.fiscal_certificates ENABLE ROW LEVEL SECURITY; ALTER TABLE public.fiscal_document_series ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.fiscal_certificates, public.fiscal_document_series TO authenticated;
CREATE POLICY tenant_r ON public.fiscal_certificates FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.company_fiscal_settings c WHERE c.id=company_settings_id)) WITH CHECK (true);
CREATE POLICY tenant_r ON public.fiscal_document_series FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.company_fiscal_settings c WHERE c.id=company_id)) WITH CHECK (true);
