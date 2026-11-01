-- Asserções em PG descartável. Cada caso imprime PASS/FAIL. Auth sintética via test.uid.
\set ON_ERROR_STOP 0
CREATE TEMP TABLE r(n serial, name text, ok boolean, detail text);
GRANT ALL ON r TO authenticated; GRANT USAGE ON SEQUENCE r_n_seq TO authenticated;

CREATE FUNCTION pg_temp.expect_err(p_name text, p_sql text, p_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE p_sql;
    INSERT INTO r(name,ok,detail) VALUES (p_name,false,'no error');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r(name,ok,detail) VALUES (p_name, SQLSTATE=p_state, SQLSTATE||' '||SQLERRM);
  END;
END $$;
CREATE FUNCTION pg_temp.expect_ok(p_name text, p_sql text, p_check text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  BEGIN EXECUTE p_sql; EXECUTE p_check INTO v;
    INSERT INTO r(name,ok,detail) VALUES (p_name, coalesce(v,false), 'check='||coalesce(v::text,'null'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r(name,ok,detail) VALUES (p_name,false,SQLSTATE||' '||SQLERRM);
  END;
END $$;

-- 0. gate fechado por padrão: admin A negado
SET test.uid='11111111-1111-1111-1111-111111111111'; SET ROLE authenticated;
SELECT pg_temp.expect_err('gate_off_denies', $q$SELECT public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a',NULL,'{"ncm":"31010000"}','motivo de teste ok','90000000-0000-0000-0000-000000000001')$q$,'42501');
RESET ROLE; UPDATE platform_private.owned_fiscal_gate SET enabled=true; SET ROLE authenticated;

-- 1. admin A cria perfil DRAFT do próprio item
SELECT pg_temp.expect_ok('admin_A_creates_own', $q$SELECT public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a',NULL,'{"ncm":"31010000","cfop_in_state":"5101"}','motivo de teste ok','90000000-0000-0000-0000-000000000002')$q$,
  $c$SELECT profile_status='DRAFT' AND ncm='31010000' FROM public.product_fiscal_profiles WHERE product_id='d0000000-0000-0000-0000-00000000000a'$c$);
-- 2. replay mesma chave/payload: idempotente, sem duplicar
SELECT pg_temp.expect_ok('replay_same_key', $q$SELECT 1$q$,
  $c$SELECT (public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a',NULL,'{"ncm":"31010000","cfop_in_state":"5101"}','motivo de teste ok','90000000-0000-0000-0000-000000000002')->>'idempotent')::boolean
     AND (SELECT count(*) FROM public.product_fiscal_profiles WHERE product_id='d0000000-0000-0000-0000-00000000000a')=1$c$);
-- 3. mesma chave, payload diferente: conflito
SELECT pg_temp.expect_err('same_key_other_payload', $q$SELECT public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a',NULL,'{"ncm":"31010001"}','motivo de teste ok','90000000-0000-0000-0000-000000000002')$q$,'PT409');
-- 4. CAS: sem expected em perfil existente = stale
SELECT pg_temp.expect_err('cas_missing_expected', $q$SELECT public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a',NULL,'{"ncm":"31010001"}','motivo de teste ok','90000000-0000-0000-0000-000000000003')$q$,'PT409');
SELECT pg_temp.expect_err('cas_wrong_expected', $q$SELECT public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a','2000-01-01','{"ncm":"31010001"}','motivo de teste ok','90000000-0000-0000-0000-000000000004')$q$,'PT409');
-- 5. CAS correto atualiza e mantém DRAFT
SELECT pg_temp.expect_ok('cas_ok_update', $q$SELECT public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a',(SELECT updated_at FROM public.product_fiscal_profiles WHERE product_id='d0000000-0000-0000-0000-00000000000a'),'{"ncm":"31010001"}','motivo de teste ok','90000000-0000-0000-0000-000000000005')$q$,
  $c$SELECT ncm='31010001' AND profile_status='DRAFT' AND cfop_in_state IS NULL FROM public.product_fiscal_profiles WHERE product_id='d0000000-0000-0000-0000-00000000000a'$c$);
-- 6. formato inválido / chave não permitida
SELECT pg_temp.expect_err('invalid_ncm', $q$SELECT public.tenant_owned_product_fiscal_save('e0000000-0000-0000-0000-00000000000b',NULL,'{"ncm":"123"}','motivo de teste ok','90000000-0000-0000-0000-000000000006')$q$,'22023');
SELECT pg_temp.expect_err('forbidden_key_status', $q$SELECT public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a',NULL,'{"profile_status":"VALIDATED"}','motivo de teste ok','90000000-0000-0000-0000-000000000007')$q$,'22023');
-- 7. admin A não grava item de B nem global
SELECT pg_temp.expect_err('A_writes_B_denied', $q$SELECT public.tenant_owned_product_fiscal_save('e0000000-0000-0000-0000-00000000000b',NULL,'{"ncm":"31010000"}','motivo de teste ok','90000000-0000-0000-0000-000000000008')$q$,'42501');
SELECT pg_temp.expect_err('A_writes_global_via_rpc_denied', $q$SELECT public.tenant_owned_product_fiscal_save('c0000000-0000-0000-0000-00000000000c',NULL,'{"ncm":"31010000"}','motivo de teste ok','90000000-0000-0000-0000-000000000009')$q$,'42501');
-- 8. admin A direto na tabela: insert em item próprio negado por RLS
SELECT pg_temp.expect_err('A_direct_insert_denied', $q$INSERT INTO public.product_fiscal_profiles(product_id) VALUES ('d0000000-0000-0000-0000-00000000000a')$q$,'42501');
-- 9. admin B não vê perfil de A (RLS restritiva)
SET test.uid='33333333-3333-3333-3333-333333333333';
SELECT pg_temp.expect_ok('B_cannot_read_A', $q$SELECT 1$q$, $c$SELECT count(*)=0 FROM public.product_fiscal_profiles WHERE product_id='d0000000-0000-0000-0000-00000000000a'$c$);
SELECT pg_temp.expect_ok('B_list_only_own', $q$SELECT 1$q$, $c$SELECT (public.tenant_owned_product_fiscal_list(50,0)->>'total')::int=1 AND public.tenant_owned_product_fiscal_list(50,0)->'items'->0->>'product_id'='e0000000-0000-0000-0000-00000000000b'$c$);
SELECT pg_temp.expect_err('B_replay_A_key_denied', $q$SELECT public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a',NULL,'{"ncm":"31010000","cfop_in_state":"5101"}','motivo de teste ok','90000000-0000-0000-0000-000000000002')$q$,'PT409');
-- 10. gestor A lê, não grava
SET test.uid='22222222-2222-2222-2222-222222222222';
SELECT pg_temp.expect_ok('gestor_reads', $q$SELECT 1$q$, $c$SELECT (public.tenant_owned_product_fiscal_list(50,0)->>'total')::int=1$c$);
SELECT pg_temp.expect_err('gestor_write_denied', $q$SELECT public.tenant_owned_product_fiscal_save('d0000000-0000-0000-0000-00000000000a',NULL,'{}','motivo de teste ok','90000000-0000-0000-0000-00000000000a')$q$,'42501');
-- 11. superadmin não grava item próprio (RPC e direto); continua gravando global direto
SET test.uid='44444444-4444-4444-4444-444444444444';
SELECT pg_temp.expect_err('SA_rpc_owned_denied', $q$SELECT public.tenant_owned_product_fiscal_save('e0000000-0000-0000-0000-00000000000b',NULL,'{}','motivo de teste ok','90000000-0000-0000-0000-00000000000b')$q$,'42501');
SELECT pg_temp.expect_err('SA_direct_owned_denied', $q$INSERT INTO public.product_fiscal_profiles(product_id) VALUES ('e0000000-0000-0000-0000-00000000000b')$q$,'42501');
SELECT pg_temp.expect_ok('SA_global_direct_ok', $q$INSERT INTO public.product_fiscal_profiles(product_id,ncm) VALUES ('c0000000-0000-0000-0000-00000000000c','31010000')$q$,
  $c$SELECT count(*)=1 FROM public.product_fiscal_profiles WHERE product_id='c0000000-0000-0000-0000-00000000000c'$c$);
SELECT pg_temp.expect_ok('SA_cannot_read_owned', $q$SELECT 1$q$, $c$SELECT count(*)=0 FROM public.product_fiscal_profiles WHERE product_id='d0000000-0000-0000-0000-00000000000a'$c$);
-- 12. global continua visível para admin A
SET test.uid='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.expect_ok('A_reads_global', $q$SELECT 1$q$, $c$SELECT count(*)=1 FROM public.product_fiscal_profiles WHERE product_id='c0000000-0000-0000-0000-00000000000c'$c$);
-- 13. ator inativo e anon negados
SET test.uid='55555555-5555-5555-5555-555555555555';
SELECT pg_temp.expect_err('inactive_denied', $q$SELECT public.tenant_owned_product_fiscal_list(50,0)$q$,'42501');
RESET ROLE; SET test.uid=''; SET ROLE anon;
SELECT pg_temp.expect_err('anon_no_execute', $q$SELECT public.tenant_owned_product_fiscal_list(50,0)$q$,'42501');
RESET ROLE;
-- 14. rollback deny-only fecha tudo e preserva dados/policies
\i rollback.sql.review
SET test.uid='11111111-1111-1111-1111-111111111111'; SET ROLE authenticated;
SELECT pg_temp.expect_err('after_rollback_denied', $q$SELECT public.tenant_owned_product_fiscal_list(50,0)$q$,'42501');
RESET ROLE;
INSERT INTO r(name,ok,detail) SELECT 'rollback_keeps_policies_receipts',
  (SELECT count(*) FROM pg_policies WHERE tablename='product_fiscal_profiles')=7
  AND (SELECT count(*) FROM platform_private.owned_fiscal_receipts)>=2, 'policies/receipts';
-- 15. reinstalação recusada
\set ON_ERROR_STOP 0
SELECT name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail FROM r ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS pass, count(*) FILTER (WHERE NOT ok) AS fail FROM r;
