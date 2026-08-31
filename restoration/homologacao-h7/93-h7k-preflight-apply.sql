-- =====================================================================
-- FASE H7k — Preflight fiscal por campo + integridade aritmética de itens
-- Ambiente: STAGING ikaauvsflpmamgxmkhoq (produção permanece intocada).
--
-- Escopo (incremental, sem fluxo paralelo):
--   1. Constraints de sanidade nos itens do documento fiscal.
--   2. `rpc_fiscal_preflight_v1` reescrita: reutiliza as funções canônicas
--      já existentes (`fn_fiscal_environment_gate_v1`,
--      `rpc_fiscal_draft_validate_homologation`, pendências de emitente e
--      destinatário) e passa a devolver erros estruturados POR CAMPO.
--   3. Menor privilégio: o helper de marcador de ambiente deixa de ser
--      executável por papéis públicos.
--
-- Nenhuma regra tributária nova é inventada: campos sem configuração são
-- reportados como pendência, jamais preenchidos por padrão.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------
-- 1) Integridade aritmética mínima dos itens (fail-closed no banco).
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_invoice_items
  DROP CONSTRAINT IF EXISTS h7k_fii_quantity_positive,
  DROP CONSTRAINT IF EXISTS h7k_fii_values_non_negative,
  DROP CONSTRAINT IF EXISTS h7k_fii_commercial_unit_present;

ALTER TABLE public.fiscal_invoice_items
  ADD CONSTRAINT h7k_fii_quantity_positive
    CHECK (quantity IS NULL OR quantity > 0) NOT VALID,
  ADD CONSTRAINT h7k_fii_values_non_negative
    CHECK (
      coalesce(unit_value, 0) >= 0
      AND coalesce(gross_value, 0) >= 0
      AND coalesce(discount_value, 0) >= 0
      AND coalesce(freight_value, 0) >= 0
      AND coalesce(insurance_value, 0) >= 0
      AND coalesce(other_value, 0) >= 0
      AND coalesce(net_value, 0) >= 0
    ) NOT VALID,
  ADD CONSTRAINT h7k_fii_commercial_unit_present
    CHECK (commercial_unit IS NULL OR btrim(commercial_unit) <> '') NOT VALID;

ALTER TABLE public.fiscal_invoice_items VALIDATE CONSTRAINT h7k_fii_quantity_positive;
ALTER TABLE public.fiscal_invoice_items VALIDATE CONSTRAINT h7k_fii_values_non_negative;
ALTER TABLE public.fiscal_invoice_items VALIDATE CONSTRAINT h7k_fii_commercial_unit_present;

-- ---------------------------------------------------------------------
-- 2) Preflight canônico com erros por campo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_fiscal_preflight_v1(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user      uuid := auth.uid();
  v_inv       public.fiscal_invoices;
  v_blockers  jsonb := '[]'::jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_env       text := NULL;
  v_validate  jsonb;
  v_sum       numeric(14,2);
  v_diff      numeric(14,2);
  v_tolerance numeric := 0.01;
  v_dups      integer;
  v_miss      jsonb;
  v_pend      jsonb;
  v_cfs       public.company_fiscal_settings;
  v_cfp       public.customer_fiscal_profiles;
  r           RECORD;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)
          OR public.has_role(v_user, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem competencia fiscal.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  -- 1) Ambiente (fail-closed; produção sempre recusada pelo gate).
  BEGIN
    v_env := public.fn_fiscal_environment_gate_v1('PREFLIGHT');
  EXCEPTION WHEN OTHERS THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', split_part(SQLERRM, ':', 1),
      'section', 'AMBIENTE',
      'field', 'environment',
      'message', SQLERRM,
      'action', 'Revisar configuracao do emitente/ambiente com a contabilidade.');
  END;

  -- 2) Regras de documento/itens/tributos, explodidas POR CAMPO.
  BEGIN
    v_validate := public.rpc_fiscal_draft_validate_homologation(p_invoice_id);
  EXCEPTION WHEN OTHERS THEN
    v_validate := jsonb_build_object('status','BLOCKED','reason', SQLERRM);
  END;

  IF coalesce(v_validate->>'status','BLOCKED') = 'BLOCKED'
     AND coalesce(jsonb_array_length(v_validate->'missing'), 0) = 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','FISCAL_DOCUMENT_BLOCKED','section','DOCUMENTO','field','document',
      'message', coalesce(v_validate->>'reason','Documento fiscal bloqueado para homologacao.'),
      'action','Revisar a situacao do documento antes de transmitir.');
  END IF;

  FOR v_miss IN
    SELECT value FROM jsonb_array_elements(coalesce(v_validate->'missing','[]'::jsonb))
  LOOP
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'FISCAL_FIELD_REQUIRED',
      'section', CASE
                   WHEN v_miss->>'field' LIKE 'item%' THEN 'ITENS'
                   WHEN v_miss->>'field' LIKE 'customer%' THEN 'DESTINATARIO'
                   WHEN v_miss->>'field' IN ('company','certificate') THEN 'EMITENTE'
                   ELSE 'DOCUMENTO'
                 END,
      'field', v_miss->>'field',
      'itemSequence', v_miss->'item_sequence',
      'message', v_miss->>'message',
      'action', 'Preencher o campo indicado no cadastro de origem.');
  END LOOP;

  -- 3) Pendências do EMITENTE (reutiliza a função canônica de prontidão).
  SELECT * INTO v_cfs FROM public.company_fiscal_settings WHERE is_active LIMIT 1;
  IF FOUND THEN
    FOR v_pend IN
      SELECT value FROM jsonb_array_elements(
        coalesce(public.fn_fiscal_emitter_pendencies_row(v_cfs), '[]'::jsonb))
    LOOP
      IF coalesce(v_pend->>'severity','BLOCK') = 'BLOCK' THEN
        v_blockers := v_blockers || jsonb_build_object(
          'code', v_pend->>'code', 'section','EMITENTE',
          'field', v_pend->>'field', 'message', v_pend->>'message',
          'action','Completar o cadastro do emitente.');
      ELSE
        v_warnings := v_warnings || jsonb_build_object(
          'code', v_pend->>'code', 'section','EMITENTE',
          'field', v_pend->>'field', 'message', v_pend->>'message',
          'action','Conferir manualmente com a contabilidade.');
      END IF;
    END LOOP;
  END IF;

  -- 4) Pendências do DESTINATÁRIO (documento/IE/UF/município/endereço).
  IF v_inv.customer_id IS NOT NULL THEN
    SELECT * INTO v_cfp FROM public.customer_fiscal_profiles
     WHERE customer_id = v_inv.customer_id LIMIT 1;
    IF FOUND THEN
      FOR v_pend IN
        SELECT value FROM jsonb_array_elements(
          coalesce(public.fn_fiscal_recipient_pendencies_row(v_cfp), '[]'::jsonb))
      LOOP
        IF coalesce(v_pend->>'severity','BLOCK') = 'BLOCK' THEN
          v_blockers := v_blockers || jsonb_build_object(
            'code', v_pend->>'code', 'section','DESTINATARIO',
            'field', v_pend->>'field', 'message', v_pend->>'message',
            'action','Completar o perfil fiscal do destinatario.');
        ELSE
          v_warnings := v_warnings || jsonb_build_object(
            'code', v_pend->>'code', 'section','DESTINATARIO',
            'field', v_pend->>'field', 'message', v_pend->>'message',
            'action','Conferir o perfil fiscal do destinatario.');
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- 5) Sanidade aritmética item a item (unidade, quantidade, valores).
  FOR r IN
    SELECT item_sequence, quantity, unit_value, commercial_unit,
           net_value, gross_value, discount_value
      FROM public.fiscal_invoice_items
     WHERE fiscal_invoice_id = p_invoice_id
     ORDER BY item_sequence
  LOOP
    IF r.quantity IS NULL OR r.quantity <= 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_QUANTITY_INVALID','section','ITENS','field','quantity',
        'itemSequence', r.item_sequence,
        'message', format('Item %s com quantidade invalida.', r.item_sequence),
        'action','Corrigir a quantidade do item.');
    END IF;
    IF r.commercial_unit IS NULL OR btrim(r.commercial_unit) = '' THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_UNIT_MISSING','section','ITENS','field','commercial_unit',
        'itemSequence', r.item_sequence,
        'message', format('Item %s sem unidade comercial.', r.item_sequence),
        'action','Definir a unidade comercial do item.');
    END IF;
    IF r.unit_value IS NULL OR r.unit_value < 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_UNIT_VALUE_INVALID','section','ITENS','field','unit_value',
        'itemSequence', r.item_sequence,
        'message', format('Item %s com valor unitario invalido.', r.item_sequence),
        'action','Corrigir o valor unitario do item.');
    END IF;
    IF r.net_value IS NULL THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_NET_VALUE_MISSING','section','ITENS','field','net_value',
        'itemSequence', r.item_sequence,
        'message', format('Item %s sem valor liquido calculado.', r.item_sequence),
        'action','Recalcular o documento fiscal.');
    ELSIF r.quantity IS NOT NULL AND r.unit_value IS NOT NULL
          AND abs(r.net_value - (r.quantity * r.unit_value - coalesce(r.discount_value,0))) > v_tolerance THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_TOTAL_MISMATCH','section','ITENS','field','net_value',
        'itemSequence', r.item_sequence,
        'message', format('Item %s: liquido diverge de quantidade x unitario - desconto.', r.item_sequence),
        'action','Recalcular o documento a partir do snapshot de origem.');
    END IF;
  END LOOP;

  -- 6) Coerência aritmética dos totais (tolerância documentada de R$ 0,01).
  SELECT coalesce(sum(coalesce(net_value, gross_value, quantity * unit_value)), 0)::numeric(14,2)
    INTO v_sum
    FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id;

  IF v_inv.total_amount IS NULL THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','FISCAL_TOTAL_MISSING','section','TOTAIS','field','total_amount',
      'message','Total do documento nao informado.','action','Recalcular o documento.');
  ELSE
    v_diff := abs(v_inv.total_amount - v_sum);
    IF v_diff > v_tolerance THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_TOTAL_MISMATCH','section','TOTAIS','field','total_amount',
        'message', format('Total do documento (%s) diverge da soma dos itens (%s).', v_inv.total_amount, v_sum),
        'action','Recalcular o documento a partir do snapshot de origem.');
    END IF;
  END IF;

  -- 7) Duplicidade ativa por origem (mesma regra do índice ux_fiscal_invoice_scope_nfe).
  IF v_inv.source_id IS NOT NULL AND v_inv.document_model = 'NFE' THEN
    SELECT count(*) INTO v_dups FROM public.fiscal_invoices f
     WHERE f.source_type = v_inv.source_type
       AND f.source_id = v_inv.source_id
       AND f.document_model = 'NFE'
       AND f.id <> v_inv.id
       AND f.status <> 'CANCELED';
    IF v_dups > 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_DUPLICATE_ACTIVE_DOCUMENT','section','ORIGEM','field','source_id',
        'message','Ja existe documento fiscal ativo para esta origem.',
        'action','Cancelar ou reaproveitar o documento existente.');
    END IF;
  END IF;

  -- 8) Pré-requisito externo: certificado de homologação para transmitir.
  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_certificates fc
     JOIN public.company_fiscal_settings cs ON cs.id = fc.company_settings_id
    WHERE fc.environment = 'HOMOLOGATION' AND fc.is_active AND fc.status = 'AVAILABLE'
  ) THEN
    v_warnings := v_warnings || jsonb_build_object(
      'code','EXTERNAL_PREREQUISITE_MISSING','section','CERTIFICADO','field','certificate',
      'message','Certificado de homologacao indisponivel: transmissao nao pode ser executada.',
      'action','Provisionar certificado A1 de homologacao antes do smoke SEFAZ.');
  END IF;

  RETURN jsonb_build_object(
    'invoiceId', p_invoice_id,
    'preflightVersion', 'h7k-v1',
    'environment', coalesce(v_env, 'UNKNOWN'),
    'status', CASE WHEN jsonb_array_length(v_blockers) > 0 THEN 'BLOCKED'
                   WHEN jsonb_array_length(v_warnings) > 0 THEN 'READY_WITH_PREREQUISITES'
                   ELSE 'READY' END,
    'canTransmit', (jsonb_array_length(v_blockers) = 0 AND jsonb_array_length(v_warnings) = 0),
    'blockers', v_blockers,
    'warnings', v_warnings,
    'fields', (
      SELECT coalesce(jsonb_object_agg(f.field, f.msgs), '{}'::jsonb)
        FROM (
          SELECT b->>'field' AS field, jsonb_agg(b->>'message') AS msgs
            FROM jsonb_array_elements(v_blockers) b
           WHERE b->>'field' IS NOT NULL
           GROUP BY b->>'field'
        ) f
    ),
    'itemsTotal', v_sum,
    'documentTotal', v_inv.total_amount,
    'toleranceBRL', v_tolerance,
    'evaluatedAt', now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_preflight_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_fiscal_preflight_v1(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_preflight_v1(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Menor privilégio: helper de marcador de ambiente é uso interno.
-- ---------------------------------------------------------------------
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'fn_fiscal_assert_staging_marker'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres, service_role', r.sig);
  END LOOP;
END $do$;

COMMIT;
