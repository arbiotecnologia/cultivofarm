
-- ============================================================
-- HOMOLOGAÇÃO B2B — BLOCO 1: SEGURANÇA + CONCORRÊNCIA
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq (guarda fail-closed)
-- ============================================================
DO $guard$
DECLARE v text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'HML_GUARD: marker de ambiente ausente — execucao abortada';
  END IF;
  SELECT project_ref INTO v FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'HML_GUARD: ambiente de PRODUCAO — proibido';
  END IF;
  IF v IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'HML_GUARD: somente staging ikaauvsflpmamgxmkhoq';
  END IF;
END $guard$;

-- ------------------------------------------------------------
-- 3.1 / 3.8 — Revogar EXECUTE de PUBLIC e anon
-- ------------------------------------------------------------
DO $acl$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = 'rpc_cc_simulate_price'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $acl$;

-- ------------------------------------------------------------
-- 3.2 — Nenhum grant de anon nas tabelas de parceiro/simulação
-- ------------------------------------------------------------
REVOKE ALL ON TABLE public.partner_accounts FROM anon;
REVOKE ALL ON TABLE public.partner_simulations FROM anon;
REVOKE ALL ON TABLE public.partner_simulation_items FROM anon;

-- ------------------------------------------------------------
-- 3.4 — Reforço da policy de leitura dos itens de simulação
-- (endurece; não afrouxa: passa a exigir dono/parceiro/perfil interno)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS partner_simulation_items_select ON public.partner_simulation_items;
CREATE POLICY partner_simulation_items_select
  ON public.partner_simulation_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_simulations s
      WHERE s.id = partner_simulation_items.simulation_id
        AND (
          public.has_role(auth.uid(),'administrador')
          OR public.has_role(auth.uid(),'gestor_comercial')
          OR (public.has_role(auth.uid(),'parceiro_b2b')
              AND s.partner_id = public.get_user_partner_id())
          OR (public.has_role(auth.uid(),'parceiro_b2b_tecnico')
              AND s.partner_id = public.get_user_partner_id()
              AND s.created_by = auth.uid())
        )
    )
  );

-- ------------------------------------------------------------
-- 4.2 — Unicidade de recebível ativo por pedido B2B
-- (cancelados não bloqueiam; DELIVERY já possui índice próprio)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_ar_one_active_per_b2b_order
  ON public.accounts_receivable (origin_id)
  WHERE origin_type = 'B2B_ORDER' AND status <> 'CANCELED';

-- ------------------------------------------------------------
-- 4.1 — Advisory lock transacional por partner_order_id
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_partner_order_id IS NULL THEN
    RAISE EXCEPTION 'partner_order_id_required' USING ERRCODE='P0001';
  END IF;

  -- Serializa concorrência real (clique duplo / chamadas simultâneas)
  PERFORM pg_advisory_xact_lock(
    hashtextextended('b2b_receivable', 0),
    hashtextextended(p_partner_order_id::text, 0)
  );

  IF NOT public.fn_b2b_order_priceable(p_partner_order_id) THEN
    RAISE EXCEPTION 'order_not_priceable_quote_required' USING ERRCODE='P0001';
  END IF;

  RETURN public.generate_b2b_receivable_secure_impl(p_partner_order_id);
END $function$;

REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure(uuid) TO service_role;

-- ------------------------------------------------------------
-- 5 / 18 — Rastreamento de fixtures sintéticas de homologação
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hml_fixture_registry (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_run_id uuid NOT NULL,
  fixture_version text NOT NULL DEFAULT 'v1',
  cleanup_group  text NOT NULL,
  environment    text NOT NULL DEFAULT 'staging',
  test_only      boolean NOT NULL DEFAULT true,
  target_table   text NOT NULL,
  target_id      text NOT NULL,
  target_code    text,
  origem         text NOT NULL,
  motivo         text NOT NULL DEFAULT 'Homologação B2B nacional',
  classification text NOT NULL DEFAULT 'SYNTHETIC',
  dependencias   jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_before jsonb,
  acao           text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hml_fixture_registry_env_chk CHECK (environment = 'staging'),
  CONSTRAINT hml_fixture_registry_class_chk
    CHECK (classification IN ('SYNTHETIC','REVIEW_REQUIRED','PRESERVED','CLEANED','DEACTIVATED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hml_fixture_registry_target
  ON public.hml_fixture_registry (fixture_run_id, target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_hml_fixture_registry_group
  ON public.hml_fixture_registry (cleanup_group);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hml_fixture_registry TO authenticated;
GRANT ALL ON public.hml_fixture_registry TO service_role;

ALTER TABLE public.hml_fixture_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hml_fixture_registry_admin_all ON public.hml_fixture_registry;
CREATE POLICY hml_fixture_registry_admin_all
  ON public.hml_fixture_registry
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador'))
  WITH CHECK (public.has_role(auth.uid(),'administrador'));

CREATE OR REPLACE FUNCTION public.hml_fixture_registry_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $t$
BEGIN NEW.updated_at = now(); RETURN NEW; END $t$;

DROP TRIGGER IF EXISTS trg_hml_fixture_registry_touch ON public.hml_fixture_registry;
CREATE TRIGGER trg_hml_fixture_registry_touch
  BEFORE UPDATE ON public.hml_fixture_registry
  FOR EACH ROW EXECUTE FUNCTION public.hml_fixture_registry_touch();
