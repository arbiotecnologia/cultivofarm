-- ============================================================================
-- MATRIZ FISCAL MESTRE v1.0 (07/08/2026) - MICRORGANISMOS
-- Artefato canonico de migration: 20260824000000_matriz_fiscal_mestre_v1_microrganismos
--
-- Consolida a carga aplicada em staging pelo kit restoration/matriz-fiscal-microrganismos/
-- e as 3 correcoes da auditoria independente do commit 1d14c53e:
--   (1) dominio de confianca passa a suportar CONDITIONAL (sem reducao semantica);
--   (2) ledger de proveniencia do lote, para rollback comprovavel de regulatory_category;
--   (3) historico oficial de migrations (este arquivo, versao 20260824000000).
--
-- Escopo: staging ikaauvsflpmamgxmkhoq. Producao navfzbwgwzruipouyfnk PROIBIDA.
-- Propriedades: fail-closed, transacional, idempotente (2a execucao nao duplica nem
-- toca updated_at) e reversivel por 90-rollback.sql.
--
-- INVARIANTES (asseridas ao final; qualquer violacao aborta tudo):
--   * Nenhum perfil fiscal sai de DRAFT; nenhuma validacao contabil.
--   * Nenhum dossie sai de DRAFT; nenhum published_ncm/cest.
--   * Nenhum candidato de NCM aprovado; nenhum item de checklist decidido.
--   * Nenhuma tax rule criada ou publicada; company_fiscal_settings intocada.
--   * Faturamento real permanece bloqueado pelos gates F1/F2/F3/F4.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE A - EVOLUCAO DO DOMINIO DE CONFIANCA (compativel e reversivel)
-- microorganism_ncm_candidates.confidence e TEXT + CHECK (NAO e ENUM fisico),
-- portanto a adicao de 'CONDITIONAL' e FISICAMENTE REVERSIVEL: basta converter
-- os valores e reinstalar o CHECK anterior (ver 90-rollback.sql, passo 0).
-- ----------------------------------------------------------------------------
ALTER TABLE public.microorganism_ncm_candidates
  DROP CONSTRAINT IF EXISTS mnc_conf_chk;
ALTER TABLE public.microorganism_ncm_candidates
  ADD CONSTRAINT mnc_conf_chk
  CHECK (confidence = ANY (ARRAY['LOW','MEDIUM','HIGH','CONDITIONAL']));

-- Fail-closed: candidato CONDITIONAL nunca pode ser aprovado.
ALTER TABLE public.microorganism_ncm_candidates
  DROP CONSTRAINT IF EXISTS mnc_conditional_not_approved_chk;
ALTER TABLE public.microorganism_ncm_candidates
  ADD CONSTRAINT mnc_conditional_not_approved_chk
  CHECK (status <> 'APPROVED' OR confidence <> 'CONDITIONAL');

COMMENT ON COLUMN public.microorganism_ncm_candidates.confidence IS
  'Confianca declarada: LOW | MEDIUM | HIGH | CONDITIONAL. CONDITIONAL = enquadramento depende da alegacao de uso e nao pode ser aprovado.';

-- ----------------------------------------------------------------------------
-- PARTE B - LEDGER DE PROVENIENCIA DO LOTE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_matrix_load_ledger (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_marker   text NOT NULL,
  table_name     text NOT NULL,
  record_id      uuid NOT NULL,
  column_name    text NOT NULL,
  previous_value text,
  applied_value  text,
  applied_at     timestamptz NOT NULL DEFAULT now(),
  applied_by     uuid,
  CONSTRAINT fiscal_matrix_load_ledger_uq
    UNIQUE (batch_marker, table_name, record_id, column_name)
);

GRANT SELECT ON public.fiscal_matrix_load_ledger TO authenticated;
GRANT ALL ON public.fiscal_matrix_load_ledger TO service_role;

ALTER TABLE public.fiscal_matrix_load_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_matrix_load_ledger_read ON public.fiscal_matrix_load_ledger;
CREATE POLICY fiscal_matrix_load_ledger_read
  ON public.fiscal_matrix_load_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

DROP POLICY IF EXISTS fiscal_matrix_load_ledger_no_write ON public.fiscal_matrix_load_ledger;
CREATE POLICY fiscal_matrix_load_ledger_no_write
  ON public.fiscal_matrix_load_ledger FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

COMMENT ON TABLE public.fiscal_matrix_load_ledger IS
  'Proveniencia campo a campo das cargas fiscais em lote (ex.: MATRIZ_FISCAL_MESTRE_V1). Leitura somente administrador.';

-- ----------------------------------------------------------------------------
-- PARTE C - CARGA / RECONCILIACAO IDEMPOTENTE
-- ----------------------------------------------------------------------------
DO $matriz$
DECLARE
  c_mark        constant text := 'MATRIZ_FISCAL_MESTRE_V1';
  c_matrix_ver  constant text := 'Matriz Fiscal Mestre AR Bio v1.0 (07/08/2026) - PRELIMINAR';
  c_consulted   constant date := DATE '2026-08-07';
  v_actor       uuid;
  v_source      uuid;
  v_prod        int;
  r             record;
  v_dossier     uuid;
  v_existing    int;
  v_cat         text;
BEGIN
  -- 0. GUARDA FAIL-CLOSED DE AMBIENTE (staging apenas).
  SELECT count(*) INTO v_prod
  FROM public.company_fiscal_settings
  WHERE coalesce(production_enabled, false) IS TRUE
     OR upper(coalesce(fiscal_environment, '')) = 'PRODUCTION'
     OR coalesce(nfe_environment_code, '') = '1';
  IF v_prod > 0 THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_PRODUCTION_ENVIRONMENT: emitente com ambiente produtivo; carga bloqueada.'
      USING ERRCODE = '55006';
  END IF;

  SELECT id INTO v_actor FROM auth.users WHERE email = 'admin@arbio.com' LIMIT 1;
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_NO_ACTOR: ator de importacao nao encontrado.' USING ERRCODE = '55006';
  END IF;

  SELECT id INTO v_source
  FROM public.fiscal_official_sources
  WHERE source_key = 'RFB_NCM_TIPI'
  LIMIT 1;
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_NO_SOURCE: fonte oficial RFB_NCM_TIPI ausente.' USING ERRCODE = '55006';
  END IF;

  -- 1. MATRIZ CANONICA (27 itens).
  CREATE TEMP TABLE _matriz_v1 (
    codigo            text PRIMARY KEY,
    nome              text NOT NULL,
    nome_cientifico   text NOT NULL,
    tipo              text NOT NULL,
    ufc_ml            numeric,
    ufc_label         text,
    ncm               text NOT NULL,
    ncm_alt           text,
    confianca         text NOT NULL,
    finalidade        text NOT NULL,
    perfil            text NOT NULL,
    rota_mapa         text NOT NULL,
    condicional       boolean NOT NULL,
    novo              boolean NOT NULL DEFAULT false
  ) ON COMMIT DROP;

  INSERT INTO _matriz_v1
    (codigo, nome, nome_cientifico, tipo, ufc_ml, ufc_label, ncm, ncm_alt, confianca, finalidade, perfil, rota_mapa, condicional, novo)
  VALUES
    ('BAC-1','Azospirillum brasilense','Azospirillum brasilense','bacteria',2.1e9,'2,1 × 10⁹','30024999',NULL,'HIGH','Inoculante/FBN associativa','PF-01','Inoculante',false,true),
    ('BAC-2','Bacillus amyloliquefaciens','Bacillus amyloliquefaciens','bacteria',NULL,NULL,'30024999',NULL,'MEDIUM','Inoculante/promotor/biocontrole','PF-03','Inoculante ou biocontrole',false,false),
    ('BAC-3','Bacillus aryabhattai','Bacillus aryabhattai','bacteria',NULL,NULL,'30024999',NULL,'MEDIUM','Promotor/tolerancia a estresse','PF-03','Inoculante/promotor',false,false),
    ('BAC-4','Bacillus licheniformis','Bacillus licheniformis','bacteria',NULL,NULL,'30024999',NULL,'MEDIUM','Promotor/biocontrole','PF-03','Inoculante ou biocontrole',false,false),
    ('BAC-5','Bacillus megaterium','Bacillus megaterium','bacteria',NULL,NULL,'30024999',NULL,'MEDIUM','Solubilizador de fosforo','PF-03','Inoculante/biofertilizante',false,false),
    ('BAC-6','Bacillus methylotrophicus','Bacillus methylotrophicus','bacteria',NULL,NULL,'30024999',NULL,'MEDIUM','Promotor/biocontrole','PF-03','Inoculante ou biocontrole',false,false),
    ('BAC-7','Bacillus pumilus','Bacillus pumilus','bacteria',NULL,NULL,'30024999',NULL,'MEDIUM','Promotor/antagonismo','PF-03','Inoculante ou biocontrole',false,false),
    ('BAC-8','Bacillus subtilis','Bacillus subtilis','bacteria',NULL,NULL,'30024999','38089299','CONDITIONAL','Promotor ou biofungicida','DEPENDE DA ALEGACAO','Inoculante ou controle fitossanitario',true,false),
    ('BAC-9','Bacillus thuringiensis aizawai','Bacillus thuringiensis aizawai','bacteria',NULL,NULL,'38089191',NULL,'HIGH','Inseticida microbiologico','PF-02','Controle fitossanitario',false,false),
    ('BAC-10','Bacillus thuringiensis kurstaki','Bacillus thuringiensis kurstaki','bacteria',NULL,NULL,'38089191',NULL,'HIGH','Inseticida microbiologico','PF-02','Controle fitossanitario',false,false),
    ('BAC-11','Bacillus velezensis','Bacillus velezensis','bacteria',NULL,NULL,'30024999',NULL,'MEDIUM','Promotor/antagonista','PF-03','Inoculante ou biocontrole',false,false),
    ('BAC-12','Bradyrhizobium japonicum','Bradyrhizobium japonicum','bacteria',2.5e9,'2,5 × 10⁹','30024999',NULL,'HIGH','Inoculante/FBN simbiotica','PF-01','Inoculante',false,true),
    ('BAC-13','Methylobacterium Symbioticum','Methylobacterium symbioticum','bacteria',NULL,NULL,'30024999',NULL,'CONDITIONAL','Inoculante/FBN','PF-01 condicional','Inoculante',true,false),
    ('BAC-14','Chromobacterium subtsugae','Chromobacterium subtsugae','bacteria',NULL,NULL,'38089199',NULL,'MEDIUM','Inseticida microbiologico','PF-02','Controle fitossanitario',false,false),
    ('BAC-15','Pseudomonas fluorescens','Pseudomonas fluorescens','bacteria',NULL,NULL,'30024999',NULL,'MEDIUM','Solubilizador/promotor/antagonista','PF-03','Inoculante/promotor',false,false),
    ('BAC-16','Saccharopolyspora spinosa','Saccharopolyspora spinosa','bacteria',NULL,NULL,'30024999',NULL,'CONDITIONAL','Cultura viva/potencial biocontrole','PF-03','Definir; nao confundir com metabolito formulado',true,false),
    ('BAC-17','Pantoea agglomerans','Pantoea agglomerans','bacteria',2.0e9,'2,0 × 10⁹','30024999',NULL,'CONDITIONAL','Promotor/potencial biocontrole','PF-03 condicional','Definir apos alegacao',true,true),
    ('FUN-1','Beauveria bassiana','Beauveria bassiana','fungo',NULL,NULL,'38089199',NULL,'MEDIUM','Inseticida microbiologico','PF-02','Controle fitossanitario',false,false),
    ('FUN-2','Metarhizium anisopliae','Metarhizium anisopliae','fungo',NULL,NULL,'38089199',NULL,'MEDIUM','Inseticida microbiologico','PF-02','Controle fitossanitario',false,false),
    ('FUN-3','Paecilomyces lilacinus','Paecilomyces lilacinus','fungo',NULL,NULL,'38089999',NULL,'CONDITIONAL','Nematicida microbiologico','PF-02 condicional','Controle fitossanitario',true,false),
    ('FUN-4','Purpureocillium lilacinum','Purpureocillium lilacinum','fungo',NULL,NULL,'38089999',NULL,'CONDITIONAL','Nematicida microbiologico','PF-02 condicional','Controle fitossanitario',true,false),
    ('FUN-5','Trichoderma asperellum','Trichoderma asperellum','fungo',NULL,NULL,'38089299',NULL,'MEDIUM','Fungicida microbiologico/promotor','PF-02','Controle fitossanitario',false,false),
    ('FUN-6','Trichoderma harzianum','Trichoderma harzianum','fungo',NULL,NULL,'38089299',NULL,'MEDIUM','Fungicida microbiologico/promotor','PF-02','Controle fitossanitario',false,false),
    ('FUN-7','Isaria fumosorosea','Isaria fumosorosea','fungo',NULL,NULL,'38089199',NULL,'MEDIUM','Inseticida microbiologico','PF-02','Controle fitossanitario',false,false),
    ('FUN-8','Pochonia chlamydosporia','Pochonia chlamydosporia','fungo',NULL,NULL,'38089999',NULL,'MEDIUM','Nematicida microbiologico','PF-02','Controle fitossanitario',false,false),
    ('FUN-9','Cordyceps javanica','Cordyceps javanica','fungo',NULL,NULL,'38089199',NULL,'MEDIUM','Inseticida microbiologico','PF-02','Controle fitossanitario',false,false),
    ('CON-1','E.M - Microrganismos Eficientes','E.M - Microrganismos Eficientes','consorcio',NULL,NULL,'30024999',NULL,'CONDITIONAL','Cultura mista agricola','PF-03 condicional','Definir apos composicao',true,false);

  -- 2. CONCILIACAO: criar apenas os registros ausentes (sem duplicar).
  INSERT INTO public.microrganismos
    (nome, nome_cientifico, tipo, codigo, concentracao_ufc_ml, concentracao_label,
     ativo, b2b_enabled, observacoes)
  SELECT m.nome, m.nome_cientifico, m.tipo::tipo_microrganismo, m.codigo,
         m.ufc_ml, m.ufc_label, true, true,
         '[' || c_mark || '] Registro criado pela conciliacao autorizada da ' || c_matrix_ver || '.'
  FROM _matriz_v1 m
  WHERE m.novo IS TRUE
    AND NOT EXISTS (SELECT 1 FROM public.microrganismos x WHERE x.codigo = m.codigo)
    AND NOT EXISTS (SELECT 1 FROM public.microrganismos x WHERE lower(btrim(x.nome)) = lower(btrim(m.nome)))
    AND NOT EXISTS (SELECT 1 FROM public.microrganismos x
                     WHERE lower(btrim(coalesce(x.nome_cientifico,''))) = lower(btrim(m.nome_cientifico)));

  -- 3. CORRESPONDENCIA ESTRITA (sem fallback silencioso).
  SELECT count(*) INTO v_existing
  FROM _matriz_v1 m
  WHERE NOT EXISTS (SELECT 1 FROM public.microrganismos x WHERE x.codigo = m.codigo);
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_UNMATCHED: % item(ns) da matriz sem correspondencia por codigo.', v_existing
      USING ERRCODE = '55006';
  END IF;

  SELECT count(*) INTO v_existing
  FROM _matriz_v1 m
  JOIN public.microrganismos x ON x.codigo = m.codigo
  WHERE lower(btrim(regexp_replace(coalesce(nullif(btrim(x.nome_cientifico),''), x.nome), '\s+', ' ', 'g')))
     <> lower(btrim(regexp_replace(m.nome_cientifico, '\s+', ' ', 'g')));
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_NAME_MISMATCH: % item(ns) com nome cientifico divergente.', v_existing
      USING ERRCODE = '55006';
  END IF;

  -- 4/5. DOSSIE DRAFT, CHECKLIST, APRESENTACAO 1 L, CANDIDATOS E PERFIL.
  FOR r IN
    SELECT m.*, x.id AS micro_id
    FROM _matriz_v1 m
    JOIN public.microrganismos x ON x.codigo = m.codigo
    ORDER BY m.codigo
  LOOP
    SELECT id INTO v_dossier
    FROM public.microorganism_regulatory_dossiers
    WHERE microorganism_id = r.micro_id
      AND status IN ('DRAFT', 'PENDING_REVIEW')
      AND deleted_at IS NULL
    ORDER BY version DESC
    LIMIT 1;

    IF v_dossier IS NULL THEN
      INSERT INTO public.microorganism_regulatory_dossiers
        (microorganism_id, version, status, created_by, updated_by)
      VALUES (r.micro_id, 1, 'DRAFT', v_actor, v_actor)
      RETURNING id INTO v_dossier;
    END IF;

    -- Finalidade regulatoria: gravada apenas quando a matriz e inequivoca.
    v_cat := CASE
               WHEN r.condicional THEN NULL
               WHEN r.perfil = 'PF-01' THEN 'INOCULANTE'
               WHEN r.perfil = 'PF-02' THEN 'AGENTE_BIOLOGICO_CONTROLE'
               WHEN r.perfil = 'PF-03' THEN 'OUTRO_A_DEFINIR'
             END;

    IF v_cat IS NOT NULL THEN
      UPDATE public.microorganism_regulatory_dossiers d
         SET regulatory_category = v_cat,
             updated_by = v_actor
       WHERE d.id = v_dossier
         AND d.status = 'DRAFT'
         AND d.deleted_at IS NULL
         AND d.regulatory_category IS NULL;

      -- Ledger de proveniencia (idempotente).
      INSERT INTO public.fiscal_matrix_load_ledger
        (batch_marker, table_name, record_id, column_name, previous_value, applied_value, applied_by)
      SELECT c_mark, 'microorganism_regulatory_dossiers', v_dossier, 'regulatory_category', NULL, v_cat, v_actor
      WHERE EXISTS (
        SELECT 1 FROM public.microorganism_regulatory_dossiers d
        WHERE d.id = v_dossier AND d.regulatory_category = v_cat
      )
      ON CONFLICT (batch_marker, table_name, record_id, column_name) DO NOTHING;
    END IF;

    -- Checklist: 12 itens, todos PENDING.
    INSERT INTO public.microorganism_regulatory_checklist (dossier_id, item_key, state)
    SELECT v_dossier, k.item_key, 'PENDING'
    FROM (SELECT unnest(ARRAY[
            'FINALIDADE_REGULATORIA','CEPA','FORMULACAO','GARANTIA_ROTULO','REGISTRO_MAPA',
            'TITULAR_FABRICANTE','NCM_CEST_TIPI','GTIN','UNIDADE_CONVERSAO','ORIGEM',
            'CFOP','TRIBUTACAO']) AS item_key) k
    WHERE NOT EXISTS (
      SELECT 1 FROM public.microorganism_regulatory_checklist c
      WHERE c.dossier_id = v_dossier AND c.item_key = k.item_key
    );

    -- Apresentacao 1 L.
    INSERT INTO public.microorganism_regulatory_presentations
      (dossier_id, volume_ml, label, origin_note, commercial_unit, taxable_unit, conversion_factor,
       units_confirmed, gtin, gtin_absent, gtin_absent_reason, gtin_absent_by, gtin_absent_at,
       gtin_confirmed, created_by, updated_by)
    SELECT v_dossier, 1000, '1 L', c_mark, 'L', 'L', 1,
           false, NULL, true,
           'SEM GTIN ate cadastramento - ' || c_matrix_ver
             || '. Fabricacao propria; GTIN nao atribuido para esta apresentacao.',
           v_actor, now(), false, v_actor, v_actor
    WHERE NOT EXISTS (
      SELECT 1 FROM public.microorganism_regulatory_presentations p
      WHERE p.dossier_id = v_dossier AND p.volume_ml = 1000
    );

    -- Candidato de NCM primario - PROPOSED, nunca aprovado.
    -- Confianca gravada com a semantica ORIGINAL da matriz (inclui CONDITIONAL).
    INSERT INTO public.microorganism_ncm_candidates
      (dossier_id, ncm, cest, justification, confidence, source_id, consulted_at, status,
       table_version, table_reference_date, created_by)
    SELECT v_dossier, r.ncm, NULL,
           '[' || c_mark || '] ' || c_matrix_ver || ' | Finalidade declarada: ' || r.finalidade
             || ' | Perfil tributario proposto: ' || r.perfil
             || ' | Rota regulatoria: ' || r.rota_mapa
             || ' | Confianca declarada na matriz: ' || r.confianca
             || ' | CEST nulo por padrao, pendente validacao item a item.'
             || ' | PROPOSTA PRELIMINAR: nao vale como classificacao aprovada.',
           CASE WHEN r.confianca IN ('LOW','MEDIUM','HIGH','CONDITIONAL') THEN r.confianca ELSE 'LOW' END,
           v_source, c_consulted, 'PROPOSED',
           'TIPI vigente (referencia da matriz)', c_consulted, v_actor
    WHERE NOT EXISTS (
      SELECT 1 FROM public.microorganism_ncm_candidates c
      WHERE c.dossier_id = v_dossier AND c.ncm = r.ncm
        AND c.justification LIKE '[' || c_mark || ']%'
    );

    -- Candidato alternativo (apenas Bacillus subtilis, conforme matriz).
    IF r.ncm_alt IS NOT NULL THEN
      INSERT INTO public.microorganism_ncm_candidates
        (dossier_id, ncm, cest, justification, confidence, source_id, consulted_at, status,
         table_version, table_reference_date, created_by)
      SELECT v_dossier, r.ncm_alt, NULL,
             '[' || c_mark || '] ' || c_matrix_ver
               || ' | Candidato ALTERNATIVO, condicional a alegacao de uso.'
               || ' | Finalidade declarada: ' || r.finalidade
               || ' | Rota regulatoria: ' || r.rota_mapa
               || ' | Nenhum dos candidatos pode ser aprovado antes da definicao da alegacao.',
             'CONDITIONAL', v_source, c_consulted, 'PROPOSED',
             'TIPI vigente (referencia da matriz)', c_consulted, v_actor
      WHERE NOT EXISTS (
        SELECT 1 FROM public.microorganism_ncm_candidates c
        WHERE c.dossier_id = v_dossier AND c.ncm = r.ncm_alt
          AND c.justification LIKE '[' || c_mark || ']%'
      );
    END IF;

    -- Reconciliacao semantica (correcao 1): candidatos do lote gravados como LOW
    -- por limitacao do dominio antigo voltam a CONDITIONAL.
    UPDATE public.microorganism_ncm_candidates c
       SET confidence = 'CONDITIONAL'
     WHERE c.dossier_id = v_dossier
       AND c.justification LIKE '[' || c_mark || ']%'
       AND c.status = 'PROPOSED'
       AND r.confianca = 'CONDITIONAL'
       AND c.confidence <> 'CONDITIONAL';

    UPDATE public.microorganism_ncm_candidates c
       SET confidence = 'CONDITIONAL'
     WHERE c.dossier_id = v_dossier
       AND c.justification LIKE '[' || c_mark || '] % | Candidato ALTERNATIVO,%'
       AND c.status = 'PROPOSED'
       AND c.confidence <> 'CONDITIONAL';

    -- Perfil fiscal DRAFT (um ativo por microrganismo).
    SELECT count(*) INTO v_existing
    FROM public.microorganism_fiscal_profiles p
    WHERE p.microorganism_id = r.micro_id
      AND p.is_active IS TRUE
      AND coalesce(p.accounting_notes, '') NOT LIKE '%[' || c_mark || ']%';
    IF v_existing > 0 THEN
      RAISE EXCEPTION 'MATRIZ_ABORT_PROFILE_CONFLICT: perfil ativo preexistente em % fora desta carga.', r.codigo
        USING ERRCODE = '55006';
    END IF;

    INSERT INTO public.microorganism_fiscal_profiles
      (microorganism_id, is_active, fiscal_description, commercial_unit, taxable_unit,
       ncm, cest, origin_code, cfop_in_state, cfop_interstate,
       icms_cst, icms_csosn, pis_cst, cofins_cst, ipi_cst,
       gtin, taxable_gtin, tax_benefit_code, profile_status,
       accounting_notes, accounting_validated_at, accounting_validated_by, created_by, updated_by)
    SELECT
      r.micro_id, true,
      r.nome_cientifico || ' - ' || r.finalidade || ' (classificacao PRELIMINAR)',
      'L', 'L',
      r.ncm, NULL, '0', '5101', '6101',
      NULL, NULL,
      CASE WHEN r.condicional THEN NULL
           WHEN r.perfil IN ('PF-01','PF-02') THEN '06'
           WHEN r.perfil = 'PF-03' THEN '01' END,
      CASE WHEN r.condicional THEN NULL
           WHEN r.perfil IN ('PF-01','PF-02') THEN '06'
           WHEN r.perfil = 'PF-03' THEN '01' END,
      NULL, NULL, NULL, NULL, 'DRAFT',
      '[' || c_mark || '] ' || c_matrix_ver
        || ' | Perfil tributario: ' || r.perfil
        || ' | Confianca NCM: ' || r.confianca
        || ' | Rota regulatoria: ' || r.rota_mapa
        || ' | Fabricacao propria; origem 0 Nacional; uCom/uTrib = L; fator 1.'
        || ' | GTIN ausente (SEM GTIN ate cadastramento). CEST nulo, pendente validacao item a item.'
        || ' | CFOP 5101 (MG interno) e 6101 (interestadual): PRELIMINARES.'
        || ' | Regime Lucro Presumido: usar CST, nao CSOSN.'
        || ' | IPI 0% conforme matriz; enquadramento definitivo NAO declarado.'
        || ' | ICMS MG: CST 40 interno somente apos isencao validada; interestadual CST 20 com reducao 60% somente quando aplicavel'
        || ' - nada gravado no perfil e nenhuma regra publicada.'
        || CASE
             WHEN r.condicional THEN ' | PIS/COFINS: NAO propostos - definicao depende da alegacao/finalidade.'
             WHEN r.perfil IN ('PF-01','PF-02') THEN ' | PIS/COFINS: proposta CST 06; aliquota zero apenas apos validacao do enquadramento aplicavel.'
             ELSE ' | PIS/COFINS: proposta conservadora CST 01, PIS 0,65% e COFINS 3%.'
           END
        || ' | IBS/CBS (RTC 2026): proposta CST 200, cClassTrib 200038, reducao 60% - registrada apenas como PROPOSTA em rascunho, nunca produtiva.'
        || ' | Registro MAPA, cepa, rotulo, laudo e composicao NAO confirmados.'
        || ' | BLOQUEADO PARA FATURAMENTO REAL.',
      NULL, NULL, v_actor, v_actor
    WHERE NOT EXISTS (
      SELECT 1 FROM public.microorganism_fiscal_profiles q
      WHERE q.microorganism_id = r.micro_id AND q.is_active IS TRUE
    );
  END LOOP;

  -- 6. HIGIENIZACAO DO RESIDUO SINTETICO (somente o inequivoco).
  -- DECISAO DOCUMENTADA: o rollback NAO reativa BAC-27.
  UPDATE public.microrganismos
     SET ativo = false,
         b2b_enabled = false,
         observacoes = coalesce(observacoes || ' | ', '')
           || '[' || c_mark || '] Residuo de harness F4.2 desativado em ' || to_char(now(), 'YYYY-MM-DD')
           || '. Nao e dado real; mantido apenas por integridade referencial e auditoria.'
   WHERE codigo = 'BAC-27'
     AND nome LIKE 'F42-HARNESS-%'
     AND (ativo IS TRUE OR b2b_enabled IS TRUE);

  -- 7. BACKFILL DO LEDGER para a carga ja aplicada em staging pelo kit
  --    (proveniencia derivada de fiscal_audit_log, sem heuristica).
  INSERT INTO public.fiscal_matrix_load_ledger
    (batch_marker, table_name, record_id, column_name, previous_value, applied_value, applied_at, applied_by)
  SELECT c_mark, 'microorganism_regulatory_dossiers', a.record_id, 'regulatory_category',
         a.old_values->>'regulatory_category', a.new_values->>'regulatory_category',
         a.changed_at, v_actor
  FROM public.fiscal_audit_log a
  JOIN public.microorganism_regulatory_dossiers d ON d.id = a.record_id
  WHERE a.table_name = 'microorganism_regulatory_dossiers'
    AND a.action = 'UPDATE'
    AND (a.old_values->>'regulatory_category') IS NULL
    AND (a.new_values->>'regulatory_category') IS NOT NULL
    AND d.regulatory_category = (a.new_values->>'regulatory_category')
  ON CONFLICT (batch_marker, table_name, record_id, column_name) DO NOTHING;

  -- 8. ASSERCOES FINAIS FAIL-CLOSED.
  SELECT count(*) INTO v_existing FROM _matriz_v1;
  IF v_existing <> 27 THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_COUNT: matriz com % itens (esperado 27).', v_existing USING ERRCODE = '55006';
  END IF;

  SELECT count(*) INTO v_existing
  FROM _matriz_v1 m
  JOIN public.microrganismos x ON x.codigo = m.codigo
  LEFT JOIN public.microorganism_fiscal_profiles p
    ON p.microorganism_id = x.id AND p.is_active IS TRUE
  WHERE p.id IS NULL
     OR p.profile_status <> 'DRAFT'
     OR p.accounting_validated_at IS NOT NULL
     OR p.accounting_validated_by IS NOT NULL;
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_PROFILE_INVARIANT: % perfil(is) ausente(s), fora de DRAFT ou com validacao contabil.', v_existing
      USING ERRCODE = '55006';
  END IF;

  SELECT count(*) INTO v_existing
  FROM _matriz_v1 m
  JOIN public.microrganismos x ON x.codigo = m.codigo
  JOIN public.microorganism_regulatory_dossiers d
    ON d.microorganism_id = x.id AND d.deleted_at IS NULL
  WHERE d.status <> 'DRAFT'
     OR d.technical_review_status <> 'PENDING'
     OR d.regulatory_review_status <> 'PENDING'
     OR d.fiscal_review_status <> 'PENDING'
     OR d.published_ncm IS NOT NULL
     OR d.published_cest IS NOT NULL;
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_DOSSIER_INVARIANT: % dossie(s) fora de DRAFT/PENDING.', v_existing
      USING ERRCODE = '55006';
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.microorganism_ncm_candidates c
  WHERE c.justification LIKE '[' || c_mark || ']%' AND c.status <> 'PROPOSED';
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_CANDIDATE_INVARIANT: % candidato(s) fora de PROPOSED.', v_existing
      USING ERRCODE = '55006';
  END IF;

  -- Semantica CONDITIONAL preservada.
  SELECT count(*) INTO v_existing
  FROM _matriz_v1 m
  JOIN public.microrganismos x ON x.codigo = m.codigo
  JOIN public.microorganism_regulatory_dossiers d ON d.microorganism_id = x.id AND d.deleted_at IS NULL
  JOIN public.microorganism_ncm_candidates c ON c.dossier_id = d.id
  WHERE c.justification LIKE '[' || c_mark || ']%'
    AND m.confianca = 'CONDITIONAL'
    AND c.confidence <> 'CONDITIONAL';
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_CONFIDENCE_INVARIANT: % candidato(s) condicional(is) com confianca reduzida.', v_existing
      USING ERRCODE = '55006';
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.microorganism_regulatory_checklist c
  JOIN public.microorganism_regulatory_dossiers d ON d.id = c.dossier_id
  JOIN public.microrganismos x ON x.id = d.microorganism_id
  JOIN _matriz_v1 m ON m.codigo = x.codigo
  WHERE c.state <> 'PENDING';
  IF v_existing > 0 THEN
    RAISE EXCEPTION 'MATRIZ_ABORT_CHECKLIST_INVARIANT: % item(ns) de checklist decidido(s) indevidamente.', v_existing
      USING ERRCODE = '55006';
  END IF;

  RAISE NOTICE 'MATRIZ_FISCAL_MESTRE_V1: carga/reconciliacao aplicada em modo DRAFT/BLOQUEADO (27 itens).';
END
$matriz$;

-- ----------------------------------------------------------------------------
-- PARTE D - NORMALIZADOR DE DOMINIO PARA A RPC DE CADASTRO
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_regulatory_confidence_normalize(p_confidence text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN p_confidence IS NULL THEN 'LOW'
    WHEN upper(btrim(p_confidence)) IN ('LOW','MEDIUM','HIGH','CONDITIONAL')
      THEN upper(btrim(p_confidence))
    ELSE NULL
  END
$fn$;

REVOKE ALL ON FUNCTION public.fn_regulatory_confidence_normalize(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_regulatory_confidence_normalize(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_regulatory_confidence_normalize(text) TO service_role;

COMMENT ON FUNCTION public.fn_regulatory_confidence_normalize(text) IS
  'Normaliza a confianca de candidato de NCM. Retorna NULL quando fora do dominio (fail-closed).';

-- ----------------------------------------------------------------------------
-- PARTE E - RPC DE CADASTRO DE CANDIDATO CIENTE DE CONDITIONAL
-- Antes: coalesce(p_confidence,'LOW') aceitava qualquer texto e degradava semantica.
-- Agora: dominio validado (fail-closed) e CONDITIONAL suportado de ponta a ponta.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_regulatory_ncm_candidate_add(
  p_dossier_id uuid, p_ncm text, p_justification text, p_cest text DEFAULT NULL::text,
  p_confidence text DEFAULT 'LOW'::text, p_source_key text DEFAULT NULL::text,
  p_source_url text DEFAULT NULL::text, p_consulted_at date DEFAULT NULL::date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid; v_status text; v_source uuid; v_conf text;
BEGIN
  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'REGULATORY_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT status INTO v_status FROM public.microorganism_regulatory_dossiers
   WHERE id = p_dossier_id AND deleted_at IS NULL;
  IF v_status IS NULL THEN RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  IF v_status NOT IN ('DRAFT', 'PENDING_REVIEW') THEN
    RAISE EXCEPTION 'REGULATORY_DOSSIER_NOT_EDITABLE' USING ERRCODE = '55006';
  END IF;

  IF length(btrim(coalesce(p_justification, ''))) < 20 THEN
    RAISE EXCEPTION 'REGULATORY_JUSTIFICATION_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_consulted_at IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_NCM_CONSULTED_AT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_conf := public.fn_regulatory_confidence_normalize(p_confidence);
  IF v_conf IS NULL THEN
    RAISE EXCEPTION 'REGULATORY_NCM_CONFIDENCE_INVALID'
      USING ERRCODE = '22023',
            HINT = 'Confianca deve ser LOW, MEDIUM, HIGH ou CONDITIONAL.';
  END IF;

  SELECT id INTO v_source FROM public.fiscal_official_sources
   WHERE source_key = p_source_key AND is_active;

  IF v_source IS NULL AND NOT public.fn_fiscal_official_url_allowlisted(p_source_url) THEN
    RAISE EXCEPTION 'REGULATORY_NCM_SOURCE_REQUIRED'
      USING ERRCODE = '22023',
            HINT = 'Informe fonte oficial cadastrada e ativa (source_key) ou URL oficial allowlisted (.gov.br).';
  END IF;

  INSERT INTO public.microorganism_ncm_candidates
    (dossier_id, ncm, cest, justification, confidence, source_id, source_url, consulted_at, created_by)
  VALUES (p_dossier_id, p_ncm, p_cest, p_justification, v_conf,
          v_source, p_source_url, p_consulted_at, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

