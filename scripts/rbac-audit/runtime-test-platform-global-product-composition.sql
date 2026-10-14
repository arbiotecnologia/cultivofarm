-- RUNTIME TEST (rollback total) — executar SOMENTE após aplicar proposed-platform-global-product-composition.sql,
-- pela revisão independente, no canônico swzpzcwiasxmjutrmvkm. Nada persiste: ROLLBACK ao final.
-- Harness: RPCs sob teste SEMPRE como `authenticated` com claims do ator real parametrizado; o owner
-- (RESET ROLE) é usado apenas como oráculo (snapshots, invariantes, CHECKs diretos). Produtos de teste são
-- criados pelo writer auditado DENTRO da transação; nenhum produto real recebe declaração persistente.
-- Resultado NULL conta como FAIL. SKIP é coluna separada e nunca conta como PASS.
--
-- psql -v sa_uid=... -v admin_ar_uid=... -v admin_fsf_uid=... -v financeiro_ar_uid=... -v consultor_ar_uid=... -f este_arquivo.sql
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE rt_ctx (k text PRIMARY KEY, v text) ON COMMIT DROP;
CREATE TEMP TABLE rt_results (n serial, step text, ok boolean, detail text, skipped boolean NOT NULL DEFAULT false) ON COMMIT DROP;
GRANT ALL ON rt_ctx, rt_results TO authenticated, anon;
GRANT USAGE ON SEQUENCE rt_results_n_seq TO authenticated, anon;
INSERT INTO rt_ctx VALUES ('sa',:'sa_uid'),('admin_ar',:'admin_ar_uid'),('admin_fsf',:'admin_fsf_uid'),
  ('financeiro_ar',:'financeiro_ar_uid'),('consultor_ar',:'consultor_ar_uid');
CREATE FUNCTION pg_temp.claims(p_uid uuid, p_iat_offset int DEFAULT -30, p_exp_offset int DEFAULT 600) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub',p_uid,'role','authenticated',
    'iat',extract(epoch from now())::bigint+p_iat_offset,'exp',extract(epoch from now())::bigint+p_exp_offset)::text, true);
$$;
CREATE FUNCTION pg_temp.ok(p_step text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO rt_results(step,ok,detail) VALUES (p_step,COALESCE(p_ok,false),p_detail);
$$;
-- SKIP: ok=false + skipped=true; nunca soma em PASS (nem em FAIL). Sempre exige motivo.
CREATE FUNCTION pg_temp.skip(p_step text, p_detail text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO rt_results(step,ok,detail,skipped) VALUES (p_step,false,'SKIP: '||p_detail,true);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.claims(uuid,int,int), pg_temp.ok(text,boolean,text), pg_temp.skip(text,text) TO authenticated, anon;

-- ============================================================ 0) oráculo owner: atores e snapshots
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT rt_ctx.k AS rk, rt_ctx.v::uuid AS u FROM rt_ctx LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=r.u) THEN RAISE EXCEPTION 'ator inexistente: %', r.rk; END IF;
    IF r.rk='sa' AND NOT (public.has_role(r.u,'superadmin') AND public.is_platform_superadmin(r.u) AND platform_private.platform_actor_access_ready(r.u)) THEN
      RAISE EXCEPTION 'sa não é superadmin ativo'; END IF;
    IF r.rk<>'sa' AND (public.has_role(r.u,'superadmin') OR public.is_platform_superadmin(r.u)) THEN RAISE EXCEPTION 'ator tenant é superadmin: %', r.rk; END IF;
  END LOOP;
  INSERT INTO rt_ctx SELECT 'formulacoes_antes', md5(coalesce(string_agg(to_jsonb(f)::text, ',' ORDER BY id),'')) FROM public.formulacoes f;
  INSERT INTO rt_ctx SELECT 'volumes_antes', md5(coalesce(string_agg(to_jsonb(v)::text, ',' ORDER BY id),'')) FROM public.catalogo_volumes v;
  INSERT INTO rt_ctx SELECT 'produtos_antes', md5(string_agg(to_jsonb(p)::text, ',' ORDER BY id)) FROM public.produtos p;
  INSERT INTO rt_ctx SELECT 'micros_antes', md5(string_agg(to_jsonb(m)::text, ',' ORDER BY id)) FROM public.microrganismos m;
  INSERT INTO rt_ctx SELECT 'micro_ativo', m.id::text FROM public.microrganismos m WHERE m.ativo ORDER BY m.id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'micro_ativo2', m.id::text FROM public.microrganismos m WHERE m.ativo ORDER BY m.id OFFSET 1 LIMIT 1;
  INSERT INTO rt_ctx SELECT 'micro_inativo', m.id::text FROM public.microrganismos m WHERE NOT m.ativo ORDER BY m.id LIMIT 1;
  -- Par (produto biológico, micro) com concentração na receita, se existir (teste de medida duplicada).
  INSERT INTO rt_ctx SELECT 'dup_produto', f.produto_id::text FROM public.formulacoes f JOIN public.produtos p ON p.id=f.produto_id
    WHERE f.concentracao IS NOT NULL AND p.familia_catalogo='biologico' ORDER BY f.id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'dup_micro', f.microrganismo_id::text FROM public.formulacoes f
    WHERE f.produto_id::text = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='dup_produto') AND f.concentracao IS NOT NULL ORDER BY f.id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'dup_versao', p.updated_at::text FROM public.produtos p WHERE p.id::text = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='dup_produto');
  INSERT INTO rt_ctx SELECT 'bomb_versao', p.updated_at::text FROM public.produtos p WHERE p.id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
  IF NOT EXISTS (SELECT 1 FROM rt_ctx WHERE rt_ctx.k='micro_ativo') THEN RAISE EXCEPTION 'sem micro ativo para teste'; END IF;
END $$;

-- Estrutura
INSERT INTO rt_results(step,ok) SELECT 'estrutura.rls', (SELECT bool_and(relrowsecurity) FROM pg_class
  WHERE oid IN ('public.produto_composicao_conjuntos'::regclass,'public.produto_composicao_declaracoes'::regclass));
INSERT INTO rt_results(step,ok) SELECT 'estrutura.sem_grant_cliente', NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name IN ('produto_composicao_conjuntos','produto_composicao_declaracoes') AND grantee IN ('anon','authenticated','PUBLIC'));
INSERT INTO rt_results(step,ok) SELECT 'estrutura.sem_policies_tabelas', NOT EXISTS (SELECT 1 FROM pg_policies
  WHERE tablename IN ('produto_composicao_conjuntos','produto_composicao_declaracoes'));
INSERT INTO rt_results(step,ok) SELECT 'estrutura.vazia_sem_backfill', (SELECT count(*) FROM public.produto_composicao_declaracoes)=0
  AND (SELECT count(*) FROM public.produto_composicao_conjuntos)=0;
INSERT INTO rt_results(step,ok) SELECT 'estrutura.triggers_produtos_6', (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.produtos'::regclass AND NOT tgisinternal)=6;
INSERT INTO rt_results(step,ok) SELECT 'estrutura.formulacoes_10_colunas', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='formulacoes')=10;
INSERT INTO rt_results(step,ok) SELECT 'estrutura.anon_sem_execute', NOT has_function_privilege('anon','public.platform_set_global_product_composition(uuid,timestamptz,text,jsonb,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.platform_read_global_product_composition(uuid,integer,integer)','EXECUTE');

-- ============================================================ 1) SA: fluxo funcional (RPCs como authenticated)
SELECT pg_temp.claims((SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='sa'));
SET LOCAL ROLE authenticated;
DO $$
DECLARE r jsonb; r2 jsonb; v_key uuid; q uuid; b uuid; v_q timestamptz; v_b timestamptz; c jsonb; v_before jsonb; v_after jsonb;
  v_micro uuid := (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='micro_ativo');
  v_inativo uuid := (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='micro_inativo');
  ing jsonb := '[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"RT ativo rollback","quantidade":250,"unidade":"g/L","base":"por_volume_produto","natureza":"concentracao_declarada"}]';
  t record;
BEGIN
  -- Bombarbio: leitor unificado mostra receita 334/333/333 e nenhuma declaração (sem criar linha).
  c := public.platform_read_global_product_composition('1875527c-a65a-483b-a6c2-9122d5ec2a51',50,0);
  PERFORM pg_temp.ok('bombarbio.receita_334_333_333', (SELECT array_agg((e->>'volume_ml')::numeric ORDER BY (e->>'volume_ml')::numeric DESC)
    FROM jsonb_array_elements(c->'receita') e) = ARRAY[334,333,333]::numeric[]);
  PERFORM pg_temp.ok('bombarbio.sem_declaracao', jsonb_array_length(c->'declaracoes')=0 AND c->'conjunto' = 'null'::jsonb
    AND c->'produto'->>'familia_catalogo'='biologico');

  -- Produtos de teste transacionais (writer auditado existente) + família explícita.
  r := public.platform_create_global_product('{"nome":"RT composicao quimico rollback","tipo":"fungicida"}','Teste runtime composicao rollback',gen_random_uuid());
  q := (r->>'id')::uuid; INSERT INTO rt_ctx VALUES ('prod_q', q::text);
  r := public.platform_create_global_product('{"nome":"RT composicao biologico rollback","tipo":"fungicida"}','Teste runtime composicao rollback',gen_random_uuid());
  b := (r->>'id')::uuid; INSERT INTO rt_ctx VALUES ('prod_b', b::text);
  c := public.platform_read_global_product_composition(q,50,0); v_q := (c->'produto'->>'updated_at')::timestamptz;
  -- Família NULL: escrita negada.
  BEGIN PERFORM public.platform_set_global_product_composition(q,v_q,'rascunho',ing,'Teste runtime composicao rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.sem_familia_negado',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.sem_familia_negado',SQLERRM='catalog_composition_requires_family'); END;
  r := public.platform_set_global_product_family(q,v_q,'quimico','fungicida','Teste runtime composicao rollback',gen_random_uuid()); v_q := (r->>'updated_at')::timestamptz;
  c := public.platform_read_global_product_composition(b,50,0);
  r := public.platform_set_global_product_family(b,(c->'produto'->>'updated_at')::timestamptz,'biologico','biofungicida','Teste runtime composicao rollback',gen_random_uuid());
  v_b := (r->>'updated_at')::timestamptz;

  -- Químico: ingrediente ativo; invariante demais colunas pelo owner.
  RESET ROLE; SELECT to_jsonb(p) INTO v_before FROM public.produtos p WHERE p.id=q; SET LOCAL ROLE authenticated;
  v_key := gen_random_uuid();
  r := public.platform_set_global_product_composition(q,v_q,'completo',ing,'Teste runtime composicao rollback',v_key);
  PERFORM pg_temp.ok('sa.quimico.salvar', (r->>'itens')::int=1 AND r->>'status'='completo' AND (r->>'updated_at')::timestamptz > v_q AND NOT (r->>'idempotent')::boolean);
  RESET ROLE; SELECT to_jsonb(p) INTO v_after FROM public.produtos p WHERE p.id=q; SET LOCAL ROLE authenticated;
  PERFORM pg_temp.ok('sa.quimico.so_versao_muda', (v_before - 'updated_at') = (v_after - 'updated_at')
    AND (v_after->>'updated_at')::timestamptz > (v_before->>'updated_at')::timestamptz);
  c := public.platform_read_global_product_composition(q,50,0);
  PERFORM pg_temp.ok('sa.quimico.leitura', c->'declaracoes'->0->>'componente_nome'='RT ativo rollback' AND c->'conjunto'->>'status'='completo'
    AND (c->'declaracoes'->0->>'quantidade')::numeric=250 AND jsonb_array_length(c->'receita')=0);
  -- Replay idêntico / divergente / CAS stale / sem mudança.
  r2 := public.platform_set_global_product_composition(q,v_q,'completo',ing,'Teste runtime composicao rollback',v_key);
  PERFORM pg_temp.ok('sa.replay', (r2->>'idempotent')::boolean AND r2->>'audit_id'=r->>'audit_id');
  BEGIN PERFORM public.platform_set_global_product_composition(q,v_q,'rascunho',ing,'Teste runtime composicao rollback',v_key);
    PERFORM pg_temp.ok('sa.replay_divergente',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.replay_divergente',true); END;
  BEGIN PERFORM public.platform_set_global_product_composition(q,v_q,'rascunho',ing,'Teste runtime composicao rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.cas_stale',false); EXCEPTION WHEN serialization_failure THEN PERFORM pg_temp.ok('sa.cas_stale',SQLERRM='catalog_composition_conflict'); END;
  v_q := (r->>'updated_at')::timestamptz;
  BEGIN PERFORM public.platform_set_global_product_composition(q,v_q,'completo',ing,'Teste runtime composicao rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.sem_mudanca',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.sem_mudanca',SQLERRM='catalog_composition_no_change'); END;
  BEGIN PERFORM public.platform_set_global_product_composition(q,'infinity',  'rascunho',ing,'Teste runtime composicao rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.versao_infinita',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.versao_infinita',true); END;

  -- Matriz inválida via writer (servidor): família, unidade/base, limites, formato, completo sem medida.
  FOR t IN SELECT * FROM (VALUES
    ('micro_em_quimico', jsonb_build_array(jsonb_build_object('ordem',1,'tipo_componente','microrganismo','microrganismo_id',v_micro,'componente_nome',null,'quantidade',1e9,'unidade','UFC/mL','base','por_volume_produto','natureza','teor_garantido')),'rascunho'),
    ('nutriente_em_quimico','[{"ordem":1,"tipo_componente":"nutriente","microrganismo_id":null,"componente_nome":"N total","quantidade":10,"unidade":"%m/m","base":"por_massa_produto","natureza":"teor_garantido"}]'::jsonb,'rascunho'),
    ('base_incompativel','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":10,"unidade":"g/L","base":"por_massa_produto","natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('percentual_101','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":101,"unidade":"%m/v","base":"por_volume_produto","natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('ufc_nao_micro','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":10,"unidade":"UFC/mL","base":"por_volume_produto","natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('unidade_kg_L','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":10,"unidade":"kg/L","base":"por_volume_produto","natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('quantidade_zero','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":0,"unidade":"g/L","base":"por_volume_produto","natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('casas_7','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":1.1234567,"unidade":"g/L","base":"por_volume_produto","natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('medida_parcial','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":10,"unidade":null,"base":null,"natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('completo_sem_medida','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":null,"unidade":null,"base":null,"natureza":"concentracao_declarada"}]'::jsonb,'completo'),
    ('completo_vazio','[]'::jsonb,'completo'),
    ('chave_extra','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":10,"unidade":"g/L","base":"por_volume_produto","natureza":"concentracao_declarada","dose":1}]'::jsonb,'rascunho'),
    ('quantidade_texto','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":"10","unidade":"g/L","base":"por_volume_produto","natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('ordem_salto','[{"ordem":2,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":10,"unidade":"g/L","base":"por_volume_produto","natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('nome_duplicado','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":null,"unidade":null,"base":null,"natureza":"concentracao_declarada"},{"ordem":2,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"x ativo","quantidade":null,"unidade":null,"base":null,"natureza":"concentracao_declarada"}]'::jsonb,'rascunho'),
    ('nome_duplicado_entre_tipos','[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"X ativo","quantidade":null,"unidade":null,"base":null,"natureza":"concentracao_declarada"},{"ordem":2,"tipo_componente":"outro","microrganismo_id":null,"componente_nome":"x ATIVO","quantidade":null,"unidade":null,"base":null,"natureza":"concentracao_declarada"}]'::jsonb,'rascunho')
  ) x(nome,itens,st) LOOP
    BEGIN PERFORM public.platform_set_global_product_composition(q,v_q,t.st,t.itens,'Teste runtime composicao rollback',gen_random_uuid());
      PERFORM pg_temp.ok('sa.invalido.'||t.nome,false);
    EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.ok('sa.invalido.'||t.nome, SQLSTATE IN ('22023','23514','23505','22P02'), SQLSTATE); END;
  END LOOP;
  -- Rascunho permitido com medida vazia.
  r := public.platform_set_global_product_composition(q,v_q,'rascunho',
    '[{"ordem":1,"tipo_componente":"ingrediente_ativo","microrganismo_id":null,"componente_nome":"RT ativo rollback","quantidade":null,"unidade":null,"base":null,"natureza":"concentracao_declarada"}]',
    'Teste runtime composicao rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.rascunho_incompleto', r->>'status'='rascunho'); v_q := (r->>'updated_at')::timestamptz;
  -- Guard de família: químico com ingrediente não pode virar biológico.
  BEGIN PERFORM public.platform_set_global_product_family(q,v_q,'biologico',NULL,'Teste runtime composicao rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.guard_reclassificacao',false); EXCEPTION WHEN check_violation THEN PERFORM pg_temp.ok('sa.guard_reclassificacao',SQLERRM='catalog_composition_family_conflict'); END;
  -- 'outro' é compatível com qualquer família: após trocar para 'outro', reclassificar é permitido.
  r := public.platform_set_global_product_composition(q,v_q,'rascunho',
    '[{"ordem":1,"tipo_componente":"outro","microrganismo_id":null,"componente_nome":"RT veiculo rollback","quantidade":null,"unidade":null,"base":null,"natureza":"concentracao_declarada"}]',
    'Teste runtime composicao rollback',gen_random_uuid());
  r := public.platform_set_global_product_family(q,(r->>'updated_at')::timestamptz,'fertilizante_adubo',NULL,'Teste runtime composicao rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.reclassificacao_compativel', r->>'familia_catalogo'='fertilizante_adubo');
  r := public.platform_set_global_product_composition(q,(r->>'updated_at')::timestamptz,'completo',
    '[{"ordem":1,"tipo_componente":"nutriente","microrganismo_id":null,"componente_nome":"N total","quantidade":10,"unidade":"%m/m","base":"por_massa_produto","natureza":"teor_garantido"}]',
    'Teste runtime composicao rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.fertilizante_nutriente', r->>'status'='completo');

  -- Biológico: teor UFC do micro ativo por ID (sem cópia); mL/L proibido; micro inativo em nova associação negado.
  r := public.platform_set_global_product_composition(b,v_b,'completo',jsonb_build_array(jsonb_build_object('ordem',1,'tipo_componente','microrganismo',
    'microrganismo_id',v_micro,'componente_nome',null,'quantidade',1e9,'unidade','UFC/mL','base','por_volume_produto','natureza','teor_garantido')),
    'Teste runtime composicao rollback',gen_random_uuid());
  PERFORM pg_temp.ok('sa.biologico.teor_micro', r->>'status'='completo'); v_b := (r->>'updated_at')::timestamptz;
  -- Concentração declarada (sem garantia) de micro é válida e não vira teor garantido.
  r := public.platform_set_global_product_composition(b,v_b,'completo',jsonb_build_array(jsonb_build_object('ordem',1,'tipo_componente','microrganismo',
    'microrganismo_id',v_micro,'componente_nome',null,'quantidade',1e9,'unidade','UFC/mL','base','por_volume_produto','natureza','concentracao_declarada')),
    'Teste runtime composicao rollback',gen_random_uuid());
  v_b := (r->>'updated_at')::timestamptz; c := public.platform_read_global_product_composition(b,50,0);
  PERFORM pg_temp.ok('sa.biologico.concentracao_declarada_valida', r->>'status'='completo' AND c->'declaracoes'->0->>'natureza'='concentracao_declarada');
  c := public.platform_read_global_product_composition(b,50,0);
  PERFORM pg_temp.ok('sa.biologico.leitura_micro_ref', c->'declaracoes'->0->>'microrganismo_id'=v_micro::text AND c->'declaracoes'->0->>'micro_nome' IS NOT NULL
    AND c->'declaracoes'->0->>'componente_nome' IS NULL);
  BEGIN PERFORM public.platform_set_global_product_composition(b,v_b,'rascunho',jsonb_build_array(jsonb_build_object('ordem',1,'tipo_componente','microrganismo',
      'microrganismo_id',v_micro,'componente_nome',null,'quantidade',334,'unidade','mL/L','base','por_volume_produto','natureza','teor_garantido')),'Teste runtime composicao rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.biologico.volume_proibido',false); EXCEPTION WHEN check_violation THEN PERFORM pg_temp.ok('sa.biologico.volume_proibido',true); END;
  IF v_inativo IS NOT NULL THEN
    BEGIN PERFORM public.platform_set_global_product_composition(b,v_b,'rascunho',jsonb_build_array(jsonb_build_object('ordem',1,'tipo_componente','microrganismo',
        'microrganismo_id',v_inativo,'componente_nome',null,'quantidade',null,'unidade',null,'base',null,'natureza','teor_garantido')),'Teste runtime composicao rollback',gen_random_uuid());
      PERFORM pg_temp.ok('sa.biologico.micro_inativo_novo',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.biologico.micro_inativo_novo',SQLERRM='catalog_composition_micro_unavailable'); END;
  ELSE PERFORM pg_temp.skip('sa.biologico.micro_inativo_novo','sem micro inativo real');
  END IF;
  BEGIN PERFORM public.platform_set_global_product_composition(b,v_b,'rascunho',jsonb_build_array(jsonb_build_object('ordem',1,'tipo_componente','microrganismo',
      'microrganismo_id',gen_random_uuid(),'componente_nome',null,'quantidade',null,'unidade',null,'base',null,'natureza','teor_garantido')),'Teste runtime composicao rollback',gen_random_uuid());
    PERFORM pg_temp.ok('sa.biologico.micro_inexistente',false); EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.biologico.micro_inexistente',true); END;
  -- Medida duplicada com receita (só se houver par real biológico com concentração; tudo em rollback).
  IF EXISTS (SELECT 1 FROM rt_ctx WHERE rt_ctx.k='dup_micro') THEN
    BEGIN PERFORM public.platform_set_global_product_composition((SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='dup_produto'),
        (SELECT rt_ctx.v::timestamptz FROM rt_ctx WHERE rt_ctx.k='dup_versao'),'rascunho',jsonb_build_array(jsonb_build_object('ordem',1,'tipo_componente','microrganismo',
        'microrganismo_id',(SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='dup_micro'),'componente_nome',null,'quantidade',1e9,'unidade','UFC/mL','base','por_volume_produto','natureza','teor_garantido')),
        'Teste runtime composicao rollback',gen_random_uuid());
      PERFORM pg_temp.ok('sa.medida_duplicada_receita',false); EXCEPTION WHEN check_violation THEN PERFORM pg_temp.ok('sa.medida_duplicada_receita',SQLERRM='catalog_composition_duplicate_measure'); END;
  ELSE PERFORM pg_temp.skip('sa.medida_duplicada_receita','sem par biológico com concentração na receita');
  END IF;
  -- Leitor: parâmetros inválidos e produto inexistente.
  BEGIN PERFORM public.platform_read_global_product_composition(q,51,0); PERFORM pg_temp.ok('sa.read.limite',false);
    EXCEPTION WHEN invalid_parameter_value THEN PERFORM pg_temp.ok('sa.read.limite',true); END;
  BEGIN PERFORM public.platform_read_global_product_composition(gen_random_uuid(),50,0); PERFORM pg_temp.ok('sa.read.inexistente',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('sa.read.inexistente',true); END;
  -- Ledger lido como SA.
  PERFORM pg_temp.ok('sa.ledger', (SELECT count(*) FROM public.catalog_platform_admin_audit WHERE operation='set_global_product_composition'
    AND counts_after->'receipt'->>'produto_id' IN (q::text,b::text)) >= 5);
END $$;
RESET ROLE;

-- ============================================================ 1b) JWT inválidos (SA real com claims adulteradas) e CAS/replay entre atores
DO $$
DECLARE sa uuid := (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='sa'); q uuid := (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='prod_q'); t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('expirado', json_build_object('sub',sa,'role','authenticated','iat',extract(epoch from now())::bigint-7200,'exp',extract(epoch from now())::bigint-60)::text),
    ('iat_futuro', json_build_object('sub',sa,'role','authenticated','iat',extract(epoch from now())::bigint+3600,'exp',extract(epoch from now())::bigint+7200)::text),
    ('sem_iat', json_build_object('sub',sa,'role','authenticated','exp',extract(epoch from now())::bigint+600)::text),
    ('iat_texto', json_build_object('sub',sa,'role','authenticated','iat','123','exp',extract(epoch from now())::bigint+600)::text),
    ('sem_sub', json_build_object('role','authenticated','iat',extract(epoch from now())::bigint-30,'exp',extract(epoch from now())::bigint+600)::text),
    ('sub_inexistente', json_build_object('sub',gen_random_uuid(),'role','authenticated','iat',extract(epoch from now())::bigint-30,'exp',extract(epoch from now())::bigint+600)::text),
    ('vazio', '')
  ) x(nome,cl) LOOP
    PERFORM set_config('request.jwt.claims', t.cl, true); SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.platform_read_global_product_composition(q,50,0); PERFORM pg_temp.ok('jwt.'||t.nome||'.reader',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('jwt.'||t.nome||'.reader',true); END;
    BEGIN PERFORM public.platform_set_global_product_composition(q,now(),'rascunho','[]','Tentativa JWT invalido negada',gen_random_uuid()); PERFORM pg_temp.ok('jwt.'||t.nome||'.writer',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('jwt.'||t.nome||'.writer',true); END;
    RESET ROLE;
  END LOOP;
END $$;

-- ============================================================ 2) CHECKs diretos (owner, oráculo) em fixture BIOLÓGICO.
-- Tipos usados ('microrganismo','outro') são aceitos pelo guard de família; o nome da constraint violada é
-- obtido por GET STACKED DIAGNOSTICS para que um erro de família/unique não seja contado como CHECK correto.
DO $$
DECLARE b uuid := (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='prod_b'); m2 uuid := (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='micro_ativo2');
  t record; v_con text; v_msg text;
BEGIN
  IF (SELECT familia_catalogo FROM public.produtos WHERE id=b) IS DISTINCT FROM 'biologico' THEN RAISE EXCEPTION 'fixture biologico ausente'; END IF;
  IF m2 IS NULL THEN PERFORM pg_temp.skip('check.*','sem segundo micro ativo; checks de identidade de micro não executados'); RETURN; END IF;
  FOR t IN SELECT * FROM (VALUES
    ('micro_sem_id','microrganismo',NULL::uuid,NULL::text,NULL::numeric,NULL::text,NULL::text,'teor_garantido','pcd_identidade_check'),
    ('outro_sem_nome','outro',NULL,NULL,NULL,NULL,NULL,'teor_garantido','pcd_identidade_check'),
    ('micro_com_nome','microrganismo',m2,'Xy',NULL,NULL,NULL,'teor_garantido','pcd_identidade_check'),
    ('outro_com_micro_id','outro',m2,'Nome ok',NULL,NULL,NULL,'teor_garantido','pcd_identidade_check'),
    ('nome_com_espacos','outro',NULL,' Nome ok',NULL,NULL,NULL,'teor_garantido','pcd_identidade_check'),
    ('quantidade_sem_unidade','outro',NULL,'Nome ok',10,NULL,'por_massa_produto','teor_garantido','pcd_medida_conjunta_check'),
    ('base_null_unidade','outro',NULL,'Nome ok',10,'%m/m',NULL,'teor_garantido','pcd_medida_conjunta_check'),
    ('nan','outro',NULL,'Nome ok','NaN','%m/m','por_massa_produto','teor_garantido','pcd_medida_check'),
    ('negativo','outro',NULL,'Nome ok',-1,'%m/m','por_massa_produto','teor_garantido','pcd_medida_check'),
    ('ufc_em_outro','outro',NULL,'Nome ok',10,'UFC/mL','por_volume_produto','teor_garantido','pcd_medida_check'),
    ('micro_ml_l','microrganismo',m2,NULL,334,'mL/L','por_volume_produto','concentracao_declarada','pcd_medida_check')
  ) x(nome,tipo,mid,cn,qt,un,bs,nat,esperado) LOOP
    v_con := NULL;
    BEGIN
      INSERT INTO public.produto_composicao_declaracoes(produto_id,ordem,tipo_componente,microrganismo_id,componente_nome,quantidade,unidade,base,natureza)
      VALUES (b,50,t.tipo,t.mid,t.cn,t.qt,t.un,t.bs,t.nat);
      PERFORM pg_temp.ok('check.'||t.nome,false,'inserido');
    EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME, v_msg = MESSAGE_TEXT;
      PERFORM pg_temp.ok('check.'||t.nome, v_con = t.esperado, CASE WHEN v_con = t.esperado THEN NULL ELSE coalesce(v_con,'<sem constraint> '||v_msg) END); END;
  END LOOP;
  -- Concentração declarada (sem garantia) em micro é VÁLIDA.
  BEGIN
    INSERT INTO public.produto_composicao_declaracoes(produto_id,ordem,tipo_componente,microrganismo_id,quantidade,unidade,base,natureza)
    VALUES (b,48,'microrganismo',m2,1e9,'UFC/mL','por_volume_produto','concentracao_declarada');
    PERFORM pg_temp.ok('check.micro_concentracao_declarada_valida',true);
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.ok('check.micro_concentracao_declarada_valida',false,SQLSTATE); END;
  -- Nome normalizado único entre tipos (owner): 'RT Dup' outro x 'rt dup' outro.
  INSERT INTO public.produto_composicao_declaracoes(produto_id,ordem,tipo_componente,componente_nome,natureza) VALUES (b,47,'outro','RT Dup','concentracao_declarada');
  BEGIN INSERT INTO public.produto_composicao_declaracoes(produto_id,ordem,tipo_componente,componente_nome,natureza) VALUES (b,46,'outro','rt DUP','concentracao_declarada');
    PERFORM pg_temp.ok('unique.nome_normalizado',false);
  EXCEPTION WHEN unique_violation THEN GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME; PERFORM pg_temp.ok('unique.nome_normalizado', v_con='pcd_nome_unique', v_con); END;
  -- Guard de linha: nutriente em biológico (owner também é bloqueado) — mensagem, não constraint.
  BEGIN INSERT INTO public.produto_composicao_declaracoes(produto_id,ordem,tipo_componente,componente_nome,natureza) VALUES (b,45,'nutriente','N total','teor_garantido');
    PERFORM pg_temp.ok('guard.linha_owner',false);
  EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; PERFORM pg_temp.ok('guard.linha_owner',v_msg='catalog_composition_family_conflict',v_msg); END;
END $$;

-- Ledger imutável.
DO $$ BEGIN
  BEGIN UPDATE public.catalog_platform_admin_audit SET reason='x' WHERE operation='set_global_product_composition';
    PERFORM pg_temp.ok('ledger.imutavel_update',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('ledger.imutavel_update',true); END;
  BEGIN DELETE FROM public.catalog_platform_admin_audit WHERE operation='set_global_product_composition';
    PERFORM pg_temp.ok('ledger.imutavel_delete',false); EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('ledger.imutavel_delete',true); END;
END $$;

-- ============================================================ 3) atores não SA e anon: negados (wrappers, cores privados, tabelas)
DO $$
DECLARE r record; q uuid := (SELECT rt_ctx.v::uuid FROM rt_ctx WHERE rt_ctx.k='prod_q'); rl text;
BEGIN
  FOR r IN SELECT rt_ctx.k AS rk, rt_ctx.v::uuid AS u FROM rt_ctx WHERE rt_ctx.k IN ('admin_ar','admin_fsf','financeiro_ar','consultor_ar') LOOP
    PERFORM pg_temp.claims(r.u); SET LOCAL ROLE authenticated;
    BEGIN PERFORM public.platform_read_global_product_composition(q,50,0); PERFORM pg_temp.ok(r.rk||'.reader',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.rk||'.reader',true); END;
    BEGIN PERFORM public.platform_set_global_product_composition(q,now(),'rascunho','[]','Tentativa tenant negada',gen_random_uuid()); PERFORM pg_temp.ok(r.rk||'.writer',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.rk||'.writer',true); END;
    BEGIN PERFORM platform_private.read_global_product_composition_core(q,50,0); PERFORM pg_temp.ok(r.rk||'.core_reader',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.rk||'.core_reader',true); END;
    BEGIN PERFORM platform_private.set_global_product_composition_core(q,now(),'rascunho','[]','Tentativa tenant negada',gen_random_uuid()); PERFORM pg_temp.ok(r.rk||'.core_writer',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.rk||'.core_writer',true); END;
    BEGIN PERFORM 1 FROM public.produto_composicao_declaracoes LIMIT 1; PERFORM pg_temp.ok(r.rk||'.select_direto',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.rk||'.select_direto',true); END;
    BEGIN INSERT INTO public.produto_composicao_conjuntos(produto_id,status,updated_by) VALUES (q,'rascunho',r.u); PERFORM pg_temp.ok(r.rk||'.dml_direto',false);
      EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok(r.rk||'.dml_direto',true); END;
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  SET LOCAL ROLE anon;
  BEGIN PERFORM public.platform_read_global_product_composition(q,50,0); PERFORM pg_temp.ok('anon.reader',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.reader',true); END;
  BEGIN PERFORM public.platform_set_global_product_composition(q,now(),'rascunho','[]','Tentativa anon negada',gen_random_uuid()); PERFORM pg_temp.ok('anon.writer',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.writer',true); END;
  BEGIN PERFORM platform_private.read_global_product_composition_core(q,50,0); PERFORM pg_temp.ok('anon.core_reader',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.core_reader',true); END;
  BEGIN PERFORM platform_private.set_global_product_composition_core(q,now(),'rascunho','[]','Tentativa anon negada',gen_random_uuid()); PERFORM pg_temp.ok('anon.core_writer',false);
    EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.ok('anon.core_writer',true); END;
  RESET ROLE;
END $$;

-- ============================================================ 4) invariantes finais (owner)
INSERT INTO rt_results(step,ok) SELECT 'final.formulacoes_intactas',
  md5(coalesce(string_agg(to_jsonb(f)::text, ',' ORDER BY id),'')) = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='formulacoes_antes') FROM public.formulacoes f;
INSERT INTO rt_results(step,ok) SELECT 'final.volumes_intactos',
  md5(coalesce(string_agg(to_jsonb(v)::text, ',' ORDER BY id),'')) = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='volumes_antes') FROM public.catalogo_volumes v;
INSERT INTO rt_results(step,ok) SELECT 'final.micros_intactos',
  md5(string_agg(to_jsonb(m)::text, ',' ORDER BY id)) = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='micros_antes') FROM public.microrganismos m;
INSERT INTO rt_results(step,ok) SELECT 'final.produtos_reais_intactos',
  md5(string_agg(to_jsonb(p)::text, ',' ORDER BY id)) = (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='produtos_antes')
  FROM public.produtos p WHERE p.id::text NOT IN (SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k IN ('prod_q','prod_b'));
INSERT INTO rt_results(step,ok) SELECT 'final.bombarbio', (SELECT ativo AND b2b_enabled AND valor_litro_brl=180 AND familia_catalogo='biologico'
  AND classe_catalogo='biofungicida' AND updated_at::text=(SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k='bomb_versao')
  FROM public.produtos WHERE id='1875527c-a65a-483b-a6c2-9122d5ec2a51')
  AND (SELECT array_agg(volume_ml ORDER BY volume_ml DESC) FROM public.formulacoes WHERE produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51') = ARRAY[334,333,333]::numeric[]
  AND NOT EXISTS (SELECT 1 FROM public.produto_composicao_declaracoes WHERE produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51');

-- SKIP nunca conta como PASS: aparece em coluna própria e não reduz FAIL.
SELECT step, CASE WHEN skipped THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado, detail FROM rt_results
  WHERE skipped OR NOT ok OR detail IS NOT NULL ORDER BY n;
SELECT count(*) FILTER (WHERE ok AND NOT skipped) AS pass, count(*) FILTER (WHERE NOT ok AND NOT skipped) AS fail,
  count(*) FILTER (WHERE skipped) AS skip, count(*) AS total FROM rt_results;
ROLLBACK;
