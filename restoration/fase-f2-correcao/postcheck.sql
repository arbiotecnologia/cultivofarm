-- =====================================================================
-- FASE F2 — POSTCHECK DA CORREÇÃO PÓS-AUDITORIA
-- Staging ikaauvsflpmamgxmkhoq. Somente leitura + provas transacionais
-- revertidas. Nenhuma contagem mágica: os números esperados são
-- derivados do próprio catálogo (microrganismos ativos x 12 itens).
-- Falha em qualquer gate aborta com exceção.
-- =====================================================================
\set ON_ERROR_STOP on

DO $pc$
DECLARE
  v int; v_exp int; v_micro int; v_txt text;
BEGIN
  -- ---------------------------------------------------------------
  -- G01 — Função GTIN existe, é IMMUTABLE e valida dígito GS1
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_gtin_is_valid' AND p.provolatile = 'i';
  IF v <> 1 THEN RAISE EXCEPTION 'G01 FAIL: fn_gtin_is_valid imutavel ausente'; END IF;

  -- G02 — GTINs válidos aceitos (EAN-13, EAN-8, UPC-A, GTIN-14)
  IF NOT (public.fn_gtin_is_valid('7891000315507')
      AND public.fn_gtin_is_valid('40170725')
      AND public.fn_gtin_is_valid('036000291452')
      AND public.fn_gtin_is_valid('17891000315504')) THEN
    RAISE EXCEPTION 'G02 FAIL: GTIN valido rejeitado';
  END IF;

  -- G03 — GTINs inválidos rejeitados (dígito verificador errado / tamanho)
  IF public.fn_gtin_is_valid('7891000315508')
     OR public.fn_gtin_is_valid('1234567890123')
     OR public.fn_gtin_is_valid('40170726')
     OR public.fn_gtin_is_valid('123456789')
     OR public.fn_gtin_is_valid('ABCDEFGH')
     OR public.fn_gtin_is_valid(NULL) THEN
    RAISE EXCEPTION 'G03 FAIL: GTIN invalido aceito';
  END IF;

  -- G04 — Constraint de dígito verificador na apresentação
  SELECT count(*) INTO v FROM pg_constraint
   WHERE conrelid = 'public.microorganism_regulatory_presentations'::regclass
     AND conname = 'mrp_gtin_checkdigit_chk';
  IF v <> 1 THEN RAISE EXCEPTION 'G04 FAIL: mrp_gtin_checkdigit_chk ausente'; END IF;

  -- G05 — "SEM GTIN" auditado e mutuamente exclusivo
  SELECT count(*) INTO v FROM pg_constraint
   WHERE conrelid = 'public.microorganism_regulatory_presentations'::regclass
     AND conname IN ('mrp_gtin_absent_reason_chk', 'mrp_gtin_mutual_chk');
  IF v <> 2 THEN RAISE EXCEPTION 'G05 FAIL: declaracao SEM GTIN sem auditoria/exclusividade'; END IF;

  -- ---------------------------------------------------------------
  -- G06 — NCM: fonte oficial obrigatória em PROPOSED
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v FROM pg_constraint
   WHERE conrelid = 'public.microorganism_ncm_candidates'::regclass
     AND conname IN ('mnc_source_required_chk', 'mnc_approved_evidence_chk');
  IF v <> 2 THEN RAISE EXCEPTION 'G06 FAIL: constraints de fonte oficial ausentes'; END IF;

  -- G07 — Allowlist rejeita URL não oficial e aceita .gov.br
  IF public.fn_fiscal_official_url_allowlisted('https://exemplo.com/tipi')
     OR public.fn_fiscal_official_url_allowlisted('https://gov.br.attacker.com/x')
     OR NOT public.fn_fiscal_official_url_allowlisted('https://www.gov.br/receitafederal/tipi') THEN
    RAISE EXCEPTION 'G07 FAIL: allowlist de fonte oficial incorreta';
  END IF;

  -- G08 — Guarda de escopo do candidato publicado (trigger deferível)
  SELECT count(*) INTO v FROM pg_trigger
   WHERE tgrelid = 'public.microorganism_regulatory_dossiers'::regclass
     AND tgname = 'trg_regulatory_published_candidate_guard' AND tgdeferrable;
  IF v <> 1 THEN RAISE EXCEPTION 'G08 FAIL: guarda deferivel de candidato publicado ausente'; END IF;

  -- G09 — Candidato aprovado e publicado é imutável
  SELECT count(*) INTO v FROM pg_trigger
   WHERE tgrelid = 'public.microorganism_ncm_candidates'::regclass
     AND tgname IN ('trg_regulatory_candidate_publication_guard', 'trg_regulatory_ncm_source_guard');
  IF v <> 2 THEN RAISE EXCEPTION 'G09 FAIL: triggers de NCM ausentes'; END IF;

  -- ---------------------------------------------------------------
  -- G10 — Segregação de funções
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v FROM pg_constraint
   WHERE conrelid = 'public.microorganism_regulatory_dossiers'::regclass
     AND conname = 'mrd_sod_override_chk';
  IF v <> 1 THEN RAISE EXCEPTION 'G10 FAIL: mrd_sod_override_chk ausente'; END IF;

  SELECT prosrc INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_regulatory_review_decide';
  IF v_txt NOT LIKE '%REGULATORY_SEGREGATION_OF_DUTIES%' THEN
    RAISE EXCEPTION 'G11 FAIL: revisao sem segregacao de funcoes';
  END IF;

  SELECT prosrc INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_regulatory_dossier_publish';
  IF v_txt NOT LIKE '%count(DISTINCT x)%' OR v_txt NOT LIKE '%REGULATORY_SEGREGATION_OF_DUTIES%' THEN
    RAISE EXCEPTION 'G12 FAIL: publicacao sem exigencia de tres identidades distintas';
  END IF;
  IF v_txt NOT LIKE '%idempotent%' THEN
    RAISE EXCEPTION 'G13 FAIL: publicacao sem caminho idempotente';
  END IF;
  IF v_txt NOT LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'G14 FAIL: publicacao sem advisory lock';
  END IF;

  -- G15 — Override é exclusivo de administrador com justificativa forte
  SELECT prosrc INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_regulatory_sod_override';
  IF v_txt IS NULL OR v_txt NOT LIKE '%administrador%' OR v_txt NOT LIKE '%40%' THEN
    RAISE EXCEPTION 'G15 FAIL: override emergencial sem alcada/justificativa';
  END IF;

  -- G16 — Rejeição volta para DRAFT e nunca publica
  SELECT prosrc INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_regulatory_review_decide';
  IF v_txt NOT LIKE '%REJECTED%THEN ''DRAFT''%' THEN
    RAISE EXCEPTION 'G16 FAIL: rejeicao nao retorna o dossie para DRAFT';
  END IF;

  -- ---------------------------------------------------------------
  -- G17 — Storage escopado por registro
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('fiscal_regulatorio_read', 'fiscal_regulatorio_insert',
                        'fiscal_regulatorio_update', 'fiscal_regulatorio_delete');
  IF v <> 4 THEN RAISE EXCEPTION 'G17 FAIL: policies do bucket incompletas'; END IF;

  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'fiscal_regulatorio_%'
     AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%fn_regulatory_storage_%';
  IF v <> 0 THEN RAISE EXCEPTION 'G18 FAIL: policy do bucket sem escopo de dossie'; END IF;

  -- G19 — Path canônico é exigido
  IF public.fn_regulatory_storage_path_ok('qualquer/arquivo.pdf')
     OR public.fn_regulatory_storage_path_ok('dossiers/x/y/z.pdf')
     OR NOT public.fn_regulatory_storage_path_ok(
          'dossiers/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/rotulo.pdf') THEN
    RAISE EXCEPTION 'G19 FAIL: path canonico nao validado';
  END IF;
  IF public.fn_regulatory_storage_dossier_id(
       'dossiers/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/rotulo.pdf')
     <> '11111111-1111-1111-1111-111111111111'::uuid THEN
    RAISE EXCEPTION 'G20 FAIL: extracao de dossier_id do path incorreta';
  END IF;

  -- G21 — Registro de documento valida escopo e existência do objeto
  SELECT prosrc INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_regulatory_document_register';
  IF v_txt NOT LIKE '%REGULATORY_STORAGE_PATH_OUT_OF_SCOPE%'
     OR v_txt NOT LIKE '%REGULATORY_STORAGE_OBJECT_MISSING%'
     OR v_txt NOT LIKE '%REGULATORY_STORAGE_OWNER_MISMATCH%' THEN
    RAISE EXCEPTION 'G21 FAIL: registro de documento sem validacao de storage';
  END IF;

  -- G22 — Exclusão lógica por RPC + fila compensável
  IF to_regclass('public.regulatory_storage_cleanup_queue') IS NULL THEN
    RAISE EXCEPTION 'G22 FAIL: fila de limpeza ausente';
  END IF;
  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('rpc_regulatory_document_soft_delete', 'rpc_regulatory_storage_cleanup_confirm');
  IF v <> 2 THEN RAISE EXCEPTION 'G23 FAIL: RPCs de exclusao logica/limpeza ausentes'; END IF;

  -- G24 — Sem blob órfão e sem row apontando para objeto inexistente
  SELECT count(*) INTO v
    FROM public.microorganism_regulatory_documents d
   WHERE d.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM storage.objects o
                      WHERE o.bucket_id = d.storage_bucket AND o.name = d.storage_path);
  IF v <> 0 THEN RAISE EXCEPTION 'G24 FAIL: % documento(s) apontando para objeto inexistente', v; END IF;

  SELECT count(*) INTO v FROM storage.objects o
   WHERE o.bucket_id = 'fiscal-regulatorio'
     AND NOT EXISTS (SELECT 1 FROM public.microorganism_regulatory_documents d
                      WHERE d.storage_bucket = o.bucket_id AND d.storage_path = o.name);
  IF v <> 0 THEN RAISE EXCEPTION 'G25 FAIL: % blob(s) orfao(s) no bucket', v; END IF;

  -- ---------------------------------------------------------------
  -- G26 — Estado do cadastro: nada inventado
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v_micro FROM public.microrganismos WHERE ativo;

  SELECT count(*) INTO v FROM public.microorganism_regulatory_dossiers
   WHERE status = 'DRAFT' AND deleted_at IS NULL;
  IF v <> v_micro THEN
    RAISE EXCEPTION 'G26 FAIL: % dossies DRAFT para % microrganismos ativos', v, v_micro;
  END IF;

  SELECT count(*) INTO v FROM public.microorganism_regulatory_dossiers
   WHERE status <> 'DRAFT' AND deleted_at IS NULL;
  IF v <> 0 THEN RAISE EXCEPTION 'G27 FAIL: existe dossie fora de DRAFT'; END IF;

  v_exp := v_micro * 12;
  SELECT count(*) INTO v FROM public.microorganism_regulatory_checklist c
    JOIN public.microorganism_regulatory_dossiers d ON d.id = c.dossier_id
   WHERE d.deleted_at IS NULL;
  IF v <> v_exp THEN RAISE EXCEPTION 'G28 FAIL: checklist com % itens, esperado %', v, v_exp; END IF;

  SELECT count(*) INTO v FROM public.microorganism_regulatory_checklist WHERE state <> 'PENDING';
  IF v <> 0 THEN RAISE EXCEPTION 'G29 FAIL: checklist decidido sem ato humano'; END IF;

  SELECT count(*) INTO v FROM public.microorganism_regulatory_presentations
   WHERE origin_note <> 'CATALOGO_A_CONFIRMAR_FISCALMENTE' OR units_confirmed OR gtin_confirmed;
  IF v <> 0 THEN RAISE EXCEPTION 'G30 FAIL: apresentacao confirmada sem decisao humana'; END IF;

  SELECT count(*) INTO v FROM public.microorganism_ncm_candidates;
  IF v <> 0 THEN RAISE EXCEPTION 'G31 FAIL: existem % candidatos de NCM criados', v; END IF;

  SELECT count(*) INTO v FROM public.microorganism_regulatory_publication_snapshots;
  IF v <> 0 THEN RAISE EXCEPTION 'G32 FAIL: existe snapshot publicado'; END IF;

  SELECT count(*) INTO v FROM public.v_microorganism_fiscal_readiness
   WHERE fiscally_ready OR regulatory_ready OR accounting_validated;
  IF v <> 0 THEN RAISE EXCEPTION 'G33 FAIL: item marcado como fiscalmente pronto'; END IF;

  -- ---------------------------------------------------------------
  -- G34 — RLS: leitura por papel interno, escrita direta fechada
  -- ---------------------------------------------------------------
  SELECT count(*) INTO v FROM pg_tables t
   WHERE t.schemaname = 'public'
     AND t.tablename IN ('fiscal_official_sources','microorganism_regulatory_dossiers',
       'microorganism_regulatory_presentations','microorganism_ncm_candidates',
       'microorganism_regulatory_documents','microorganism_regulatory_checklist',
       'microorganism_regulatory_publication_snapshots','regulatory_storage_cleanup_queue')
     AND NOT t.rowsecurity;
  IF v <> 0 THEN RAISE EXCEPTION 'G34 FAIL: % tabela(s) regulatoria(s) sem RLS', v; END IF;

  SELECT count(*) INTO v FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('fiscal_official_sources','microorganism_regulatory_dossiers',
       'microorganism_regulatory_presentations','microorganism_ncm_candidates',
       'microorganism_regulatory_documents','microorganism_regulatory_checklist',
       'microorganism_regulatory_publication_snapshots','regulatory_storage_cleanup_queue')
     AND cmd <> 'SELECT';
  IF v <> 0 THEN RAISE EXCEPTION 'G35 FAIL: existe policy de escrita direta para authenticated'; END IF;

  -- G36 — anon sem acesso a tabela ou RPC regulatório
  SELECT count(*) INTO v FROM information_schema.role_table_grants
   WHERE grantee = 'anon' AND table_schema = 'public'
     AND table_name IN ('fiscal_official_sources','microorganism_regulatory_dossiers',
       'microorganism_regulatory_presentations','microorganism_ncm_candidates',
       'microorganism_regulatory_documents','microorganism_regulatory_checklist',
       'microorganism_regulatory_publication_snapshots','regulatory_storage_cleanup_queue');
  IF v <> 0 THEN RAISE EXCEPTION 'G36 FAIL: anon com grant em tabela regulatoria'; END IF;

  SELECT count(*) INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND (p.proname LIKE 'rpc_regulatory_%' OR p.proname LIKE 'fn_regulatory_%'
          OR p.proname IN ('fn_gtin_is_valid','fn_fiscal_official_url_allowlisted'))
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v <> 0 THEN RAISE EXCEPTION 'G37 FAIL: % funcao(oes) regulatoria(s) executaveis por anon', v; END IF;

  -- G38 — Imutabilidade de versão publicada e do snapshot
  SELECT count(*) INTO v FROM pg_trigger
   WHERE tgrelid = 'public.microorganism_regulatory_publication_snapshots'::regclass
     AND tgname = 'trg_regulatory_snapshot_lock';
  IF v <> 1 THEN RAISE EXCEPTION 'G38 FAIL: snapshot mutavel'; END IF;
  SELECT count(*) INTO v FROM pg_trigger
   WHERE tgrelid = 'public.microorganism_regulatory_dossiers'::regclass
     AND tgname = 'trg_regulatory_published_lock';
  IF v <> 1 THEN RAISE EXCEPTION 'G39 FAIL: versao publicada mutavel'; END IF;

  RAISE NOTICE 'POSTCHECK F2-CORRECAO: 39/39 GATES PASS (microrganismos ativos=%, checklist=%)', v_micro, v_exp;
END $pc$;

-- ---------------------------------------------------------------------
-- Provas transacionais revertidas (nenhum dado permanece)
-- ---------------------------------------------------------------------
BEGIN;
DO $probe$
DECLARE v_dossier uuid; v_err text;
BEGIN
  SELECT id INTO v_dossier FROM public.microorganism_regulatory_dossiers
   WHERE status = 'DRAFT' AND deleted_at IS NULL LIMIT 1;

  -- P01 — candidato sem fonte oficial é rejeitado
  BEGIN
    INSERT INTO public.microorganism_ncm_candidates
      (dossier_id, ncm, justification, consulted_at)
    VALUES (v_dossier, '30029099', 'justificativa suficientemente longa para o check', current_date);
    RAISE EXCEPTION 'P01 FAIL: candidato sem fonte oficial aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'P01 FAIL%' THEN RAISE; END IF;
  END;

  -- P02 — candidato com URL não oficial é rejeitado
  BEGIN
    INSERT INTO public.microorganism_ncm_candidates
      (dossier_id, ncm, justification, consulted_at, source_url)
    VALUES (v_dossier, '30029099', 'justificativa suficientemente longa para o check',
            current_date, 'https://blogfiscal.example.com/ncm');
    RAISE EXCEPTION 'P02 FAIL: URL nao oficial aceita como fonte';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'P02 FAIL%' THEN RAISE; END IF;
  END;

  -- P03 — GTIN com dígito verificador inválido é rejeitado
  BEGIN
    INSERT INTO public.microorganism_regulatory_presentations
      (dossier_id, volume_ml, label, gtin)
    VALUES (v_dossier, 999999, 'probe', '7891000315508');
    RAISE EXCEPTION 'P03 FAIL: GTIN invalido aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'P03 FAIL%' THEN RAISE; END IF;
  END;

  -- P04 — "SEM GTIN" sem justificativa é rejeitado
  BEGIN
    INSERT INTO public.microorganism_regulatory_presentations
      (dossier_id, volume_ml, label, gtin_absent)
    VALUES (v_dossier, 999998, 'probe', true);
    RAISE EXCEPTION 'P04 FAIL: SEM GTIN sem justificativa aceito';
  EXCEPTION WHEN others THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err LIKE 'P04 FAIL%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'PROVAS TRANSACIONAIS: 4/4 PASS (revertidas)';
END $probe$;
ROLLBACK;
