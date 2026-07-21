-- =====================================================================
-- FASE FISCAL 3.0.1 — CORREÇÃO DOS GATES TÉCNICOS
-- Aditiva, idempotente, transacional. Não edita as duas migrations aplicadas.
-- Sem provedor, sem token, sem certificado, sem emissão.
--
-- ⚠️ Este arquivo é a versão canônica AGUARDANDO execução externa em staging
-- isolado. Após validação, mover byte-a-byte para supabase/migrations/
-- 20260722000000_fiscal_fase3_0_1_integridade.sql (o sandbox atual não permite
-- gravar diretamente em supabase/migrations/ sem executar).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. INTEGRIDADE — Foreign Keys
-- ---------------------------------------------------------------------
DO $$
DECLARE v_orphans int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='produtos') THEN
    SELECT count(*) INTO v_orphans FROM public.product_fiscal_profiles p
      WHERE NOT EXISTS (SELECT 1 FROM public.produtos x WHERE x.id = p.product_id);
    IF v_orphans > 0 THEN
      RAISE EXCEPTION 'fase3_0_1: % órfão(s) em product_fiscal_profiles.product_id — sanear antes de aplicar FK', v_orphans;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='product_fiscal_profiles_product_id_fkey') THEN
      ALTER TABLE public.product_fiscal_profiles
        ADD CONSTRAINT product_fiscal_profiles_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

DO $$
DECLARE v_orphans int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clientes') THEN
    SELECT count(*) INTO v_orphans FROM public.customer_fiscal_profiles c
      WHERE NOT EXISTS (SELECT 1 FROM public.clientes x WHERE x.id = c.customer_id);
    IF v_orphans > 0 THEN
      RAISE EXCEPTION 'fase3_0_1: % órfão(s) em customer_fiscal_profiles.customer_id', v_orphans;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='customer_fiscal_profiles_customer_id_fkey') THEN
      ALTER TABLE public.customer_fiscal_profiles
        ADD CONSTRAINT customer_fiscal_profiles_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

-- service_fiscal_profiles: sem FK (catálogo canônico ausente).
COMMENT ON COLUMN public.service_fiscal_profiles.source_reference IS
  'Referência transitória enquanto catálogo canônico de serviços não existir.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_service_fiscal_profiles_service_active
  ON public.service_fiscal_profiles (service_id)
  WHERE service_id IS NOT NULL AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_service_fiscal_profiles_source_ref_active
  ON public.service_fiscal_profiles (source_reference)
  WHERE source_reference IS NOT NULL AND is_active = true;

-- ---------------------------------------------------------------------
-- 2. fiscal_events.fiscal_invoice_id — NOT NULL se limpo
-- ---------------------------------------------------------------------
DO $$
DECLARE v_orphans int;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.fiscal_events WHERE fiscal_invoice_id IS NULL;
  IF v_orphans = 0 THEN
    BEGIN
      ALTER TABLE public.fiscal_events ALTER COLUMN fiscal_invoice_id SET NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
  ELSE
    RAISE NOTICE 'fase3_0_1: fiscal_events tem % linha(s) sem fiscal_invoice_id — mantendo nullable', v_orphans;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. fiscal_events — coluna notes aditiva
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_events ADD COLUMN IF NOT EXISTS notes text;

-- ---------------------------------------------------------------------
-- 4. mask_sensitive_jsonb — REALMENTE RECURSIVA
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mask_sensitive_jsonb(v jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  k text;
  val jsonb;
  arr jsonb := '[]'::jsonb;
  item jsonb;
  out_obj jsonb := '{}'::jsonb;
  sensitive text[] := ARRAY[
    'authorization','token','access_token','refresh_token',
    'password','senha','certificate','certificado',
    'private_key','privatekey','secret','client_secret',
    'pfx','p12','api_key','apikey','bearer'
  ];
  s text;
  is_sensitive boolean;
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(v) = 'array' THEN
    FOR item IN SELECT value FROM jsonb_array_elements(v) LOOP
      arr := arr || jsonb_build_array(public.mask_sensitive_jsonb(item));
    END LOOP;
    RETURN arr;
  END IF;
  IF jsonb_typeof(v) = 'object' THEN
    FOR k, val IN SELECT key, value FROM jsonb_each(v) LOOP
      is_sensitive := false;
      FOREACH s IN ARRAY sensitive LOOP
        IF position(s in lower(k)) > 0 THEN is_sensitive := true; EXIT; END IF;
      END LOOP;
      IF is_sensitive THEN
        out_obj := out_obj || jsonb_build_object(k, to_jsonb('***REDACTED***'::text));
      ELSE
        out_obj := out_obj || jsonb_build_object(k, public.mask_sensitive_jsonb(val));
      END IF;
    END LOOP;
    RETURN out_obj;
  END IF;
  RETURN v;
END; $$;

-- ---------------------------------------------------------------------
-- 5. rpc_fiscal_event_manual — validação estrita
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_manual(
  p_invoice_id uuid, p_event_type text, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_allowed text[] := ARRAY['MANUAL_UPDATED','RECONCILIATION_REQUIRED','RECONCILIATION_COMPLETED'];
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_role(v_actor,'administrador'::app_role)
       OR public.has_role(v_actor,'financeiro'::app_role)
       OR public.has_role(v_actor,'gestor'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_invoice_id IS NULL THEN RAISE EXCEPTION 'invoice_id_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'invoice_not_found: %', p_invoice_id;
  END IF;
  IF NOT (p_event_type = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'event_type_not_allowed_for_manual: %', p_event_type;
  END IF;
  INSERT INTO public.fiscal_events(fiscal_invoice_id, event_type, event_source, notes, performed_by)
  VALUES (p_invoice_id, p_event_type, 'USER', NULLIF(p_notes,''), v_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_event_manual(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_manual(uuid,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. v_fiscal_document_reconciliation_pending — restringir a staff financeiro
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_fiscal_document_reconciliation_pending
WITH (security_invoker = true) AS
SELECT id AS fiscal_invoice_id, receivable_id, reconciliation_status,
       document_model, document_origin, status, normalized_status
FROM public.fiscal_invoices
WHERE reconciliation_status IN ('PENDING','DIVERGENT','REQUIRES_REVIEW')
  AND (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'financeiro'::app_role)
  );

COMMIT;
