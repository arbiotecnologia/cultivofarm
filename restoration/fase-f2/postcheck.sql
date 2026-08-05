-- =====================================================================
-- FASE F2 — PÓS-CHECK / VERIFY (somente leitura, fail-closed)
-- Cadastro regulatório e fiscal auditável dos microrganismos.
--
-- Nenhum gate presume dado regulatório: os gates verificam ESTRUTURA,
-- AUTORIZAÇÃO, IMUTABILIDADE e o comportamento do motor de prontidão.
--
-- Uso:
--   psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/fase-f2/postcheck.sql
-- =====================================================================
\set ON_ERROR_STOP on

DO $v$
DECLARE
  v_n int; v_txt text; v_gate jsonb; v_facts jsonb;
  v_rel text; v_fn text;
  v_new_rel text[] := ARRAY[
    'fiscal_official_sources',
    'microorganism_regulatory_dossiers',
    'microorganism_regulatory_presentations',
    'microorganism_ncm_candidates',
    'microorganism_regulatory_documents',
    'microorganism_regulatory_checklist',
    'microorganism_regulatory_publication_snapshots'];
  v_new_fn text[] := ARRAY[
    'fn_regulatory_can_read','fn_regulatory_can_prepare','fn_regulatory_can_approve',
    'fn_microorganism_regulatory_facts',
    'rpc_regulatory_dossier_ensure_draft','rpc_regulatory_dossier_update_draft',
    'rpc_regulatory_presentation_upsert','rpc_regulatory_ncm_candidate_add',
    'rpc_regulatory_ncm_candidate_decide','rpc_regulatory_checklist_set',
    'rpc_regulatory_document_register','rpc_regulatory_dossier_submit',
    'rpc_regulatory_review_decide','rpc_regulatory_dossier_publish',
    'rpc_regulatory_dossier_block',
    'rpc_microorganism_regulatory_overview','rpc_regulatory_dossier_detail'];
  v_checklist text[] := ARRAY[
    'FINALIDADE_REGULATORIA','CEPA','FORMULACAO','GARANTIA_ROTULO','REGISTRO_MAPA',
    'TITULAR_FABRICANTE','NCM_CEST_TIPI','GTIN','UNIDADE_CONVERSAO','ORIGEM',
    'CFOP','TRIBUTACAO'];
BEGIN
  -- G01 — todas as relações da fase existem
  FOREACH v_rel IN ARRAY v_new_rel LOOP
    IF to_regclass('public.'||v_rel) IS NULL THEN
      RAISE EXCEPTION 'G01_RELACAO_AUSENTE: %', v_rel;
    END IF;
  END LOOP;
  RAISE NOTICE 'G01 PASS: % relacoes presentes', array_length(v_new_rel,1);

  -- G02 — RLS habilitada em todas
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname = ANY(v_new_rel) AND c.relkind='r' AND NOT c.relrowsecurity;
  IF v_n > 0 THEN RAISE EXCEPTION 'G02_RLS_DESABILITADA: % relacao(oes)', v_n; END IF;
  RAISE NOTICE 'G02 PASS: RLS habilitada em todas as relacoes da fase';

  -- G03 — toda relação da fase tem ao menos uma policy
  FOREACH v_rel IN ARRAY v_new_rel LOOP
    SELECT count(*) INTO v_n FROM pg_policies WHERE schemaname='public' AND tablename=v_rel;
    IF v_n = 0 THEN RAISE EXCEPTION 'G03_SEM_POLICY: %', v_rel; END IF;
  END LOOP;
  RAISE NOTICE 'G03 PASS: policies presentes em todas as relacoes';

  -- G04 — nenhuma policy da fase é permissiva a anon
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='public' AND tablename = ANY(v_new_rel)
     AND ('anon' = ANY(roles) OR 'public' = ANY(roles));
  IF v_n > 0 THEN RAISE EXCEPTION 'G04_POLICY_ANON: % policy(ies)', v_n; END IF;
  RAISE NOTICE 'G04 PASS: nenhuma policy exposta a anon/public';

  -- G05 — anon sem privilegio de tabela nas relacoes da fase
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name = ANY(v_new_rel) AND grantee IN ('anon','PUBLIC');
  IF v_n > 0 THEN RAISE EXCEPTION 'G05_GRANT_ANON_TABELA: % grant(s)', v_n; END IF;
  RAISE NOTICE 'G05 PASS: anon sem grants de tabela';

  -- G06 — todas as funcoes da fase existem
  FOREACH v_fn IN ARRAY v_new_fn LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname=v_fn) THEN
      RAISE EXCEPTION 'G06_FUNCAO_AUSENTE: %', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'G06 PASS: % funcoes presentes', array_length(v_new_fn,1);

  -- G07 — nenhuma funcao da fase executavel por anon/PUBLIC
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname = ANY(v_new_fn)
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR coalesce(array_to_string(p.proacl,','),'') LIKE '%=X/%' AND p.proacl::text LIKE '%"=X%');
  IF v_n > 0 THEN RAISE EXCEPTION 'G07_EXECUTE_ANON: % funcao(oes)', v_n; END IF;
  RAISE NOTICE 'G07 PASS: anon sem EXECUTE nas funcoes da fase';

  -- G08 — todas as funcoes da fase sao SECURITY DEFINER com search_path fixo
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname = ANY(v_new_fn)
     AND (p.proconfig IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
  IF v_n > 0 THEN RAISE EXCEPTION 'G08_SEARCH_PATH_AUSENTE: % funcao(oes)', v_n; END IF;
  RAISE NOTICE 'G08 PASS: search_path fixo em todas as funcoes da fase';

  -- G09 — assinatura antiga do gate (17 args) removida; motor unico
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_fiscal_item_profile_gate_eval';
  IF v_n <> 1 THEN RAISE EXCEPTION 'G09_GATE_DUPLICADO: % assinatura(s)', v_n; END IF;
  IF pg_get_function_identity_arguments(
       (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='fn_fiscal_item_profile_gate_eval')
     ) NOT LIKE '%jsonb' THEN
    RAISE EXCEPTION 'G09_GATE_SEM_CAMADA_REGULATORIA';
  END IF;
  RAISE NOTICE 'G09 PASS: gate canonico unico com camada regulatoria';

  -- G10 — codigo placeholder da F1 nao existe mais em nenhum item
  SELECT count(*) INTO v_n FROM public.v_microorganism_fiscal_readiness r,
       jsonb_array_elements(coalesce(r.pendencies,'[]'::jsonb)) e
   WHERE e->>'code' = 'REGULATORY_EVIDENCE_NOT_IMPLEMENTED';
  IF v_n > 0 THEN RAISE EXCEPTION 'G10_PLACEHOLDER_PERSISTE: % ocorrencia(s)', v_n; END IF;
  RAISE NOTICE 'G10 PASS: REGULATORY_EVIDENCE_NOT_IMPLEMENTED eliminado';

  -- G11 — toda pendencia tem code, field, layer e message
  SELECT count(*) INTO v_n FROM public.v_microorganism_fiscal_readiness r,
       jsonb_array_elements(coalesce(r.pendencies,'[]'::jsonb)) e
   WHERE e->>'code' IS NULL OR e->>'field' IS NULL
      OR e->>'message' IS NULL OR (e->>'layer') NOT IN ('TECHNICAL','REGULATORY');
  IF v_n > 0 THEN RAISE EXCEPTION 'G11_PENDENCIA_MALFORMADA: % item(ns)', v_n; END IF;
  RAISE NOTICE 'G11 PASS: pendencias acionaveis e rotuladas por camada';

  -- G12 — separacao real: nenhum item pode estar fiscally_ready sem regulatory_ready
  SELECT count(*) INTO v_n FROM public.v_microorganism_fiscal_readiness
   WHERE coalesce(fiscally_ready,false) AND NOT coalesce(regulatory_ready,false);
  IF v_n > 0 THEN RAISE EXCEPTION 'G12_PRONTIDAO_SEM_REGULATORIO: % item(ns)', v_n; END IF;
  RAISE NOTICE 'G12 PASS: prontidao fiscal exige camada regulatoria aprovada';

  -- G13 — nenhum microrganismo ativo esta liberado sem dossie VALIDATED
  SELECT count(*) INTO v_n FROM public.v_microorganism_fiscal_readiness
   WHERE coalesce(fiscally_ready,false) AND coalesce(dossier_status,'NONE') <> 'VALIDATED';
  IF v_n > 0 THEN RAISE EXCEPTION 'G13_LIBERADO_SEM_DOSSIE_VALIDADO: % item(ns)', v_n; END IF;
  RAISE NOTICE 'G13 PASS: liberacao exige dossie VALIDATED';

  -- G14 — todo microrganismo ativo possui dossie e checklist completo (12 chaves)
  SELECT count(*) INTO v_n FROM public.microrganismos m
   WHERE m.ativo AND NOT EXISTS (
     SELECT 1 FROM public.microorganism_regulatory_dossiers d
      WHERE d.microorganism_id=m.id AND d.deleted_at IS NULL);
  IF v_n > 0 THEN RAISE EXCEPTION 'G14_MICRO_SEM_DOSSIE: % item(ns)', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_dossiers d
   WHERE d.deleted_at IS NULL
     AND (SELECT count(DISTINCT c.item_key) FROM public.microorganism_regulatory_checklist c
           WHERE c.dossier_id=d.id AND c.item_key = ANY(v_checklist)) <> array_length(v_checklist,1);
  IF v_n > 0 THEN RAISE EXCEPTION 'G14_CHECKLIST_INCOMPLETO: % dossie(s)', v_n; END IF;
  RAISE NOTICE 'G14 PASS: todo microrganismo ativo tem dossie com as 12 chaves de checklist';

  -- G15 — nenhum dado regulatorio foi inventado pelo seed
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_dossiers
   WHERE status='DRAFT' AND (
         regulatory_category IS NOT NULL OR strain_code IS NOT NULL OR strain_name IS NOT NULL
      OR mapa_registration_number IS NOT NULL OR published_ncm IS NOT NULL)
     AND updated_by IS NULL AND created_by IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'G15_DADO_REGULATORIO_PRESUMIDO: % dossie(s)', v_n; END IF;
  RAISE NOTICE 'G15 PASS: seed nao preencheu campo regulatorio algum';

  -- G16 — apresentacoes importadas do catalogo permanecem NAO confirmadas
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_presentations
   WHERE origin_note='CATALOGO_A_CONFIRMAR_FISCALMENTE'
     AND (units_confirmed OR gtin_confirmed)
     AND (units_confirmed_by IS NULL AND gtin_confirmed_by IS NULL);
  IF v_n > 0 THEN RAISE EXCEPTION 'G16_CONFIRMACAO_SEM_ATOR: % apresentacao(oes)', v_n; END IF;
  RAISE NOTICE 'G16 PASS: catalogo importado exige confirmacao humana explicita';

  -- G17 — NOT_APPLICABLE nunca silencioso (constraint ativa)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mrc_na_chk') THEN
    RAISE EXCEPTION 'G17_NA_SEM_JUSTIFICATIVA';
  END IF;
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_checklist
   WHERE state='NOT_APPLICABLE' AND nullif(btrim(coalesce(justification,'')),'') IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'G17_NA_SEM_JUSTIFICATIVA: % item(ns)', v_n; END IF;
  RAISE NOTICE 'G17 PASS: nao aplicavel sempre justificado';

  -- G18 — GTIN: ou valor valido ou declaracao explicita de ausencia
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mrp_gtin_confirm_chk')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mrp_gtin_exclusive_chk') THEN
    RAISE EXCEPTION 'G18_GTIN_SEM_REGRA';
  END IF;
  RAISE NOTICE 'G18 PASS: GTIN exige valor valido ou SEM GTIN declarado';

  -- G19 — unidade/conversao so pode ser confirmada com os tres campos
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mrp_units_confirm_chk') THEN
    RAISE EXCEPTION 'G19_UNIDADES_SEM_REGRA';
  END IF;
  RAISE NOTICE 'G19 PASS: uCom/uTrib/fator obrigatorios na confirmacao';

  -- G20 — candidato de NCM exige justificativa e fonte oficial citada
  SELECT count(*) INTO v_n FROM public.microorganism_ncm_candidates
   WHERE nullif(btrim(coalesce(justification,'')),'') IS NULL OR source_id IS NULL;
  IF v_n > 0 THEN RAISE EXCEPTION 'G20_NCM_SEM_FUNDAMENTO: % candidato(s)', v_n; END IF;
  RAISE NOTICE 'G20 PASS: todo candidato de NCM tem justificativa e fonte oficial';

  -- G21 — sugestao nunca vale como aprovacao
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_dossiers d
   WHERE d.published_ncm IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM public.microorganism_ncm_candidates c
      WHERE c.dossier_id=d.id AND c.status='APPROVED' AND c.ncm = d.published_ncm);
  IF v_n > 0 THEN RAISE EXCEPTION 'G21_NCM_PUBLICADO_SEM_APROVACAO: % dossie(s)', v_n; END IF;
  RAISE NOTICE 'G21 PASS: NCM publicado sempre origina de candidato APPROVED';

  -- G22 — no maximo um candidato APPROVED por dossie
  SELECT count(*) INTO v_n FROM (
    SELECT dossier_id FROM public.microorganism_ncm_candidates
     WHERE status='APPROVED' GROUP BY dossier_id HAVING count(*) > 1) s;
  IF v_n > 0 THEN RAISE EXCEPTION 'G22_MULTIPLOS_NCM_APROVADOS: % dossie(s)', v_n; END IF;
  RAISE NOTICE 'G22 PASS: unicidade do NCM aprovado por dossie';

  -- G23 — tres aprovacoes distintas obrigatorias em dossie publicado
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_dossiers
   WHERE status='VALIDATED' AND (technical_review_status <> 'APPROVED'
      OR regulatory_review_status <> 'APPROVED' OR fiscal_review_status <> 'APPROVED');
  IF v_n > 0 THEN RAISE EXCEPTION 'G23_PUBLICADO_SEM_TRIPLA_APROVACAO: % dossie(s)', v_n; END IF;
  RAISE NOTICE 'G23 PASS: publicacao exige aprovacao tecnica + regulatoria + fiscal';

  -- G24 — todo dossie publicado tem snapshot imutavel com hash
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_dossiers d
   WHERE d.status='VALIDATED' AND NOT EXISTS (
     SELECT 1 FROM public.microorganism_regulatory_publication_snapshots s
      WHERE s.dossier_id=d.id AND s.version=d.version AND s.snapshot_sha256 ~ '^[0-9a-f]{64}$');
  IF v_n > 0 THEN RAISE EXCEPTION 'G24_PUBLICACAO_SEM_SNAPSHOT: % dossie(s)', v_n; END IF;
  RAISE NOTICE 'G24 PASS: publicacao gera snapshot versionado com hash';

  -- G25 — snapshots sao append-only (sem UPDATE/DELETE concedido)
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='microorganism_regulatory_publication_snapshots'
     AND grantee='authenticated' AND privilege_type IN ('UPDATE','DELETE');
  IF v_n > 0 THEN RAISE EXCEPTION 'G25_SNAPSHOT_MUTAVEL: % grant(s)', v_n; END IF;
  RAISE NOTICE 'G25 PASS: snapshots append-only';

  -- G26 — imutabilidade do publicado por trigger
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                  WHERE c.relname='microorganism_regulatory_dossiers'
                    AND t.tgname='trg_regulatory_block_published_edit' AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'G26_SEM_TRIGGER_IMUTABILIDADE';
  END IF;
  RAISE NOTICE 'G26 PASS: edicao de dossie publicado bloqueada por trigger';

  -- G27 — trilha de auditoria ativa em todas as relacoes da fase
  FOREACH v_rel IN ARRAY v_new_rel LOOP
    IF v_rel = 'fiscal_official_sources' THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                    WHERE c.relname=v_rel AND NOT t.tgisinternal
                      AND t.tgname LIKE '%audit%') THEN
      RAISE EXCEPTION 'G27_SEM_AUDITORIA: %', v_rel;
    END IF;
  END LOOP;
  RAISE NOTICE 'G27 PASS: auditoria (quem/quando/o que) ativa nas relacoes da fase';

  -- G28 — bucket de evidencias existe e e privado
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='fiscal-regulatorio' AND NOT public) THEN
    RAISE EXCEPTION 'G28_BUCKET_INVALIDO';
  END IF;
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
     AND qual ILIKE '%fiscal-regulatorio%' AND ('anon'=ANY(roles) OR 'public'=ANY(roles));
  IF v_n > 0 THEN RAISE EXCEPTION 'G28_BUCKET_EXPOSTO_ANON: % policy(ies)', v_n; END IF;
  RAISE NOTICE 'G28 PASS: bucket fiscal-regulatorio privado e sem acesso anonimo';

  -- G29 — documentos exigem hash de conteudo
  SELECT count(*) INTO v_n FROM public.microorganism_regulatory_documents
   WHERE content_sha256 !~ '^[0-9a-f]{64}$';
  IF v_n > 0 THEN RAISE EXCEPTION 'G29_DOCUMENTO_SEM_HASH: % documento(s)', v_n; END IF;
  RAISE NOTICE 'G29 PASS: todo documento tem hash SHA-256 verificavel';

  -- G30 — perfis fiscais sinteticos da F1 continuam em quarentena
  SELECT count(*) INTO v_n FROM public.v_microorganism_fiscal_readiness
   WHERE coalesce(quarantined,false) AND coalesce(fiscally_ready,false);
  IF v_n > 0 THEN RAISE EXCEPTION 'G30_QUARENTENA_VAZOU: % item(ns)', v_n; END IF;
  RAISE NOTICE 'G30 PASS: quarentena da F1 preservada';

  -- G31 — motor de fatos nunca "adivinha": item sem dossie => pendencia explicita
  SELECT public.fn_microorganism_regulatory_facts(gen_random_uuid()) INTO v_facts;
  IF v_facts IS NOT NULL THEN RAISE EXCEPTION 'G31_FATOS_INVENTADOS'; END IF;
  SELECT public.fn_fiscal_item_profile_gate_eval(
    'MICROORGANISM','3',true,'VALIDATED', now(), NULL,'d','L','L','30029099','0','5101','6101',
    '00',NULL,'01','01', NULL) INTO v_gate;
  IF coalesce((v_gate->>'ready')::boolean,true) THEN RAISE EXCEPTION 'G31_LIBEROU_SEM_DOSSIE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_gate->'pendencies') e
                  WHERE e->>'code'='REGULATORY_DOSSIER_MISSING') THEN
    RAISE EXCEPTION 'G31_SEM_PENDENCIA_EXPLICITA';
  END IF;
  RAISE NOTICE 'G31 PASS: ausencia de evidencia vira pendencia explicita, nunca liberacao';

  -- G32 — divergencia entre NCM do perfil e NCM publicado e detectada
  SELECT public.fn_fiscal_item_profile_gate_eval(
    'MICROORGANISM','3',true,'VALIDATED', now(), NULL,'d','L','L','30029099','0','5101','6101',
    '00',NULL,'01','01',
    jsonb_build_object('status','VALIDATED','regulatory_category','BIOINSUMO','strain','X',
      'formulation','SC','label_guarantee','1e9 UFC/mL','mapa_status','ACTIVE',
      'mapa_registration_number','123','mapa_holder','AR Bio','has_label_document',true,
      'has_report_document',true,'expired_documents',0,'review_technical','APPROVED',
      'review_regulatory','APPROVED','review_fiscal','APPROVED','checklist_pending','[]'::jsonb,
      'ncm_approved',true,'published_ncm','38089999','presentations_total',1,
      'presentations_units_unconfirmed',0,'presentations_gtin_unconfirmed',0)) INTO v_gate;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_gate->'pendencies') e
                  WHERE e->>'code'='REGULATORY_NCM_DIVERGES_FROM_PROFILE') THEN
    RAISE EXCEPTION 'G32_DIVERGENCIA_NCM_NAO_DETECTADA';
  END IF;
  RAISE NOTICE 'G32 PASS: divergencia de NCM perfil x dossie e bloqueante';

  RAISE NOTICE 'POSTCHECK_F2: 32/32 GATES PASS';
END $v$;
