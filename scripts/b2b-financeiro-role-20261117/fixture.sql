-- Espelho SINTÉTICO mínimo para a bateria local. Corpos de funções carregados VERBATIM de captured/.
-- Não prova JWT/PostgREST/RLS/Storage hospedados.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
GRANT USAGE ON SCHEMA auth, platform_private TO anon, authenticated, service_role;
CREATE TYPE public.app_role AS ENUM ('administrador','tecnico_agronomo','producao','administrativo','gestor','cliente_produtor','consultor_tecnico','aplicador','operador_onfarm','financeiro','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin','vendedor');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'ativa', partner_account_id uuid);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean NOT NULL DEFAULT true, senha_provisoria boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), nome text, email text, telefone text, cargo text, cpf_cnpj text, crea text, especialidade text, cliente_id uuid);
CREATE TABLE public.user_roles(user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE(user_id, role));
CREATE TABLE public.user_clientes(user_id uuid, cliente_id uuid, principal boolean, is_active boolean, assigned_by uuid);
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid, status_cliente text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.fazendas(id uuid PRIMARY KEY, cliente_id uuid, organization_id uuid, ativo boolean);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, commercial_owner_organization_id uuid, ativo boolean NOT NULL DEFAULT true, deleted_at timestamptz,
 razao_social text, nome_fantasia text, client_id uuid, updated_at timestamptz NOT NULL DEFAULT now());
-- partner_users: colunas e CHECKs LIVE (captura 17/11).
CREATE TABLE public.partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
 user_id uuid UNIQUE, created_at timestamptz DEFAULT now(), papel text DEFAULT 'gestor', valid_from timestamptz DEFAULT now(), revoked_at timestamptz,
 revoked_by uuid, revoke_reason text, tenant_id uuid, version integer DEFAULT 1,
 CONSTRAINT partner_users_papel_check CHECK ((papel = ANY (ARRAY['gestor'::text, 'tecnico'::text]))),
 CONSTRAINT partner_users_revocation_coherence_chk CHECK ((((revoked_at IS NULL) AND (revoked_by IS NULL) AND (revoke_reason IS NULL)) OR ((revoked_at IS NOT NULL) AND (revoked_by IS NOT NULL) AND (revoke_reason IS NOT NULL) AND (btrim(revoke_reason) <> ''::text)))),
 CONSTRAINT partner_users_validity_window_chk CHECK (((revoked_at IS NULL) OR (revoked_at >= valid_from))),
 CONSTRAINT partner_users_version_positive_chk CHECK ((version >= 1)));
CREATE TABLE public.platform_org_admin_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, access_operation_id uuid, access_operation_status text, status text, access_valid_after timestamptz);
CREATE TABLE platform_private.user_authz_epoch(user_id uuid PRIMARY KEY, valid_after timestamptz);
CREATE TABLE platform_private.b2b_provisioning_receipts(user_id uuid, status text, external_roles public.app_role[], partner_id uuid);
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY, partner_id uuid, numero text, status text DEFAULT 'aprovado');
CREATE TABLE public.partner_order_financial_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid, receivable_id uuid, partner_id uuid);
CREATE TABLE public.accounts_receivable(id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), total_amount numeric NOT NULL, status text DEFAULT 'OPEN',
 partner_id uuid, origin_type text, origin_id uuid, organization_id uuid);
CREATE TABLE public.accounts_receivable_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receivable_id uuid, installment_number int, due_date date,
 original_amount numeric, received_amount numeric, status text, organization_id uuid);
CREATE TABLE platform_private.t_ent(org uuid, feature_key text);
CREATE FUNCTION platform_private.entitlements_for_user(_uid uuid) RETURNS TABLE(module_key text, feature_key text, limit_value numeric, config jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT 'm', e.feature_key, NULL::numeric, NULL::jsonb FROM platform_private.t_ent e JOIN public.profiles p ON p.organization_id=e.org AND p.user_id=_uid $$;
-- get_user_partner_id: corpo LIVE (sem papel) — usado pela política LIVE partner_orders_select.
CREATE FUNCTION public.get_user_partner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN count(*) FILTER (WHERE pu.revoked_at IS NULL) <> 1 THEN NULL
    WHEN bool_or(pa.ativo IS TRUE AND pa.deleted_at IS NULL AND pa.commercial_owner_organization_id IS NOT NULL AND pu.tenant_id IS NOT NULL
      AND pu.tenant_id = pa.commercial_owner_organization_id) FILTER (WHERE pu.revoked_at IS NULL)
    THEN (array_agg(pu.partner_id) FILTER (WHERE pu.revoked_at IS NULL))[1] END
  FROM public.partner_users pu LEFT JOIN public.partner_accounts pa ON pa.id = pu.partner_id WHERE pu.user_id = auth.uid(); $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- Crédito: b2b_credit_balances e b2b_credit_config_block são corpos LIVE (captured/). SEAMS DECLARADAS (não LIVE):
-- b2b_integration_actor (substitui c2_order_actor_scope pelo validador canônico de gestor/técnico), prova de origem
-- monetária, devedor do título e residual de pedido.
CREATE TABLE public.partner_financial_settings(partner_id uuid PRIMARY KEY, credit_limit numeric, overdue_tolerance_days int, block_if_overdue boolean, credit_limit_action text, active boolean DEFAULT true);
ALTER TABLE public.accounts_receivable ADD COLUMN customer_id uuid;
CREATE TABLE platform_private.b2b_financial_forecasts(order_id uuid, state text, residual_amount numeric, organization_id uuid, partner_id uuid);
CREATE FUNCTION platform_private.b2b_integration_actor(p_partner uuid, p_internal boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN IF NOT public.is_valid_b2b_partner_user(auth.uid(),p_partner) THEN RAISE EXCEPTION 'B2B_ACTOR_DENIED' USING ERRCODE='42501'; END IF;
 RETURN (SELECT commercial_owner_organization_id FROM public.partner_accounts WHERE id=p_partner); END $$;
CREATE FUNCTION platform_private.b2b_receivable_partner_scope(p uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$ SELECT partner_id FROM public.accounts_receivable WHERE id=p $$;
CREATE FUNCTION platform_private.b2b_proven_money_row_internal(p_id uuid, p_org uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
 SELECT jsonb_build_object('original_amount',original_amount,'interest_amount',0,'financed_interest_amount',0,'penalty_amount',0,'discount_amount',0,'received_amount',received_amount)
 FROM public.accounts_receivable_installments WHERE id=p_id AND organization_id=p_org $$;
CREATE FUNCTION platform_private.b2b_order_residual(o uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT 0::numeric $$;
CREATE TABLE public.partner_order_messages(id uuid DEFAULT gen_random_uuid(), order_id uuid, status text);
