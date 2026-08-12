\echo '== G1: search_path canonico =='
SELECT p.proname, coalesce(array_to_string(p.proconfig,','),'(nenhum)') AS cfg,
       CASE WHEN 'search_path=public, pg_temp' = ANY(p.proconfig) THEN 'PASS' ELSE 'FAIL' END AS gate
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
('rpc_cockpit_criar_entrega_v1','rpc_cockpit_gerar_lote_v1','_avancar_os_status','check_os_status_transition',
 'rpc_cockpit_confirmar_entrega_v1','rpc_cockpit_cancelar_reserva_v1','rpc_entrega_confirmar_v1',
 'fn_entrega_confirmar_engine_v1','fn_entrega_assert_confirmador','_rpc_avancar_esteira_laboratorio_internal')
ORDER BY 1;

\echo '== G2: sem EXECUTE para PUBLIC/anon =='
SELECT p.proname,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'FAIL(anon)' ELSE 'PASS' END AS gate
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
('rpc_cockpit_criar_entrega_v1','rpc_cockpit_gerar_lote_v1','rpc_cockpit_confirmar_entrega_v1',
 'rpc_cockpit_cancelar_reserva_v1','rpc_entrega_confirmar_v1','fn_entrega_confirmar_engine_v1',
 'fn_entrega_assert_confirmador','_rpc_avancar_esteira_laboratorio_internal')
ORDER BY 1;

\echo '== G3: authenticated mantem EXECUTE =='
SELECT p.proname,
       CASE WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'PASS' ELSE 'FAIL' END AS gate
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
('rpc_cockpit_confirmar_entrega_v1','rpc_entrega_confirmar_v1','fn_entrega_confirmar_engine_v1')
ORDER BY 1;

\echo '== G4: motor unico (delegacao) =='
SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%fn_entrega_confirmar_engine_v1%' THEN 'PASS' ELSE 'FAIL' END AS gate
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='rpc_cockpit_confirmar_entrega_v1';

\echo '== G5: CQ deterministico (sem janela de 10s) =='
SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%ORDER BY created_at DESC%'
             AND pg_get_functiondef(p.oid) NOT LIKE '%10 seconds%' THEN 'PASS' ELSE 'FAIL' END AS gate
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='_rpc_avancar_esteira_laboratorio_internal';

\echo '== G6: acoes de estoque validas frente a constraint =='
SELECT unnest(ARRAY['expedicao','cancelamento_reserva','entrada']) AS acao;
SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname='estoque_movimentacoes_acao_valida';
