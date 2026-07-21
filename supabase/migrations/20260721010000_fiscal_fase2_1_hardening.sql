-- =====================================================================
-- FASE FISCAL 2.1 — HARDENING DA FUNDAÇÃO FISCAL
-- Aditivo, idempotente, transacional. Sem provedor, sem token,
-- sem certificado, sem webhook, sem emissão.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 3. UNICIDADE POR AMBIENTE
-- Motivo: homologação e produção podem repetir série/número.
-- ---------------------------------------------------------------------
DROP INDEX IF EXISTS public.ux_fi_doc_model_series_number_company;

CREATE UNIQUE INDEX IF NOT EXISTS ux_fi_env_doc_model_series_number_company
  ON public.fiscal_invoices (company_cnpj, document_model, environment, series, invoice_number)
  WHERE document_model IS NOT NULL AND series IS NOT NULL
    AND invoice_number IS NOT NULL AND company_cnpj IS NOT NULL
    AND environment IS NOT NULL;

-- provider_reference: incluir document_model para evitar colisão NF-e/NFS-e
DROP INDEX IF EXISTS public.ux_fi_provider_ref;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fi_provider_env_model_ref
  ON public.fiscal_invoices (provider, environment, document_model, provider_reference)
  WHERE provider_reference IS NOT NULL;

-- access_key permanece com unique parcial já existente (ux_fi_access_key).

-- ---------------------------------------------------------------------
-- 4. FOREIGN KEYS / ON DELETE — normalização defensiva
-- ---------------------------------------------------------------------
-- fiscal_events.fiscal_invoice_id: CASCADE -> RESTRICT (evita apagar trilha)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
     WHERE n.nspname='public' AND t.relname='fiscal_events'
       AND c.contype='f' AND c.confdeltype='c'
       AND pg_get_constraintdef(c.oid) ILIKE '%fiscal_invoices%'
  ) THEN
    ALTER TABLE public.fiscal_events
      DROP CONSTRAINT IF EXISTS fiscal_events_fiscal_invoice_id_fkey;
    ALTER TABLE public.fiscal_events
      ADD CONSTRAINT fiscal_events_fiscal_invoice_id_fkey
      FOREIGN KEY (fiscal_invoice_id)
      REFERENCES public.fiscal_invoices(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- fiscal_invoice_items.fiscal_invoice_id permanece CASCADE (documentado): itens
-- só existem enquanto o cabeçalho existe.

-- fiscal_idempotency_keys.fiscal_invoice_id já é SET NULL.

-- parent_invoice_id / substitution_invoice_id: adicionar FK RESTRICT se inexistentes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname='fiscal_invoices_parent_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fiscal_invoices_parent_invoice_id_fkey
      FOREIGN KEY (parent_invoice_id) REFERENCES public.fiscal_invoices(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname='fiscal_invoices_substitution_invoice_id_fkey'
  ) THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fiscal_invoices_substitution_invoice_id_fkey
      FOREIGN KEY (substitution_invoice_id) REFERENCES public.fiscal_invoices(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Guarda contra auto-substituição direta
ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_no_self_substitution;
ALTER TABLE public.fiscal_invoices
  ADD CONSTRAINT chk_fi_no_self_substitution
  CHECK (substitution_invoice_id IS NULL OR substitution_invoice_id <> id);

ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_no_self_parent;
ALTER TABLE public.fiscal_invoices
  ADD CONSTRAINT chk_fi_no_self_parent
  CHECK (parent_invoice_id IS NULL OR parent_invoice_id <> id);

-- ---------------------------------------------------------------------
-- 5. FISCAL_EVENTS — trilha imutável
-- ---------------------------------------------------------------------
-- Remover INSERT direto do usuário. Somente RPC ou service_role.
REVOKE INSERT, UPDATE, DELETE ON public.fiscal_events FROM authenticated;
DROP POLICY IF EXISTS "fiscal_events_insert" ON public.fiscal_events;

-- Bloquear UPDATE e DELETE por policy explícita (defesa em profundidade).
DROP POLICY IF EXISTS "fiscal_events_no_update" ON public.fiscal_events;
CREATE POLICY "fiscal_events_no_update" ON public.fiscal_events
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "fiscal_events_no_delete" ON public.fiscal_events;
CREATE POLICY "fiscal_events_no_delete" ON public.fiscal_events
  FOR DELETE TO authenticated USING (false);

-- RPC segura para eventos manuais
CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_manual(
  p_invoice_id uuid,
  p_event_type text,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_allowed text[] := ARRAY['MANUAL_UPDATED','RECONCILIATION_REQUIRED','RECONCILIATION_COMPLETED'];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT (public.has_role(v_actor,'administrador'::app_role)
       OR public.has_role(v_actor,'financeiro'::app_role)
       OR public.has_role(v_actor,'gestor'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT (p_event_type = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'event_type_not_allowed_for_manual: %', p_event_type;
  END IF;
  INSERT INTO public.fiscal_events(
    fiscal_invoice_id, event_type, event_source, error_message, performed_by
  ) VALUES (
    p_invoice_id, p_event_type, 'USER', NULLIF(p_notes,''), v_actor
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_event_manual(uuid,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_manual(uuid,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. FISCAL_AUDIT_LOG — endurecer
-- ---------------------------------------------------------------------
-- Nenhum acesso direto de escrita para authenticated (INSERT apenas via trigger SECURITY DEFINER)
REVOKE INSERT, UPDATE, DELETE ON public.fiscal_audit_log FROM authenticated;

DROP POLICY IF EXISTS "fiscal_audit_log_no_write" ON public.fiscal_audit_log;
CREATE POLICY "fiscal_audit_log_no_write" ON public.fiscal_audit_log
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "fiscal_audit_log_read" ON public.fiscal_audit_log;
CREATE POLICY "fiscal_audit_log_read" ON public.fiscal_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role));

-- Máscara de segredos em jsonb
CREATE OR REPLACE FUNCTION public.mask_sensitive_jsonb(v jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  k text;
  out_v jsonb := v;
  sensitive text[] := ARRAY[
    'authorization','token','password','senha',
    'certificate','certificado','private_key','privatekey',
    'secret','pfx','p12','api_key','apikey','bearer'
  ];
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN RETURN v; END IF;
  FOR k IN SELECT jsonb_object_keys(out_v) LOOP
    IF lower(k) = ANY (sensitive) THEN
      out_v := jsonb_set(out_v, ARRAY[k], to_jsonb('***REDACTED***'::text), false);
    END IF;
  END LOOP;
  RETURN out_v;
END; $$;

-- Trigger endurecido: allowlist + mascaramento + performed_by=auth.uid()
CREATE OR REPLACE FUNCTION public.fiscal_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_allowed text[] := ARRAY[
    'company_fiscal_settings','product_fiscal_profiles','service_fiscal_profiles',
    'customer_fiscal_profiles','fiscal_invoices','fiscal_invoice_items',
    'fiscal_events','fiscal_idempotency_keys'
  ];
BEGIN
  IF NOT (TG_TABLE_NAME = ANY(v_allowed)) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(OLD)),
            public.mask_sensitive_jsonb(to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', v_actor,
            public.mask_sensitive_jsonb(to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;

-- ---------------------------------------------------------------------
-- 7. VIEWS — SECURITY INVOKER
-- ---------------------------------------------------------------------
ALTER VIEW public.v_fiscal_company_readiness SET (security_invoker = true);
ALTER VIEW public.v_product_fiscal_readiness SET (security_invoker = true);
ALTER VIEW public.v_service_fiscal_readiness SET (security_invoker = true);
ALTER VIEW public.v_customer_fiscal_readiness SET (security_invoker = true);
ALTER VIEW public.v_fiscal_document_reconciliation_pending SET (security_invoker = true);

-- ---------------------------------------------------------------------
-- 8. PERFIL ADMINISTRATIVO em fiscal_invoice_items
-- Decisão: REMOVER SELECT. Administrativo cuida de faturamento agregado,
-- não de linhas fiscais; itens contêm snapshot de tributos sensíveis.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "fiscal_invoice_items_read" ON public.fiscal_invoice_items;
CREATE POLICY "fiscal_invoice_items_read"
  ON public.fiscal_invoice_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role)
      OR public.has_role(auth.uid(),'gestor'::app_role)
      OR public.has_role(auth.uid(),'financeiro'::app_role));

COMMIT;
