BEGIN;

-- ============================================================================
-- FASE S1 — Núcleo de dados SaaS (somente estrutura)
-- Sem entitlement engine, sem gates de menu/rota, sem billing, sem superadmin.
-- Auditoria prévia: nenhuma tabela saas_*/subscription equivalente existe.
-- Transacional, idempotente, com bloco de validação final fail-closed.
-- ============================================================================

-- 1) Enum de status da assinatura -------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                 WHERE n.nspname='public' AND t.typname='saas_subscription_status') THEN
    CREATE TYPE public.saas_subscription_status AS ENUM
      ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED','EXPIRED');
  END IF;
END $$;

-- 2) saas_modules ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_modules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  name        text NOT NULL,
  description text NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_modules_key_unique UNIQUE (key),
  CONSTRAINT saas_modules_key_format CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT saas_modules_name_nonblank CHECK (btrim(name) <> '')
);

REVOKE ALL ON public.saas_modules FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.saas_modules TO authenticated;
GRANT ALL ON public.saas_modules TO service_role;
ALTER TABLE public.saas_modules ENABLE ROW LEVEL SECURITY;

-- 3) saas_features -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_features (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid NOT NULL REFERENCES public.saas_modules(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  key         text NOT NULL,
  name        text NOT NULL,
  description text NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_features_key_unique UNIQUE (key),
  CONSTRAINT saas_features_key_format CHECK (key ~ '^[a-z][a-z0-9_.]{1,95}$'),
  CONSTRAINT saas_features_name_nonblank CHECK (btrim(name) <> '')
);
CREATE INDEX IF NOT EXISTS idx_saas_features_module_id ON public.saas_features(module_id);
CREATE INDEX IF NOT EXISTS idx_saas_features_active ON public.saas_features(active);

REVOKE ALL ON public.saas_features FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.saas_features TO authenticated;
GRANT ALL ON public.saas_features TO service_role;
ALTER TABLE public.saas_features ENABLE ROW LEVEL SECURITY;

-- 4) saas_plans --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,
  name        text NOT NULL,
  description text NULL,
  active      boolean NOT NULL DEFAULT true,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_plans_key_unique UNIQUE (key),
  CONSTRAINT saas_plans_key_format CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT saas_plans_name_nonblank CHECK (btrim(name) <> ''),
  -- Um plano padrão precisa estar ativo.
  CONSTRAINT saas_plans_default_requires_active CHECK (NOT is_default OR active)
);
-- No máximo UM plano padrão ativo em todo o catálogo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_saas_plans_single_active_default
  ON public.saas_plans ((true)) WHERE is_default AND active;
CREATE INDEX IF NOT EXISTS idx_saas_plans_active ON public.saas_plans(active);

REVOKE ALL ON public.saas_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.saas_plans TO authenticated;
GRANT ALL ON public.saas_plans TO service_role;
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;

-- 5) saas_plan_features ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saas_plan_features (
  plan_id     uuid NOT NULL REFERENCES public.saas_plans(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  feature_id  uuid NOT NULL REFERENCES public.saas_features(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  enabled     boolean NOT NULL DEFAULT true,
  -- numeric: cobre limites inteiros e fracionários (ex.: GB de storage) sem
  -- nova migration; NULL = sem limite definido pelo plano.
  limit_value numeric NULL,
  config      jsonb NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_plan_features_pkey PRIMARY KEY (plan_id, feature_id),
  CONSTRAINT saas_plan_features_limit_nonnegative CHECK (limit_value IS NULL OR limit_value >= 0),
  CONSTRAINT saas_plan_features_config_object CHECK (config IS NULL OR jsonb_typeof(config) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_saas_plan_features_feature_id ON public.saas_plan_features(feature_id);

REVOKE ALL ON public.saas_plan_features FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.saas_plan_features TO authenticated;
GRANT ALL ON public.saas_plan_features TO service_role;
ALTER TABLE public.saas_plan_features ENABLE ROW LEVEL SECURITY;

-- 6) organization_subscriptions ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  plan_id              uuid NOT NULL REFERENCES public.saas_plans(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  status               public.saas_subscription_status NOT NULL DEFAULT 'TRIAL',
  billing_cycle        text NULL,
  started_at           timestamptz NOT NULL DEFAULT now(),
  trial_ends_at        timestamptz NULL,
  current_period_start timestamptz NULL,
  current_period_end   timestamptz NULL,
  cancel_at            timestamptz NULL,
  cancelled_at         timestamptz NULL,
  suspended_at         timestamptz NULL,
  created_by           uuid NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_subscriptions_billing_cycle_valid
    CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','quarterly','semiannual','annual','custom')),
  CONSTRAINT org_subscriptions_period_order
    CHECK (current_period_start IS NULL OR current_period_end IS NULL OR current_period_end > current_period_start),
  CONSTRAINT org_subscriptions_cancelled_consistency
    CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL),
  CONSTRAINT org_subscriptions_suspended_consistency
    CHECK (status <> 'SUSPENDED' OR suspended_at IS NOT NULL)
);
-- Regra "no máximo UMA assinatura corrente por organização":
-- corrente = qualquer status não terminal (CANCELLED/EXPIRED são terminais).
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_subscriptions_one_current
  ON public.organization_subscriptions(organization_id)
  WHERE status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED');
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_plan_id ON public.organization_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON public.organization_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org_status ON public.organization_subscriptions(organization_id, status);

REVOKE ALL ON public.organization_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organization_subscriptions TO authenticated;
GRANT ALL ON public.organization_subscriptions TO service_role;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- 7) organization_subscription_history (append-only) -------------------------
CREATE TABLE IF NOT EXISTS public.organization_subscription_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.organization_subscriptions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  actor_user_id   uuid NULL,
  source          text NOT NULL,
  reason          text NULL,
  old_values      jsonb NULL,
  new_values      jsonb NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_subscription_history_source_valid
    CHECK (source IN ('trigger','rpc','service','migration','system')),
  CONSTRAINT org_subscription_history_old_object CHECK (old_values IS NULL OR jsonb_typeof(old_values) = 'object'),
  CONSTRAINT org_subscription_history_new_object CHECK (new_values IS NULL OR jsonb_typeof(new_values) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_org_sub_history_subscription_id ON public.organization_subscription_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_org_sub_history_org_created ON public.organization_subscription_history(organization_id, created_at DESC);

REVOKE ALL ON public.organization_subscription_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organization_subscription_history TO authenticated;
GRANT ALL ON public.organization_subscription_history TO service_role;
ALTER TABLE public.organization_subscription_history ENABLE ROW LEVEL SECURITY;

-- 8) RLS: anon sem acesso; leitura apenas para administradores; nenhuma
--    policy de INSERT/UPDATE/DELETE => escrita somente por service_role /
--    rotinas SECURITY DEFINER futuras.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['saas_modules','saas_features','saas_plans','saas_plan_features',
                           'organization_subscriptions','organization_subscription_history'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
                   JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname=t AND p.polname='saas_admin_read') THEN
      EXECUTE format(
        'CREATE POLICY saas_admin_read ON public.%I FOR SELECT TO authenticated '
        'USING (public.has_role((SELECT auth.uid()), ''administrador''::public.app_role))', t);
    END IF;
  END LOOP;
END $$;

-- 9) updated_at automático (reutiliza função existente)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['saas_modules','saas_features','saas_plans','saas_plan_features',
                           'organization_subscriptions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid
                   JOIN pg_namespace n ON n.oid=c.relnamespace
                   WHERE n.nspname='public' AND c.relname=t AND tg.tgname='trg_'||t||'_updated_at') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW '
                     'EXECUTE FUNCTION public.update_updated_at_column()', 'trg_'||t||'_updated_at', t);
    END IF;
  END LOOP;
END $$;

-- 10) Histórico imutável: bloqueia UPDATE/DELETE em qualquer papel.
CREATE OR REPLACE FUNCTION public.saas_subscription_history_no_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'organization_subscription_history é append-only (operação % bloqueada)', TG_OP
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.saas_subscription_history_no_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_sub_history_no_mutation ON public.organization_subscription_history;
CREATE TRIGGER trg_org_sub_history_no_mutation
  BEFORE UPDATE OR DELETE ON public.organization_subscription_history
  FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_history_no_mutation();

-- 11) Assinaturas não podem ser apagadas (sem CASCADE destrutivo; ciclo de
--     vida é feito por status).
CREATE OR REPLACE FUNCTION public.saas_subscription_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'organization_subscriptions não pode ser removida; use status CANCELLED/EXPIRED'
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.saas_subscription_no_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_subscriptions_no_delete ON public.organization_subscriptions;
CREATE TRIGGER trg_org_subscriptions_no_delete
  BEFORE DELETE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_no_delete();

-- 12) Auditoria automática de assinatura -> histórico append-only.
CREATE OR REPLACE FUNCTION public.saas_subscription_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_old jsonb; v_new jsonb;
BEGIN
  v_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    IF v_old = v_new THEN RETURN NEW; END IF;
  END IF;

  INSERT INTO public.organization_subscription_history
    (subscription_id, organization_id, actor_user_id, source, reason, old_values, new_values)
  VALUES
    (NEW.id, NEW.organization_id, auth.uid(), 'trigger',
     CASE WHEN TG_OP = 'INSERT' THEN 'subscription_created' ELSE 'subscription_updated' END,
     v_old, v_new);

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_subscription_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_org_subscriptions_audit ON public.organization_subscriptions;
CREATE TRIGGER trg_org_subscriptions_audit
  AFTER INSERT OR UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.saas_subscription_audit();

-- 13) Seed mínimo e neutro: apenas o plano padrão técnico. Nenhum módulo,
--     nenhuma feature e nenhuma assinatura => nada é bloqueado e nenhum
--     comportamento da aplicação muda.
INSERT INTO public.saas_plans (key, name, description, active, is_default)
VALUES ('base', 'Plano Base',
        'Plano padrão técnico da Fase S1. Sem features vinculadas: não habilita nem bloqueia nada.',
        true, true)
ON CONFLICT (key) DO NOTHING;

-- 14) Validação final (fail-closed) ------------------------------------------
DO $$
DECLARE v_fail text := '';
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relrowsecurity
        AND c.relname IN ('saas_modules','saas_features','saas_plans','saas_plan_features',
                          'organization_subscriptions','organization_subscription_history')) <> 6 THEN
    v_fail := v_fail || 'RLS ausente em alguma tabela saas; ';
  END IF;

  IF (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND p.polname='saas_admin_read'
        AND c.relname IN ('saas_modules','saas_features','saas_plans','saas_plan_features',
                          'organization_subscriptions','organization_subscription_history')) <> 6 THEN
    v_fail := v_fail || 'policy de leitura admin ausente; ';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND p.polcmd <> 'r'
               AND c.relname IN ('saas_modules','saas_features','saas_plans','saas_plan_features',
                                 'organization_subscriptions','organization_subscription_history')) THEN
    v_fail := v_fail || 'existe policy de escrita em tabela saas; ';
  END IF;

  IF (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema='public' AND grantee='anon'
        AND table_name IN ('saas_modules','saas_features','saas_plans','saas_plan_features',
                           'organization_subscriptions','organization_subscription_history')) > 0 THEN
    v_fail := v_fail || 'anon possui grant em tabela saas; ';
  END IF;

  IF (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema='public' AND grantee='authenticated' AND privilege_type <> 'SELECT'
        AND table_name IN ('saas_modules','saas_features','saas_plans','saas_plan_features',
                           'organization_subscriptions','organization_subscription_history')) > 0 THEN
    v_fail := v_fail || 'authenticated possui grant de escrita em tabela saas; ';
  END IF;

  IF to_regclass('public.uq_org_subscriptions_one_current') IS NULL
     OR to_regclass('public.uq_saas_plans_single_active_default') IS NULL THEN
    v_fail := v_fail || 'índice único de unicidade ausente; ';
  END IF;

  IF (SELECT count(*) FROM public.saas_plans WHERE is_default AND active) <> 1 THEN
    v_fail := v_fail || 'plano padrão ativo não é exatamente 1; ';
  END IF;

  IF (SELECT count(*) FROM public.organization_subscriptions) <> 0 THEN
    v_fail := v_fail || 'assinatura criada indevidamente na S1; ';
  END IF;

  IF v_fail <> '' THEN
    RAISE EXCEPTION 'FASE_S1_VALIDACAO_FALHOU: %', v_fail;
  END IF;
END $$;

COMMIT;