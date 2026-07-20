
DO $$
DECLARE
  v_expected text[] := ARRAY[
    'bacillus amyloliquefaciens','bacillus aryabhattai','bacillus licheniformis',
    'bacillus megaterium','bacillus methylotrophicus','bacillus pumilus',
    'bacillus subtilis','bacillus thuringiensis aizawai','bacillus thuringiensis kurstaki',
    'bacillus velezensis','beauveria bassiana','chromobacterium subtsugae',
    'cordyceps javanica','e.m. (microorganismos eficientes)','e.m. microorganismos eficientes',
    'isaria fumosorosea','metarhizium anisopliae','methylobacterium symbioticum',
    'paecilomyces lilacinus','pochonia chlamydosporia','pseudomonas fluorescens',
    'purpureocillium lilacinum','saccharopolyspora spinosa','trichoderma asperellum',
    'trichoderma harzianum'
  ];
  v_aliases text[] := ARRAY[
    'metarhyzium anisopliae','purpurreocillium lilacinum'
  ];
  v_match_set text[] := v_expected || v_aliases;
  v_micro_ids uuid[];
  v_total_fichas int := 0;
  v_convertidas int := 0;
  v_aprovadas int := 0;
  v_arquivadas int := 0;
  v_sem_ficha int := 0;
  v_nao_encontrados int := 0;
  v_uid uuid := auth.uid();
  r record;
BEGIN
  SELECT array_agg(id) INTO v_micro_ids
  FROM public.microrganismos
  WHERE lower(btrim(coalesce(nome_cientifico,''))) = ANY(v_match_set)
     OR lower(btrim(coalesce(nome,''))) = ANY(v_match_set);

  IF v_micro_ids IS NULL THEN v_micro_ids := ARRAY[]::uuid[]; END IF;

  SELECT count(*) INTO v_total_fichas
  FROM public.microorganism_technical_profiles
  WHERE microrganismo_id = ANY(v_micro_ids);

  SELECT count(*) INTO v_aprovadas
  FROM public.microorganism_technical_profiles
  WHERE microrganismo_id = ANY(v_micro_ids) AND status_validacao = 'aprovado';

  SELECT count(*) INTO v_arquivadas
  FROM public.microorganism_technical_profiles
  WHERE microrganismo_id = ANY(v_micro_ids) AND status_validacao = 'arquivado';

  FOR r IN
    SELECT id, microrganismo_id
    FROM public.microorganism_technical_profiles
    WHERE microrganismo_id = ANY(v_micro_ids)
      AND status_validacao = 'rascunho'
      AND coalesce(btrim(resumo_curto),'') <> ''
      AND coalesce(btrim(mecanismo_acao),'') <> ''
      AND coalesce(btrim(beneficios_agronomicos),'') <> ''
      AND coalesce(btrim(explicacao_tecnica),'') <> ''
      AND coalesce(btrim(explicacao_produtor),'') <> ''
  LOOP
    UPDATE public.microorganism_technical_profiles
      SET status_validacao = 'em_revisao',
          updated_at = now()
      WHERE id = r.id;

    INSERT INTO public.catalog_technical_audit_logs
      (entidade_tipo, entidade_id, acao, usuario_id, dados_novos)
    VALUES
      ('ficha_microrganismo', r.id, 'normalizacao_status_revisao', v_uid,
       jsonb_build_object('status_anterior','rascunho','status_novo','em_revisao','motivo','Fase 14 normalizacao'));

    v_convertidas := v_convertidas + 1;
  END LOOP;

  SELECT count(*) INTO v_sem_ficha
  FROM public.microrganismos m
  WHERE m.id = ANY(v_micro_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.microorganism_technical_profiles p
      WHERE p.microrganismo_id = m.id
    );

  SELECT count(*) INTO v_nao_encontrados
  FROM unnest(v_expected) AS e(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.microrganismos m
    WHERE lower(btrim(coalesce(m.nome_cientifico,''))) = e.nome
       OR lower(btrim(coalesce(m.nome,''))) = e.nome
       OR (e.nome = 'metarhizium anisopliae' AND lower(btrim(coalesce(m.nome_cientifico,''))) = 'metarhyzium anisopliae')
       OR (e.nome = 'purpureocillium lilacinum' AND lower(btrim(coalesce(m.nome_cientifico,''))) = 'purpurreocillium lilacinum')
  );

  RAISE NOTICE 'FASE 14 RELATORIO: total_fichas=%, convertidas_para_em_revisao=%, preservadas_aprovado=%, preservadas_arquivado=%, microrganismos_sem_ficha=%, esperados_nao_encontrados=%',
    v_total_fichas, v_convertidas, v_aprovadas, v_arquivadas, v_sem_ficha, v_nao_encontrados;
END $$;
