-- ============================================================================
-- FASE H7 (parte 2) — Preflight canônico + marcador duro de ambiente.
--
-- H7-007 (P1) Não havia marcador server-side de ambiente independente do DSN:
--             o bloqueio de produção dependia apenas de `tpAmb`.
-- H7-008 (P1) Não havia ponto único de preflight por documento: a validação
--             de rascunho existente (`rpc_fiscal_draft_validate_homologation`)
--             não avaliava gate de ambiente nem coerência aritmética de totais.
--
-- Reutiliza integralmente as funções existentes (nada é duplicado):
--   fn_fiscal_environment_gate_v1, rpc_fiscal_draft_validate_homologation,
--   ux_fiscal_invoice_scope_nfe (unicidade por origem já existente).
-- ============================================================================

-- --------------------------------------------------------------- H7-007 ----
CREATE TABLE IF NOT EXISTS public.fiscal_environment_marker (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  project_ref text NOT NULL,
  environment_label text NOT NULL CHECK (environment_label IN ('STAGING','PRODUCTION')),
  production_emission_allowed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fiscal_environment_marker TO authenticated;
GRANT ALL ON public.fiscal_environment_marker TO service_role;
ALTER TABLE public.fiscal_environment_marker ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_environment_marker_read ON public.fiscal_environment_marker;
CREATE POLICY fiscal_environment_marker_read
  ON public.fiscal_environment_marker FOR SELECT TO authenticated
  USING (true);
-- Escrita apenas por service_role / migration (nenhuma policy de escrita).

INSERT INTO public.fiscal_environment_marker (id, project_ref, environment_label, production_emission_allowed)
VALUES (true, 'ikaauvsflpmamgxmkhoq', 'STAGING', false)
ON CONFLICT (id) DO UPDATE
  SET project_ref = EXCLUDED.project_ref,
      environment_label = EXCLUDED.environment_label,
      production_emission_allowed = false,
      updated_at = now();

CREATE OR REPLACE FUNCTION public.fn_fiscal_assert_staging_marker(p_operation text DEFAULT 'GENERIC')
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE m public.fiscal_environment_marker;
BEGIN
  SELECT * INTO m FROM public.fiscal_environment_marker WHERE id;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_ENV_MARKER_MISSING — ambiente fiscal nao identificado (operacao=%).', p_operation;
  END IF;
  IF m.environment_label <> 'STAGING' OR m.production_emission_allowed THEN
    RAISE EXCEPTION
      'FISCAL_PRODUCTION_DISABLED: FISCAL_ENV_MARKER_BLOCKED — emissao fiscal produtiva desabilitada (operacao=%).', p_operation;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_fiscal_assert_staging_marker(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_assert_staging_marker(text) TO authenticated, service_role;

-- Gate único passa a exigir o marcador: defesa em profundidade (tpAmb + marker).
CREATE OR REPLACE FUNCTION public.fn_fiscal_environment_gate_v1(
  p_operation text DEFAULT 'GENERIC'
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_env   text;
BEGIN
  PERFORM public.fn_fiscal_assert_staging_marker(p_operation);

  SELECT count(*) INTO v_count FROM public.company_fiscal_settings WHERE is_active;
  IF v_count = 0 THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_EMITTER_NOT_CONFIGURED — nenhum emitente fiscal ativo (operacao=%).', p_operation;
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_EMITTER_AMBIGUOUS — % emitentes ativos (operacao=%).', v_count, p_operation;
  END IF;

  SELECT btrim(coalesce(nfe_environment_code, '')) INTO v_env
    FROM public.company_fiscal_settings WHERE is_active LIMIT 1;

  IF v_env IS NULL OR v_env NOT IN ('1', '2') THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_ENVIRONMENT_INVALID — tpAmb ausente/invalido (operacao=%).', p_operation;
  END IF;
  IF v_env = '1' THEN
    RAISE EXCEPTION
      'FISCAL_PRODUCTION_DISABLED: FISCAL_PRODUCTION_BLOCKED — emissao em producao desabilitada (operacao=%).', p_operation;
  END IF;

  RETURN v_env;
END;
$$;

-- --------------------------------------------------------------- H7-008 ----
-- Preflight canônico: ponto ÚNICO consumido pela UI antes de qualquer
-- transmissão. Não reimplementa regra tributária: delega para a validação
-- de rascunho existente e acrescenta gate de ambiente, aritmética de totais
-- e verificação de duplicidade ativa por origem.
CREATE OR REPLACE FUNCTION public.rpc_fiscal_preflight_v1(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- 1) Ambiente (fail-closed, códigos estáveis).
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

  -- 2) Regras de documento/itens/tributos (função existente, não duplicada).
  BEGIN
    v_validate := public.rpc_fiscal_draft_validate_homologation(p_invoice_id);
  EXCEPTION WHEN OTHERS THEN
    v_validate := jsonb_build_object('status','BLOCKED','reason', SQLERRM);
  END;

  IF coalesce(v_validate->>'status','BLOCKED') <> 'READY' THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'FISCAL_DOCUMENT_INCOMPLETE',
      'section', 'DOCUMENTO',
      'field', 'document',
      'message', coalesce(v_validate->>'reason', 'Documento fiscal incompleto para homologacao.'),
      'details', coalesce(v_validate->'missing', '[]'::jsonb),
      'action', 'Completar os campos indicados antes de transmitir.');
  END IF;

  -- 3) Coerência aritmética dos totais (tolerância documentada de R$ 0,01).
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

  -- 4) Duplicidade ativa por origem (mesma regra do índice ux_fiscal_invoice_scope_nfe).
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

  -- 5) Pré-requisito externo: certificado/integração para transmitir.
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
    'environment', coalesce(v_env, 'UNKNOWN'),
    'status', CASE WHEN jsonb_array_length(v_blockers) > 0 THEN 'BLOCKED'
                   WHEN jsonb_array_length(v_warnings) > 0 THEN 'READY_WITH_PREREQUISITES'
                   ELSE 'READY' END,
    'canTransmit', (jsonb_array_length(v_blockers) = 0 AND jsonb_array_length(v_warnings) = 0),
    'blockers', v_blockers,
    'warnings', v_warnings,
    'itemsTotal', v_sum,
    'documentTotal', v_inv.total_amount,
    'toleranceBRL', v_tolerance,
    'evaluatedAt', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_fiscal_preflight_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_preflight_v1(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_fiscal_preflight_v1(uuid) IS
  'H7: preflight fiscal canônico e fail-closed. Ponto único antes de qualquer transmissão.';
