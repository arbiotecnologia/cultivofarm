-- =====================================================================
-- FASE FISCAL 3.0.2-A — CANONICALIZAÇÃO, INTEGRIDADE E POLICIES FISCAIS
-- Aditiva, idempotente, transacional. Não edita as migrations aplicadas
-- 20260721000000 e 20260721010000. Sem provedor, sem token, sem
-- certificado, sem emissão externa. Fonte executável única.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. INTEGRIDADE — Foreign Keys (fail-loud)
-- ---------------------------------------------------------------------
DO $$
DECLARE v_orphans int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='produtos') THEN
    SELECT count(*) INTO v_orphans
      FROM public.product_fiscal_profiles p
     WHERE NOT EXISTS (SELECT 1 FROM public.produtos x WHERE x.id = p.product_id);
    IF v_orphans > 0 THEN
      RAISE EXCEPTION 'fase3_0_2a: % orfao(s) em product_fiscal_profiles.product_id', v_orphans;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname='product_fiscal_profiles_product_id_fkey') THEN
      ALTER TABLE public.product_fiscal_profiles
        ADD CONSTRAINT product_fiscal_profiles_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES public.produtos(id) ON DELETE RESTRICT;
    END IF;
  ELSE
    RAISE EXCEPTION 'fase3_0_2a: tabela public.produtos ausente';
  END IF;
END $$;

DO $$
DECLARE v_orphans int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='clientes') THEN
    SELECT count(*) INTO v_orphans
      FROM public.customer_fiscal_profiles c
     WHERE NOT EXISTS (SELECT 1 FROM public.clientes x WHERE x.id = c.customer_id);
    IF v_orphans > 0 THEN
      RAISE EXCEPTION 'fase3_0_2a: % orfao(s) em customer_fiscal_profiles.customer_id', v_orphans;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conname='customer_fiscal_profiles_customer_id_fkey') THEN
      ALTER TABLE public.customer_fiscal_profiles
        ADD CONSTRAINT customer_fiscal_profiles_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.clientes(id) ON DELETE RESTRICT;
    END IF;
  ELSE
    RAISE EXCEPTION 'fase3_0_2a: tabela public.clientes ausente';
  END IF;
END $$;

DO $$
DECLARE v_orphans int;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.fiscal_events WHERE fiscal_invoice_id IS NULL;
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'fase3_0_2a: % evento(s) sem fiscal_invoice_id', v_orphans;
  END IF;
  ALTER TABLE public.fiscal_events
    ALTER COLUMN fiscal_invoice_id SET NOT NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='fiscal_events_fiscal_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.fiscal_events
      ADD CONSTRAINT fiscal_events_fiscal_invoice_id_fkey
      FOREIGN KEY (fiscal_invoice_id)
      REFERENCES public.fiscal_invoices(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. INTEGRIDADE DE SERVIÇOS (sem FK — catálogo canônico ausente)
-- ---------------------------------------------------------------------
COMMENT ON COLUMN public.service_fiscal_profiles.source_reference IS
  'Referência transitória enquanto catálogo canônico de serviços não existir.';

ALTER TABLE public.service_fiscal_profiles
  DROP CONSTRAINT IF EXISTS chk_service_fp_ref_or_id;
ALTER TABLE public.service_fiscal_profiles
  ADD CONSTRAINT chk_service_fp_ref_or_id
  CHECK (
    service_id IS NOT NULL
    OR NULLIF(btrim(source_reference), '') IS NOT NULL
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_service_fiscal_profiles_service_active
  ON public.service_fiscal_profiles (service_id)
  WHERE service_id IS NOT NULL AND is_active = true;

DROP INDEX IF EXISTS public.ux_service_fiscal_profiles_source_ref_active;
CREATE UNIQUE INDEX IF NOT EXISTS ux_service_fp_source_ref_ci_active
  ON public.service_fiscal_profiles (lower(btrim(source_reference)))
  WHERE source_reference IS NOT NULL
    AND btrim(source_reference) <> ''
    AND is_active = true;

-- ---------------------------------------------------------------------
-- 3. COMPANY_FISCAL_SETTINGS — policies explícitas, DELETE negado
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "company_fiscal_settings_write" ON public.company_fiscal_settings;
DROP POLICY IF EXISTS "company_fiscal_settings_insert" ON public.company_fiscal_settings;
DROP POLICY IF EXISTS "company_fiscal_settings_update" ON public.company_fiscal_settings;
DROP POLICY IF EXISTS "company_fiscal_settings_delete" ON public.company_fiscal_settings;

CREATE POLICY "company_fiscal_settings_insert"
  ON public.company_fiscal_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'administrador'::app_role));

CREATE POLICY "company_fiscal_settings_update"
  ON public.company_fiscal_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'administrador'::app_role));

CREATE POLICY "company_fiscal_settings_delete"
  ON public.company_fiscal_settings FOR DELETE TO authenticated
  USING (false);

REVOKE DELETE ON public.company_fiscal_settings FROM authenticated;

-- ---------------------------------------------------------------------
-- 4. FISCAL_INVOICES — policies explícitas, DELETE negado
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "fi_staff_all" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "is_financial_staff" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "fiscal_invoices_staff_all" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "fi_staff_select" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "fi_staff_insert" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "fi_staff_update" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "fi_staff_delete" ON public.fiscal_invoices;

CREATE POLICY "fi_staff_select"
  ON public.fiscal_invoices FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'financeiro'::app_role)
  );

CREATE POLICY "fi_staff_insert"
  ON public.fiscal_invoices FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'financeiro'::app_role)
  );

CREATE POLICY "fi_staff_update"
  ON public.fiscal_invoices FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'financeiro'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'financeiro'::app_role)
  );

CREATE POLICY "fi_staff_delete"
  ON public.fiscal_invoices FOR DELETE TO authenticated
  USING (false);

REVOKE DELETE ON public.fiscal_invoices FROM authenticated;

-- fiscal_invoices NAO possui customer_id: vinculo produtor->nota e feito
-- via receivable_id (accounts_receivable.customer_id) ou delivery_id
-- (entregas.cliente_id). Reutiliza public.get_cliente_ids_for_user ja
-- adotada pelas policies AR/entregas.
DROP POLICY IF EXISTS "fi_producer_read" ON public.fiscal_invoices;
CREATE POLICY "fi_producer_read"
  ON public.fiscal_invoices FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'cliente_produtor'::app_role)
    AND (
      (receivable_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.accounts_receivable ar
          WHERE ar.id = fiscal_invoices.receivable_id
            AND ar.customer_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
      ))
      OR (delivery_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.entregas e
          WHERE e.id = fiscal_invoices.delivery_id
            AND e.cliente_id = ANY(public.get_cliente_ids_for_user(auth.uid()))
      ))
    )
  );

-- ---------------------------------------------------------------------
-- 5. PERFIS FISCAIS — DELETE direto negado
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'product_fiscal_profiles',
    'service_fiscal_profiles',
    'customer_fiscal_profiles'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (false)',
      t || '_delete', t
    );
    EXECUTE format('REVOKE DELETE ON public.%I FROM authenticated', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 6. EVENTOS — RPC endurecida + limite de notes
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_events ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.fiscal_events
  DROP CONSTRAINT IF EXISTS chk_fiscal_events_notes_len;
ALTER TABLE public.fiscal_events
  ADD CONSTRAINT chk_fiscal_events_notes_len
  CHECK (notes IS NULL OR char_length(notes) <= 2000);

CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_manual(
  p_invoice_id uuid,
  p_event_type text,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $FN$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_notes text := NULLIF(btrim(coalesce(p_notes,'')), '');
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
  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'notes_too_long';
  END IF;
  INSERT INTO public.fiscal_events(
    fiscal_invoice_id, event_type, event_source, notes, performed_by
  ) VALUES (
    p_invoice_id, p_event_type, 'USER', v_notes, v_actor
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $FN$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_event_manual(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_manual(uuid,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 7. MASCARAMENTO RECURSIVO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mask_sensitive_jsonb(v jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $FN$
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
END; $FN$;

-- ---------------------------------------------------------------------
-- 8. VIEW DE RECONCILIAÇÃO — restrita a staff financeiro
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

REVOKE ALL ON public.v_fiscal_document_reconciliation_pending FROM public, anon;
GRANT SELECT ON public.v_fiscal_document_reconciliation_pending TO authenticated;

COMMIT;
