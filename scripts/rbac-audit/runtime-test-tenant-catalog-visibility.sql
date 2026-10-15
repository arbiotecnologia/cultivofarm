-- RUNTIME TEST (rollback total) — executar SOMENTE após aplicar proposed-tenant-catalog-visibility.sql,
-- pela revisão independente, no canônico swzpzcwiasxmjutrmvkm. Nada persiste: ROLLBACK ao final.
-- RPCs sob teste SEMPRE como `authenticated` com claims do ator real; owner (RESET ROLE) só como oráculo.
-- Resultado NULL = FAIL. SKIP em coluna separada, nunca conta como PASS.
-- Empresas reais: AR (admin_ar, financeiro_ar, consultor_ar) e FSF (admin_fsf).
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

CREATE FUNCTION pg_temp.ctx(p_k text) RETURNS text LANGUAGE sql AS $$ SELECT rt_ctx.v FROM rt_ctx WHERE rt_ctx.k=p_k $$;
CREATE FUNCTION pg_temp.ok(p_step text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO rt_results(step,ok,detail) VALUES (p_step,COALESCE(p_ok,false),p_detail); $$;
CREATE FUNCTION pg_temp.skip(p_step text, p_detail text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO rt_results(step,ok,detail,skipped) VALUES (p_step,false,'SKIP: '||p_detail,true); $$;
-- Executa p_sql como `authenticated` com claims do ator; devolve '' em sucesso ou SQLERRM. Resultado em rt_ctx('last').
CREATE FUNCTION pg_temp.as_actor(p_uid uuid, p_sql text, p_iat int DEFAULT -30, p_exp int DEFAULT 600, p_role text DEFAULT 'authenticated')
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_res text; v_err text := '';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_uid,'role',p_role,
    'iat',extract(epoch from now())::bigint+p_iat,'exp',extract(epoch from now())::bigint+p_exp)::text, true);
  IF p_role='anon' THEN EXECUTE 'SET LOCAL ROLE anon'; ELSE EXECUTE 'SET LOCAL ROLE authenticated'; END IF;
  BEGIN
    EXECUTE p_sql INTO v_res;
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_res := NULL;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO rt_ctx VALUES ('last', COALESCE(v_res,'')) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v;
  RETURN v_err;
END; $$;
CREATE FUNCTION pg_temp.set_sql(p_type text, p_id text, p_hidden boolean, p_ver int, p_key uuid, p_reason text DEFAULT 'Teste runtime visibilidade')
RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.tenant_catalog_set_visibility(%L,%L::uuid,%L::boolean,%s,%L,%L::uuid)::text',
    p_type,p_id,p_hidden,p_ver,p_reason,p_key) $$;

-- ============================================================ 0) oráculo owner
DO $$
DECLARE r record; v_org_ar uuid; v_org_fsf uuid;
BEGIN
  FOR r IN SELECT rt_ctx.k AS rk, rt_ctx.v::uuid AS u FROM rt_ctx WHERE rt_ctx.k IN ('sa','admin_ar','admin_fsf','financeiro_ar','consultor_ar') LOOP
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id=r.u) THEN RAISE EXCEPTION 'ator inexistente: %', r.rk; END IF;
    IF r.rk='sa' AND NOT public.is_platform_superadmin(r.u) THEN RAISE EXCEPTION 'sa não é superadmin'; END IF;
    IF r.rk<>'sa' AND public.is_platform_superadmin(r.u) THEN RAISE EXCEPTION 'ator tenant é superadmin: %', r.rk; END IF;
  END LOOP;
  SELECT organization_id INTO v_org_ar FROM public.profiles WHERE user_id=pg_temp.ctx('admin_ar')::uuid;
  SELECT organization_id INTO v_org_fsf FROM public.profiles WHERE user_id=pg_temp.ctx('admin_fsf')::uuid;
  IF v_org_ar IS NULL OR v_org_fsf IS NULL OR v_org_ar=v_org_fsf THEN RAISE EXCEPTION 'empresas AR/FSF inválidas ou iguais'; END IF;
  IF (SELECT organization_id FROM public.profiles WHERE user_id=pg_temp.ctx('financeiro_ar')::uuid) IS DISTINCT FROM v_org_ar
     OR (SELECT organization_id FROM public.profiles WHERE user_id=pg_temp.ctx('consultor_ar')::uuid) IS DISTINCT FROM v_org_ar THEN
    RAISE EXCEPTION 'financeiro/consultor não pertencem a AR'; END IF;
  INSERT INTO rt_ctx VALUES ('org_ar',v_org_ar::text),('org_fsf',v_org_fsf::text);
  INSERT INTO rt_ctx VALUES ('feat_ar', public._saas_user_has_feature(pg_temp.ctx('admin_ar')::uuid,'catalogo_precos')::text),
                            ('feat_fsf', public._saas_user_has_feature(pg_temp.ctx('admin_fsf')::uuid,'catalogo_precos')::text),
                            ('feat_consultor_ar', public._saas_user_has_feature(pg_temp.ctx('consultor_ar')::uuid,'catalogo_precos')::text);
  INSERT INTO rt_ctx SELECT 'prod_ativo', id::text FROM public.produtos WHERE ativo ORDER BY id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'prod_inativo', id::text FROM public.produtos WHERE NOT ativo ORDER BY id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'micro_ativo', id::text FROM public.microrganismos WHERE ativo ORDER BY id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'cultura_ativa', id::text FROM public.culturas WHERE ativo ORDER BY id LIMIT 1;
  INSERT INTO rt_ctx SELECT 'produtos_antes', md5(string_agg(to_jsonb(p)::text, ',' ORDER BY id)) FROM public.produtos p;
  INSERT INTO rt_ctx SELECT 'micros_antes', md5(string_agg(to_jsonb(m)::text, ',' ORDER BY id)) FROM public.microrganismos m;
  INSERT INTO rt_ctx SELECT 'culturas_antes', md5(string_agg(to_jsonb(c)::text, ',' ORDER BY id)) FROM public.culturas c;
  INSERT INTO rt_ctx SELECT 'formulacoes_antes', md5(coalesce(string_agg(to_jsonb(f)::text, ',' ORDER BY id),'')) FROM public.formulacoes f;
  INSERT INTO rt_ctx SELECT 'volumes_antes', md5(coalesce(string_agg(to_jsonb(v)::text, ',' ORDER BY id),'')) FROM public.catalogo_volumes v;
  INSERT INTO rt_ctx SELECT 'bomb_versao', updated_at::text FROM public.produtos WHERE id='1875527c-a65a-483b-a6c2-9122d5ec2a51';
  INSERT INTO rt_ctx SELECT 'pref_count_antes', count(*)::text FROM public.catalog_tenant_visibility;
  IF pg_temp.ctx('prod_ativo') IS NULL OR pg_temp.ctx('micro_ativo') IS NULL OR pg_temp.ctx('cultura_ativa') IS NULL THEN
    RAISE EXCEPTION 'catálogo sem itens ativos para teste'; END IF;
  -- Teste parte de estado limpo para o item usado (se já houver preferência real, o teste falha fechado).
  IF EXISTS (SELECT 1 FROM public.catalog_tenant_visibility WHERE produto_id=pg_temp.ctx('prod_ativo')::uuid) THEN
    RAISE EXCEPTION 'preferência real pré-existente no produto de teste'; END IF;
END $$;

-- ============================================================ 1) estrutura
SELECT pg_temp.ok('estrutura.rls', (SELECT bool_and(relrowsecurity) FROM pg_class
  WHERE oid IN ('public.catalog_tenant_visibility'::regclass,'public.catalog_tenant_visibility_ledger'::regclass)));
SELECT pg_temp.ok('estrutura.sem_grant_cliente', NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name IN ('catalog_tenant_visibility','catalog_tenant_visibility_ledger') AND grantee IN ('anon','authenticated','PUBLIC')));
SELECT pg_temp.ok('estrutura.contencao_global_preservada', NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee IN ('authenticated','anon')
    AND table_name IN ('produtos','microrganismos','culturas','formulacoes','catalogo_volumes') AND privilege_type <> 'SELECT'));
SELECT pg_temp.ok('estrutura.wrappers_invoker', (SELECT bool_and(NOT prosecdef) FROM pg_proc WHERE oid IN (
  'public.tenant_catalog_set_visibility(text,uuid,boolean,integer,text,uuid)'::regprocedure,
  'public.tenant_catalog_read_visibility(text,uuid[])'::regprocedure,
  'public.tenant_catalog_selection_page(text,text,integer,integer,uuid[])'::regprocedure)));
SELECT pg_temp.ok('estrutura.cores_definer_search_path', (SELECT bool_and(prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc WHERE oid IN (
  'platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid)'::regprocedure,
  'platform_private.catalog_tenant_read_visibility_core(text,uuid[])'::regprocedure,
  'platform_private.catalog_tenant_selection_core(text,text,integer,integer,uuid[])'::regprocedure,
  'platform_private.catalog_tenant_actor(text)'::regprocedure)));
SELECT pg_temp.ok('estrutura.anon_sem_execute', NOT has_function_privilege('anon','public.tenant_catalog_set_visibility(text,uuid,boolean,integer,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.tenant_catalog_selection_page(text,text,integer,integer,uuid[])','EXECUTE'));
SELECT pg_temp.ok('estrutura.actor_privado', NOT has_function_privilege('authenticated','platform_private.catalog_tenant_actor(text)','EXECUTE'));
SELECT pg_temp.ok('estrutura.sem_parametro_empresa', NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'tenant_catalog_%' AND pg_get_function_identity_arguments(p.oid) ~* '(organization|tenant|org_id|empresa)'));

-- ============================================================ 2) negativos de autorização
DO $$
DECLARE e text; p text := pg_temp.ctx('prod_ativo');
BEGIN
  e := pg_temp.as_actor(pg_temp.ctx('sa')::uuid, pg_temp.set_sql('produto',p,true,0,gen_random_uuid()));
  PERFORM pg_temp.ok('neg.sa_mutacao', e='catalog_visibility_platform_actor_denied', e);
  e := pg_temp.as_actor(pg_temp.ctx('sa')::uuid, format('SELECT count(*)::text FROM public.tenant_catalog_selection_page(%L,NULL,10,0)','produto'));
  PERFORM pg_temp.ok('neg.sa_leitura_tenant', e='catalog_visibility_platform_actor_denied', e);
  e := pg_temp.as_actor(pg_temp.ctx('financeiro_ar')::uuid, pg_temp.set_sql('produto',p,true,0,gen_random_uuid()));
  PERFORM pg_temp.ok('neg.financeiro_mutacao', e IN ('catalog_visibility_role_denied','catalog_visibility_feature_unavailable'), e);
  e := pg_temp.as_actor(pg_temp.ctx('consultor_ar')::uuid, pg_temp.set_sql('produto',p,true,0,gen_random_uuid()));
  PERFORM pg_temp.ok('neg.consultor_mutacao', e IN ('catalog_visibility_role_denied','catalog_visibility_feature_unavailable'), e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,true,0,gen_random_uuid()), -30, -10);
  PERFORM pg_temp.ok('neg.jwt_expirado', e='catalog_visibility_auth_required', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,true,0,gen_random_uuid()), 3600, 7200);
  PERFORM pg_temp.ok('neg.jwt_iat_futuro', e='catalog_visibility_auth_required', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,true,0,gen_random_uuid()), -30, 600, 'anon');
  PERFORM pg_temp.ok('neg.anon_wrapper', e LIKE 'permission denied%', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, format('SELECT platform_private.catalog_tenant_set_visibility_core(%L,%L::uuid,true,0,%L,gen_random_uuid())::text','produto',p,'Teste anon core'), -30, 600, 'anon');
  PERFORM pg_temp.ok('neg.anon_core', e LIKE 'permission denied%', e);
  -- claims nulas sob authenticated
  PERFORM set_config('request.jwt.claims','',true); SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tenant_catalog_set_visibility('produto',p::uuid,true,0,'Teste claims nulas',gen_random_uuid()); e:='';
  EXCEPTION WHEN OTHERS THEN e:=SQLERRM; END;
  RESET ROLE;
  PERFORM pg_temp.ok('neg.claims_nulas', e='catalog_visibility_auth_required', e);
  -- empresa forjada: parâmetro extra não existe na assinatura
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, format('SELECT public.tenant_catalog_set_visibility(p_entity_type=>%L,p_entity_id=>%L::uuid,p_hidden=>true,p_expected_version=>0,p_reason=>%L,p_idempotency_key=>gen_random_uuid(),p_organization_id=>%L::uuid)::text','produto',p,'Teste forjado',pg_temp.ctx('org_fsf')));
  PERFORM pg_temp.ok('neg.tenant_forjado_param', e LIKE 'function%does not exist%', e);
  -- DML direto negado
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, format('INSERT INTO public.catalog_tenant_visibility(organization_id,entity_type,produto_id,hidden,version,reason,updated_by) VALUES (%L,%L,%L,true,1,%L,%L) RETURNING id::text',pg_temp.ctx('org_fsf'),'produto',p,'forjado direto',pg_temp.ctx('admin_ar')));
  PERFORM pg_temp.ok('neg.dml_direto', e LIKE 'permission denied%', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,true,0,gen_random_uuid(),'abc'));
  PERFORM pg_temp.ok('neg.motivo_curto', e IN ('catalog_visibility_reason_required','catalog_visibility_feature_unavailable'), e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',gen_random_uuid()::text,true,0,gen_random_uuid()));
  PERFORM pg_temp.ok('neg.item_inexistente', e IN ('catalog_visibility_item_not_found','catalog_visibility_feature_unavailable'), e);
END $$;

-- ============================================================ 3) positivos AR/FSF, CAS, replay, isolamento
DO $$
DECLARE e text; p text := pg_temp.ctx('prod_ativo'); k1 uuid := gen_random_uuid(); r jsonb; n bigint;
BEGIN
  IF pg_temp.ctx('feat_ar') <> 'true' OR pg_temp.ctx('feat_fsf') <> 'true' THEN
    PERFORM pg_temp.skip('pos.*', 'entitlement catalogo_precos ausente para admin AR ou FSF — positivos não executados');
    RETURN;
  END IF;
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,true,0,k1));
  r := NULLIF(pg_temp.ctx('last'),'')::jsonb;
  PERFORM pg_temp.ok('pos.ar_oculta_v1', e='' AND (r->>'version')::int=1 AND (r->>'hidden')::boolean, e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,true,0,k1));
  r := NULLIF(pg_temp.ctx('last'),'')::jsonb;
  PERFORM pg_temp.ok('pos.replay_mesmo_payload', e='' AND (r->>'replayed')::boolean AND (r->>'version')::int=1, e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,false,1,k1));
  PERFORM pg_temp.ok('neg.replay_payload_diferente', e='catalog_visibility_idempotency_conflict', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,true,0,gen_random_uuid()));
  PERFORM pg_temp.ok('neg.cas_primeira_gravacao_duplicada', e='catalog_visibility_version_conflict', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,false,5,gen_random_uuid()));
  PERFORM pg_temp.ok('neg.cas_stale', e='catalog_visibility_version_conflict', e);
  -- seletor AR exclui; FSF inclui (estado A não afeta B)
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, format('SELECT count(*)::text FROM public.tenant_catalog_selection_page(%L,NULL,100,0) s WHERE s.id=%L::uuid','produto',p));
  PERFORM pg_temp.ok('iso.ar_seletor_exclui', e='' AND pg_temp.ctx('last')='0', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, format('SELECT selectable::text FROM public.tenant_catalog_selection_page(%L,NULL,1,0,ARRAY[%L::uuid]) s WHERE s.id=%L::uuid','produto',p,p));
  PERFORM pg_temp.ok('hist.include_ids_marca_nao_selecionavel', e='' AND pg_temp.ctx('last')='false', e);
  -- mesma chave em OUTRO item: conflito consistente (lock ator+empresa+chave antes do item)
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('microrganismo',pg_temp.ctx('micro_ativo'),true,0,k1));
  PERFORM pg_temp.ok('neg.mesma_chave_outro_item', e='catalog_visibility_idempotency_conflict', e);
  -- IDs ocultos: AR vê o produto, FSF não
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, format('SELECT count(*)::text FROM public.tenant_catalog_hidden_ids(%L) h WHERE h.entity_id=%L::uuid','produto',p));
  PERFORM pg_temp.ok('pos.hidden_ids_ar', e='' AND pg_temp.ctx('last')='1', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_fsf')::uuid, format('SELECT count(*)::text FROM public.tenant_catalog_hidden_ids(%L) h WHERE h.entity_id=%L::uuid','produto',p));
  PERFORM pg_temp.ok('iso.hidden_ids_fsf_vazio', e='' AND pg_temp.ctx('last')='0', e);
  -- include de item VISÍVEL fora da página: devolvido, selecionável, sem duplicar
  e := pg_temp.as_actor(pg_temp.ctx('admin_fsf')::uuid, format('SELECT (count(*)::text || '':'' || bool_and(selectable)::text) FROM public.tenant_catalog_selection_page(%L,%L,1,0,ARRAY[%L::uuid]) s WHERE s.id=%L::uuid','produto','zzzz-sem-match',p,p));
  PERFORM pg_temp.ok('sel.include_visivel_fora_pagina_selecionavel', e='' AND pg_temp.ctx('last')='1:true', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_fsf')::uuid, format('SELECT count(*)::text FROM public.tenant_catalog_read_visibility(%L,ARRAY[%L::uuid])','produto',p));
  PERFORM pg_temp.ok('iso.fsf_nao_ve_pref_ar', e='' AND pg_temp.ctx('last')='0', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_fsf')::uuid, format('SELECT count(*)::text FROM public.tenant_catalog_selection_page(%L,%L,100,0) s WHERE s.id=%L::uuid','produto',
    (SELECT left(nome,40) FROM public.produtos WHERE id=p::uuid),p));
  PERFORM pg_temp.ok('iso.fsf_seletor_inclui', e='' AND pg_temp.ctx('last')='1', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_fsf')::uuid, pg_temp.set_sql('produto',p,false,1,gen_random_uuid()));
  PERFORM pg_temp.ok('iso.fsf_nao_altera_ar', e IN ('catalog_visibility_version_conflict','catalog_visibility_no_change'), e);
  -- leitura histórica direta (RLS SELECT existente) não é afetada pela ocultação
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, format('SELECT count(*)::text FROM public.produtos WHERE id=%L::uuid',p));
  PERFORM pg_temp.ok('hist.leitura_direta_preservada', e='' AND pg_temp.ctx('last')='1', e);
  -- reexibir
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',p,false,1,gen_random_uuid()));
  r := NULLIF(pg_temp.ctx('last'),'')::jsonb;
  PERFORM pg_temp.ok('pos.ar_reexibe_v2', e='' AND (r->>'version')::int=2 AND NOT (r->>'hidden')::boolean, e);
  -- consultor lê seletor (interseção com permissões atuais)
  e := pg_temp.as_actor(pg_temp.ctx('consultor_ar')::uuid, format('SELECT count(*)::text FROM public.tenant_catalog_selection_page(%L,NULL,5,0)','cultura'));
  PERFORM pg_temp.ok('pos.consultor_le_seletor_cultura', e='', e);
  -- seletor de cultura NÃO exige catalogo_precos (preserva acesso efetivo da visita); mutação continua exigindo
  IF pg_temp.ctx('feat_consultor_ar') = 'false' THEN
    PERFORM pg_temp.ok('pos.cultura_sem_gate_comercial', e='', e);
  ELSE
    PERFORM pg_temp.skip('pos.cultura_sem_gate_comercial', 'consultor AR possui catalogo_precos; ausência do gate não demonstrável com ator real');
  END IF;
  -- micro e cultura
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('microrganismo',pg_temp.ctx('micro_ativo'),true,0,gen_random_uuid()));
  PERFORM pg_temp.ok('pos.micro_oculta', e='', e);
  e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('cultura',pg_temp.ctx('cultura_ativa'),true,0,gen_random_uuid()));
  PERFORM pg_temp.ok('pos.cultura_oculta', e='', e);
  -- ledger imutável (owner)
  BEGIN UPDATE public.catalog_tenant_visibility_ledger SET reason='x' WHERE organization_id=pg_temp.ctx('org_ar')::uuid; e:='';
  EXCEPTION WHEN OTHERS THEN e:=SQLERRM; END;
  PERFORM pg_temp.ok('ledger.imutavel_update', e='catalog_visibility_ledger_immutable', e);
  SELECT count(*) INTO n FROM public.catalog_tenant_visibility_ledger WHERE organization_id=pg_temp.ctx('org_ar')::uuid;
  PERFORM pg_temp.ok('ledger.registros', n=4, n::text); -- conflitos/negativos não gravam ledger
  -- inativo
  IF pg_temp.ctx('prod_inativo') IS NULL THEN
    PERFORM pg_temp.skip('neg.inativo_reexibir', 'sem produto global inativo real');
  ELSE
    e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',pg_temp.ctx('prod_inativo'),true,0,gen_random_uuid()));
    e := pg_temp.as_actor(pg_temp.ctx('admin_ar')::uuid, pg_temp.set_sql('produto',pg_temp.ctx('prod_inativo'),false,1,gen_random_uuid()));
    PERFORM pg_temp.ok('neg.inativo_reexibir', e='catalog_visibility_item_inactive', e);
    e := pg_temp.as_actor(pg_temp.ctx('admin_fsf')::uuid, format('SELECT count(*)::text FROM public.tenant_catalog_selection_page(%L,NULL,100,0) s WHERE s.id=%L::uuid','produto',pg_temp.ctx('prod_inativo')));
    PERFORM pg_temp.ok('neg.inativo_fora_seletor', e='' AND pg_temp.ctx('last')='0', e);
  END IF;
END $$;

-- ============================================================ 4) invariantes finais (owner)
SELECT pg_temp.ok('final.produtos_intactos', md5(string_agg(to_jsonb(p)::text, ',' ORDER BY id))=pg_temp.ctx('produtos_antes')) FROM public.produtos p;
SELECT pg_temp.ok('final.micros_intactos', md5(string_agg(to_jsonb(m)::text, ',' ORDER BY id))=pg_temp.ctx('micros_antes')) FROM public.microrganismos m;
SELECT pg_temp.ok('final.culturas_intactas', md5(string_agg(to_jsonb(c)::text, ',' ORDER BY id))=pg_temp.ctx('culturas_antes')) FROM public.culturas c;
SELECT pg_temp.ok('final.formulacoes_intactas', md5(coalesce(string_agg(to_jsonb(f)::text, ',' ORDER BY id),''))=pg_temp.ctx('formulacoes_antes')) FROM public.formulacoes f;
SELECT pg_temp.ok('final.volumes_intactos', md5(coalesce(string_agg(to_jsonb(v)::text, ',' ORDER BY id),''))=pg_temp.ctx('volumes_antes')) FROM public.catalogo_volumes v;
SELECT pg_temp.ok('final.bombarbio', (SELECT ativo AND b2b_enabled AND valor_litro_brl=180 AND updated_at::text=pg_temp.ctx('bomb_versao')
  FROM public.produtos WHERE id='1875527c-a65a-483b-a6c2-9122d5ec2a51')
  AND (SELECT array_agg(volume_ml ORDER BY volume_ml DESC) FROM public.formulacoes WHERE produto_id='1875527c-a65a-483b-a6c2-9122d5ec2a51')=ARRAY[334,333,333]::numeric[]);

SELECT step, CASE WHEN skipped THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS resultado, detail FROM rt_results
  WHERE skipped OR NOT ok OR detail IS NOT NULL ORDER BY n;
SELECT count(*) FILTER (WHERE ok AND NOT skipped) AS pass, count(*) FILTER (WHERE NOT ok AND NOT skipped) AS fail,
  count(*) FILTER (WHERE skipped) AS skip, count(*) AS total FROM rt_results;
ROLLBACK;
