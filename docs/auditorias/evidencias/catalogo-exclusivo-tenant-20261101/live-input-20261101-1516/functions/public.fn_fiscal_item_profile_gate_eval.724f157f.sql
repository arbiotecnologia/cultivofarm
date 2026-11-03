CREATE OR REPLACE FUNCTION public.fn_fiscal_item_profile_gate_eval(p_scope text, p_crt text, p_is_active boolean, p_profile_status text, p_accounting_validated_at timestamp with time zone, p_accounting_notes text, p_fiscal_description text, p_commercial_unit text, p_taxable_unit text, p_ncm text, p_origin_code text, p_cfop_in_state text, p_cfop_interstate text, p_icms_cst text, p_icms_csosn text, p_pis_cst text, p_cofins_cst text, p_regulatory jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_p jsonb := '[]'::jsonb;   -- pendências técnicas
  v_reg jsonb := '[]'::jsonb; -- pendências regulatórias
  v_na jsonb := '[]'::jsonb;  -- itens declarados NÃO APLICÁVEIS (com justificativa)
  v_notes text := lower(coalesce(p_accounting_notes, ''));
  v_synthetic boolean;
  v_technical_ready boolean;
  v_regulatory_ready boolean;
  v_has_cst boolean := nullif(btrim(coalesce(p_icms_cst,'')),'') IS NOT NULL;
  v_has_csosn boolean := nullif(btrim(coalesce(p_icms_csosn,'')),'') IS NOT NULL;
  v_pend_count int;
BEGIN
  -- ---------------- Camada REGULATÓRIA (Fase F2) ----------------
  -- Exigida apenas onde o dossiê existe como conceito: microrganismos.
  IF p_scope <> 'MICROORGANISM' THEN
    v_reg := '[]'::jsonb;
  ELSIF p_regulatory IS NULL OR p_regulatory = 'null'::jsonb THEN
    v_reg := jsonb_build_array(jsonb_build_object(
      'code','REGULATORY_DOSSIER_MISSING','field','microorganism_regulatory_dossiers','layer','REGULATORY',
      'message','Sem dossie regulatorio cadastrado para o item.'));
  ELSE
    v_na := coalesce(p_regulatory->'checklist_not_applicable','[]'::jsonb);

    IF coalesce(p_regulatory->>'status','') = 'BLOCKED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_DOSSIER_BLOCKED','field','status','layer','REGULATORY',
        'message', coalesce(p_regulatory->>'blocked_reason','Dossie regulatorio bloqueado.')));
    ELSIF coalesce(p_regulatory->>'status','') <> 'VALIDATED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_DOSSIER_NOT_PUBLISHED','field','status','layer','REGULATORY',
        'message','Dossie regulatorio em '||coalesce(p_regulatory->>'status','?')||'; exigido VALIDATED.'));
    END IF;

    IF p_regulatory->>'regulatory_category' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_CATEGORY_MISSING','field','regulatory_category','layer','REGULATORY',
        'message','Finalidade/categoria regulatoria nao definida (nao pode ser presumida pela especie).'));
    END IF;
    IF p_regulatory->>'strain' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_STRAIN_MISSING','field','strain_code','layer','REGULATORY',
        'message','Cepa/estirpe nao informada.'));
    END IF;
    IF p_regulatory->>'formulation' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_FORMULATION_MISSING','field','formulation','layer','REGULATORY',
        'message','Formulacao/apresentacao nao informada.'));
    END IF;
    IF p_regulatory->>'label_guarantee' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_LABEL_GUARANTEE_MISSING','field','label_guarantee','layer','REGULATORY',
        'message','Composicao/garantia de rotulo nao informada.'));
    END IF;

    -- MAPA: MISSING x NOT_APPLICABLE justificado x vencido
    IF coalesce(p_regulatory->>'mapa_status','') = 'NOT_APPLICABLE' THEN
      v_na := v_na || jsonb_build_array(jsonb_build_object(
        'item_key','REGISTRO_MAPA','justification', p_regulatory->>'mapa_not_applicable_reason'));
    ELSIF p_regulatory->>'mapa_registration_number' IS NULL THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_MAPA_REGISTRATION_MISSING','field','mapa_registration_number','layer','REGULATORY',
        'message','Registro MAPA/SIPEAGRO ausente e sem declaracao justificada de nao aplicabilidade.'));
    ELSIF coalesce(p_regulatory->>'mapa_status','') IN ('EXPIRED','SUSPENDED') THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_MAPA_REGISTRATION_INVALID','field','mapa_status','layer','REGULATORY',
        'message','Registro MAPA em situacao '||(p_regulatory->>'mapa_status')||'.'));
    ELSIF (p_regulatory->>'mapa_valid_until') IS NOT NULL
          AND (p_regulatory->>'mapa_valid_until')::date < current_date THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_MAPA_REGISTRATION_INVALID','field','mapa_valid_until','layer','REGULATORY',
        'message','Registro MAPA com validade expirada.'));
    END IF;
    IF p_regulatory->>'mapa_holder' IS NULL AND coalesce(p_regulatory->>'mapa_status','') <> 'NOT_APPLICABLE' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_HOLDER_MISSING','field','mapa_holder','layer','REGULATORY',
        'message','Titular/fabricante do registro nao informado.'));
    END IF;

    -- Documentos de evidência
    IF coalesce((p_regulatory->>'has_label_document')::boolean,false) IS NOT TRUE THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_LABEL_DOCUMENT_MISSING','field','documents','layer','REGULATORY',
        'message','Rotulo nao anexado ao dossie.'));
    END IF;
    IF coalesce((p_regulatory->>'has_report_document')::boolean,false) IS NOT TRUE THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_REPORT_DOCUMENT_MISSING','field','documents','layer','REGULATORY',
        'message','Laudo/certificado de analise nao anexado ao dossie.'));
    END IF;
    IF coalesce((p_regulatory->>'expired_documents')::int,0) > 0 THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_DOCUMENT_EXPIRED','field','documents','layer','REGULATORY',
        'message',(p_regulatory->>'expired_documents')||' documento(s) com validade expirada.'));
    END IF;

    -- Aprovações separadas
    IF coalesce(p_regulatory->>'review_technical','PENDING') <> 'APPROVED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_TECHNICAL_APPROVAL_MISSING','field','technical_review_status','layer','REGULATORY',
        'message','Revisao tecnica nao aprovada.'));
    END IF;
    IF coalesce(p_regulatory->>'review_regulatory','PENDING') <> 'APPROVED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_RESPONSIBLE_APPROVAL_MISSING','field','regulatory_review_status','layer','REGULATORY',
        'message','Revisao do responsavel tecnico (regulatoria) nao aprovada.'));
    END IF;
    IF coalesce(p_regulatory->>'review_fiscal','PENDING') <> 'APPROVED' THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_FISCAL_APPROVAL_MISSING','field','fiscal_review_status','layer','REGULATORY',
        'message','Revisao contabil/fiscal nao aprovada.'));
    END IF;

    -- Checklist
    v_pend_count := jsonb_array_length(coalesce(p_regulatory->'checklist_pending','[]'::jsonb));
    IF v_pend_count > 0 THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_CHECKLIST_INCOMPLETE','field','checklist','layer','REGULATORY',
        'message', v_pend_count||' item(ns) de checklist pendente(s).',
        'items', p_regulatory->'checklist_pending'));
    END IF;

    -- NCM aprovado e coerente com o perfil fiscal
    IF coalesce((p_regulatory->>'ncm_approved')::boolean,false) IS NOT TRUE THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_NCM_NOT_APPROVED','field','microorganism_ncm_candidates','layer','REGULATORY',
        'message','Nenhum candidato de NCM aprovado; sugestao nunca vale como codigo aprovado.'));
    ELSIF nullif(btrim(coalesce(p_ncm,'')),'') IS NOT NULL
          AND p_regulatory->>'published_ncm' IS NOT NULL
          AND p_regulatory->>'published_ncm' <> btrim(p_ncm) THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_NCM_DIVERGES_FROM_PROFILE','field','ncm','layer','REGULATORY',
        'message','NCM do perfil fiscal diverge do NCM publicado no dossie.'));
    END IF;

    -- Apresentações: unidades e GTIN exigem confirmação explícita
    IF coalesce((p_regulatory->>'presentations_total')::int,0) = 0 THEN
      v_reg := v_reg || jsonb_build_array(jsonb_build_object(
        'code','REGULATORY_PRESENTATION_MISSING','field','presentations','layer','REGULATORY',
        'message','Nenhuma apresentacao cadastrada.'));
    ELSE
      IF coalesce((p_regulatory->>'presentations_units_unconfirmed')::int,0) > 0 THEN
        v_reg := v_reg || jsonb_build_array(jsonb_build_object(
          'code','REGULATORY_UNITS_NOT_CONFIRMED','field','presentations.units','layer','REGULATORY',
          'message',(p_regulatory->>'presentations_units_unconfirmed')||' apresentacao(oes) sem uCom/uTrib/fator confirmados.'));
      END IF;
      IF coalesce((p_regulatory->>'presentations_gtin_unconfirmed')::int,0) > 0 THEN
        v_reg := v_reg || jsonb_build_array(jsonb_build_object(
          'code','REGULATORY_GTIN_NOT_DECLARED','field','presentations.gtin','layer','REGULATORY',
          'message',(p_regulatory->>'presentations_gtin_unconfirmed')||' apresentacao(oes) sem GTIN confirmado nem declaracao SEM GTIN.'));
      END IF;
    END IF;
  END IF;

  -- ---------------- Camada TÉCNICA (Fase F1, inalterada) ----------------
  IF p_profile_status IS NULL THEN
    RETURN jsonb_build_object(
      'scope', p_scope, 'ready', false, 'technical_ready', false, 'regulatory_ready', false,
      'status', 'NOT_READY', 'quarantined', false, 'profile_present', false,
      'not_applicable', v_na,
      'pendencies', jsonb_build_array(jsonb_build_object(
        'code','PROFILE_MISSING','field','profile_status','layer','TECHNICAL',
        'message','Item sem perfil fiscal cadastrado.')) || v_reg);
  END IF;

  v_synthetic := v_notes LIKE '%sintetic%'
              OR v_notes LIKE '%sintétic%'
              OR v_notes LIKE '%homologacao%'
              OR v_notes LIKE '%homologação%'
              OR v_notes LIKE '%hml-b2b%'
              OR v_notes LIKE '%test_only%'
              OR v_notes LIKE '%quarentena%';

  IF coalesce(p_is_active, false) IS NOT TRUE THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_INACTIVE','field','is_active','layer','TECHNICAL','message','Perfil fiscal inativo.'));
  END IF;

  IF p_profile_status = 'BLOCKED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_QUARANTINED','field','profile_status','layer','TECHNICAL',
      'message','Perfil fiscal em quarentena (BLOCKED).'));
  ELSIF p_profile_status <> 'VALIDATED' THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_NOT_PUBLISHED','field','profile_status','layer','TECHNICAL',
      'message','Perfil fiscal nao publicado (exigido VALIDATED).'));
  END IF;

  IF p_accounting_validated_at IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','ACCOUNTING_NOT_VALIDATED','field','accounting_validated_at','layer','TECHNICAL',
      'message','Sem validacao contabil preliminar registrada.'));
  END IF;

  IF v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','PROFILE_SYNTHETIC','field','accounting_notes','layer','TECHNICAL',
      'message','Classificacao sintetica de homologacao; nao utilizavel em faturamento.'));
  END IF;

  IF nullif(btrim(coalesce(p_fiscal_description,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_FISCAL_DESCRIPTION','field','fiscal_description','layer','TECHNICAL','message','Descricao fiscal ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_commercial_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_COMMERCIAL_UNIT','field','commercial_unit','layer','TECHNICAL','message','Unidade comercial ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_taxable_unit,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_TAXABLE_UNIT','field','taxable_unit','layer','TECHNICAL','message','Unidade tributavel ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_ncm,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_NCM','field','ncm','layer','TECHNICAL','message','NCM ausente.'));
  ELSIF p_accounting_validated_at IS NULL OR v_synthetic THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','NCM_NOT_ACCOUNTING_REVIEWED','field','ncm','layer','TECHNICAL',
      'message','NCM sem revisao contabil preliminar (validacao contabil ausente ou perfil sintetico). Nao afirma nem substitui evidencia regulatoria.'));
  END IF;
  IF nullif(btrim(coalesce(p_origin_code,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_ORIGIN_CODE','field','origin_code','layer','TECHNICAL','message','Codigo de origem ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cfop_in_state,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_CFOP_IN_STATE','field','cfop_in_state','layer','TECHNICAL','message','CFOP interno ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cfop_interstate,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_CFOP_INTERSTATE','field','cfop_interstate','layer','TECHNICAL','message','CFOP interestadual ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_pis_cst,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_PIS_CST','field','pis_cst','layer','TECHNICAL','message','CST de PIS ausente.'));
  END IF;
  IF nullif(btrim(coalesce(p_cofins_cst,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object('code','MISSING_COFINS_CST','field','cofins_cst','layer','TECHNICAL','message','CST de COFINS ausente.'));
  END IF;

  IF v_has_cst AND v_has_csosn THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','CST_AND_CSOSN_CONFLICT','field','icms_cst,icms_csosn','layer','TECHNICAL',
      'message','CST e CSOSN preenchidos simultaneamente; mutuamente exclusivos.'));
  END IF;

  IF nullif(btrim(coalesce(p_crt,'')),'') IS NULL THEN
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt','layer','TECHNICAL',
      'message','CRT do emitente nao configurado.'));
  ELSIF p_crt = '3' THEN
    IF v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CSOSN_NOT_ALLOWED_FOR_CRT3','field','icms_csosn','layer','TECHNICAL',
        'message','CSOSN e exclusivo do Simples Nacional; emitente em CRT 3 (Regime Normal).'));
    END IF;
    IF NOT v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CST_REQUIRED_FOR_CRT3','field','icms_cst','layer','TECHNICAL',
        'message','CST de ICMS obrigatorio para CRT 3.'));
    END IF;
  ELSIF p_crt IN ('1','2') THEN
    IF v_has_cst THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CST_NOT_ALLOWED_FOR_SIMPLES','field','icms_cst','layer','TECHNICAL',
        'message','CST de ICMS nao se aplica a emitente do Simples Nacional.'));
    END IF;
    IF NOT v_has_csosn THEN
      v_p := v_p || jsonb_build_array(jsonb_build_object(
        'code','CSOSN_REQUIRED_FOR_SIMPLES','field','icms_csosn','layer','TECHNICAL',
        'message','CSOSN obrigatorio para CRT 1/2.'));
    END IF;
  ELSE
    v_p := v_p || jsonb_build_array(jsonb_build_object(
      'code','TAX_REGIME_UNKNOWN','field','company_fiscal_settings.crt','layer','TECHNICAL',
      'message','CRT do emitente com valor nao reconhecido.'));
  END IF;

  v_technical_ready := (jsonb_array_length(v_p) = 0);
  v_regulatory_ready := (jsonb_array_length(v_reg) = 0);

  RETURN jsonb_build_object(
    'scope', p_scope,
    'ready', (v_technical_ready AND v_regulatory_ready),
    'technical_ready', v_technical_ready,
    'regulatory_ready', v_regulatory_ready,
    'status', CASE WHEN (v_technical_ready AND v_regulatory_ready) THEN 'READY' ELSE 'NOT_READY' END,
    'quarantined', (p_profile_status = 'BLOCKED'),
    'profile_present', true,
    'not_applicable', v_na,
    'pendencies', v_p || v_reg);
END
$function$
