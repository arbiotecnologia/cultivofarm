-- ============================================================
-- FASE B — Condições comerciais configuráveis (staging only)
-- Forward-safe, idempotente. Nenhum dado comercial inserido.
-- ============================================================

-- Gate: recusa execução fora do staging marcado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public._fiscal_staging_marker
    WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq'
  ) THEN
    RAISE EXCEPTION 'ABORT: marcador STAGING ausente — migration recusada';
  END IF;
END$$;

-- ------------------------------------------------------------
-- 1) Atribuições de plano por parceiro/produtor
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_payment_plan_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid NOT NULL REFERENCES public.commercial_payment_plans(id) ON DELETE RESTRICT,
  buyer_scope    text NOT NULL CHECK (buyer_scope IN ('partner','customer','default')),
  partner_id     uuid REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  customer_id    uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','pending_approval','published','archived')),
  valid_from     date NOT NULL DEFAULT CURRENT_DATE,
  valid_until    date,
  motivo         text,
  submitted_by   uuid,
  submitted_at   timestamptz,
  published_by   uuid,
  published_at   timestamptz,
  archived_by    uuid,
  archived_at    timestamptz,
  created_by     uuid,
  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cppa_scope_target_ck CHECK (
    (buyer_scope = 'partner'  AND partner_id IS NOT NULL AND customer_id IS NULL) OR
    (buyer_scope = 'customer' AND customer_id IS NOT NULL AND partner_id IS NULL) OR
    (buyer_scope = 'default'  AND partner_id IS NULL AND customer_id IS NULL)
  ),
  CONSTRAINT cppa_validity_ck CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS cppa_published_partner_uq
  ON public.commercial_payment_plan_assignments (plan_id, partner_id, valid_from)
  WHERE status = 'published' AND buyer_scope = 'partner';
CREATE UNIQUE INDEX IF NOT EXISTS cppa_published_customer_uq
  ON public.commercial_payment_plan_assignments (plan_id, customer_id, valid_from)
  WHERE status = 'published' AND buyer_scope = 'customer';
CREATE UNIQUE INDEX IF NOT EXISTS cppa_published_default_uq
  ON public.commercial_payment_plan_assignments (plan_id, valid_from)
  WHERE status = 'published' AND buyer_scope = 'default';
CREATE INDEX IF NOT EXISTS cppa_lookup_ix
  ON public.commercial_payment_plan_assignments (buyer_scope, partner_id, customer_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_payment_plan_assignments TO authenticated;
GRANT ALL ON public.commercial_payment_plan_assignments TO service_role;
ALTER TABLE public.commercial_payment_plan_assignments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2) Matriz de preços por item x condição
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_condition_item_prices (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id     uuid REFERENCES public.commercial_payment_plan_assignments(id) ON DELETE CASCADE,
  plan_id           uuid NOT NULL REFERENCES public.commercial_payment_plans(id) ON DELETE RESTRICT,
  buyer_scope       text NOT NULL CHECK (buyer_scope IN ('partner','customer','default')),
  partner_id        uuid REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  customer_id       uuid REFERENCES public.clientes(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  microrganismo_id  uuid REFERENCES public.microrganismos(id) ON DELETE CASCADE,
  unit_type         text NOT NULL CHECK (unit_type IN ('hectare','dose','litro','unidade')),
  volume_ml         numeric,
  min_quantity      numeric NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  pricing_mode      text NOT NULL CHECK (pricing_mode IN ('fixed_item_price','discount_from_base','quote_only')),
  condition_price   numeric CHECK (condition_price IS NULL OR condition_price >= 0),
  discount_percent  numeric CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100)),
  currency          text NOT NULL DEFAULT 'BRL',
  valid_from        date NOT NULL DEFAULT CURRENT_DATE,
  valid_until       date,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending_approval','published','archived')),
  motivo            text,
  is_exception      boolean NOT NULL DEFAULT false,
  published_rule_id uuid REFERENCES public.commercial_price_rules(id) ON DELETE SET NULL,
  published_by      uuid,
  published_at      timestamptz,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ccip_item_ck CHECK (
    (product_id IS NOT NULL AND microrganismo_id IS NULL) OR
    (product_id IS NULL AND microrganismo_id IS NOT NULL)
  ),
  CONSTRAINT ccip_scope_target_ck CHECK (
    (buyer_scope = 'partner'  AND partner_id IS NOT NULL AND customer_id IS NULL) OR
    (buyer_scope = 'customer' AND customer_id IS NOT NULL AND partner_id IS NULL) OR
    (buyer_scope = 'default'  AND partner_id IS NULL AND customer_id IS NULL)
  ),
  CONSTRAINT ccip_mode_value_ck CHECK (
    (pricing_mode = 'fixed_item_price'   AND condition_price IS NOT NULL) OR
    (pricing_mode = 'discount_from_base' AND discount_percent IS NOT NULL) OR
    (pricing_mode = 'quote_only')
  ),
  CONSTRAINT ccip_validity_ck CHECK (valid_until IS NULL OR valid_until >= valid_from),
  CONSTRAINT ccip_volume_ck CHECK (unit_type <> 'unidade' OR volume_ml IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ccip_published_uq
  ON public.commercial_condition_item_prices (
    plan_id, buyer_scope,
    COALESCE(partner_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(microrganismo_id, '00000000-0000-0000-0000-000000000000'::uuid),
    unit_type, COALESCE(volume_ml, -1), min_quantity, valid_from
  )
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS ccip_plan_status_ix
  ON public.commercial_condition_item_prices (plan_id, status, buyer_scope);
CREATE INDEX IF NOT EXISTS ccip_assignment_ix
  ON public.commercial_condition_item_prices (assignment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_condition_item_prices TO authenticated;
GRANT ALL ON public.commercial_condition_item_prices TO service_role;
ALTER TABLE public.commercial_condition_item_prices ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3) Auditoria das condições comerciais
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_condition_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity       text NOT NULL CHECK (entity IN ('assignment','item_price','plan','bulk_adjust')),
  entity_id    uuid,
  action       text NOT NULL,
  actor_id     uuid,
  before_data  jsonb,
  after_data   jsonb,
  motivo       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ccal_entity_ix ON public.commercial_condition_audit_log (entity, entity_id, created_at DESC);

GRANT SELECT ON public.commercial_condition_audit_log TO authenticated;
GRANT ALL ON public.commercial_condition_audit_log TO service_role;
ALTER TABLE public.commercial_condition_audit_log ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 4) Trigger de updated_at
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_commercial_conditions_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cppa_touch ON public.commercial_payment_plan_assignments;
CREATE TRIGGER trg_cppa_touch BEFORE UPDATE ON public.commercial_payment_plan_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_conditions_touch();

DROP TRIGGER IF EXISTS trg_ccip_touch ON public.commercial_condition_item_prices;
CREATE TRIGGER trg_ccip_touch BEFORE UPDATE ON public.commercial_condition_item_prices
  FOR EACH ROW EXECUTE FUNCTION public.tg_commercial_conditions_touch();

-- ------------------------------------------------------------
-- 5) RLS — somente administração comercial/financeira
-- ------------------------------------------------------------
DROP POLICY IF EXISTS cppa_admin_manage ON public.commercial_payment_plan_assignments;
CREATE POLICY cppa_admin_manage ON public.commercial_payment_plan_assignments
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'gestor_comercial')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'gestor_comercial')
  );

DROP POLICY IF EXISTS ccip_admin_manage ON public.commercial_condition_item_prices;
CREATE POLICY ccip_admin_manage ON public.commercial_condition_item_prices
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'gestor_comercial')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'gestor_comercial')
  );

DROP POLICY IF EXISTS ccal_admin_read ON public.commercial_condition_audit_log;
CREATE POLICY ccal_admin_read ON public.commercial_condition_audit_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_role(auth.uid(), 'financeiro')
    OR public.has_role(auth.uid(), 'gestor_comercial')
  );

REVOKE ALL ON public.commercial_payment_plan_assignments FROM anon;
REVOKE ALL ON public.commercial_condition_item_prices FROM anon;
REVOKE ALL ON public.commercial_condition_audit_log FROM anon;

COMMENT ON TABLE public.commercial_payment_plan_assignments IS
  'Fase B — elegibilidade de plano por parceiro/produtor. Somente status=published torna o plano selecionável.';
COMMENT ON TABLE public.commercial_condition_item_prices IS
  'Fase B — matriz item x condição em rascunho. Publicação projeta a regra em commercial_price_rules.';
