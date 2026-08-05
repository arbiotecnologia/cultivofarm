-- Verifica o baseline seguro forward-safe após rollback.sql.
DO $verify$
DECLARE
  c_expected constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod constant text := 'navfzbwgwzruipouyfnk';
  expected constant jsonb := jsonb_build_object(
    'is_visit_responsible','cbcde4e2ec28a0bf4533f7e5173561732c31acde7e9c3f0b5a1a89d79712570c',
    'rpc_criar_visita_idempotente','a1273b8eed509268d73d7c5345d1779fd3389207e32c624bda6daba01351f3bc',
    'rpc_iniciar_atendimento_solicitacao_v1','08225d8ca367a9d5345c440bc628ac1ecc7ff852eef0faab45a500b9c7aca851',
    'rpc_listar_atendimentos_tecnicos_v1','56aff563154e14d63516e41498b7dcf0152a18f46a4f91c041d29fb9a23ae52b',
    'rpc_resumo_atendimentos_tecnicos_v1','bffd7dc86c34fd1c057ff86a43a061562eb8ba9d6c1d659d8c2b57b517ef409a',
    'rpc_finalizar_visita_v2','480c8a8a97458abced69f11029fd4b28617ee4958493bf9972fdc66ec7a9e382'
  );
  v_ref text; r record; v_oid oid; v_sum text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING';
  IF v_ref = c_prod OR v_ref IS DISTINCT FROM c_expected THEN RAISE EXCEPTION 'GUARD_ABORT'; END IF;
  FOR r IN SELECT key AS fname, value #>> '{}' AS checksum FROM jsonb_each(expected) LOOP
    SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname=r.fname;
    IF v_oid IS NULL OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=r.fname) <> 1 THEN RAISE EXCEPTION 'VERIFY FAIL: % ausente/overload',r.fname; END IF;
    SELECT encode(extensions.digest(pg_get_functiondef(v_oid)::bytea,'sha256'),'hex') INTO v_sum;
    IF v_sum IS DISTINCT FROM r.checksum THEN RAISE EXCEPTION 'VERIFY FAIL: checksum %',r.fname; END IF;
    IF has_function_privilege('anon',v_oid,'EXECUTE') OR EXISTS (SELECT 1 FROM pg_proc p,
      aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=v_oid AND a.grantee=0 AND a.privilege_type='EXECUTE')
      THEN RAISE EXCEPTION 'VERIFY FAIL: anon/PUBLIC %',r.fname; END IF;
    IF NOT has_function_privilege('authenticated',v_oid,'EXECUTE') OR NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_oid)
      OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_oid AND proconfig @> ARRAY['search_path=public'])
      OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=v_oid) <> 'postgres'
      THEN RAISE EXCEPTION 'VERIFY FAIL: metadata %',r.fname; END IF;
  END LOOP;
  IF pg_get_functiondef(to_regprocedure('public.is_visit_responsible(uuid,uuid)')) LIKE '%consultor_profile_id = p_user_id%'
    THEN RAISE EXCEPTION 'VERIFY FAIL: autorização insegura'; END IF;
  IF position('cultura_obrigatoria' in pg_get_functiondef(to_regprocedure('public.rpc_finalizar_visita_v2(uuid,integer)'))) = 0
    THEN RAISE EXCEPTION 'VERIFY FAIL: gate cultura'; END IF;
  RAISE NOTICE 'VERIFY_RESTORATION_OK';
END
$verify$;
