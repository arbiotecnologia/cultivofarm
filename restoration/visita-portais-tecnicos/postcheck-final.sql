-- ============================================================================
-- POST-CHECK DO ESTADO FINAL — Fluxo unificado de atendimento técnico
-- Executar DEPOIS de reaplicar a migration canônica. Read-only.
-- Compara SHA-256 com as constantes esperadas do ESTADO FINAL e falha em
-- qualquer divergência, overload ou vazamento para anon/PUBLIC.
-- ============================================================================

DO $post$
DECLARE
  c_expected constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod     constant text := 'navfzbwgwzruipouyfnk';
  expected constant jsonb := jsonb_build_object(
    'is_visit_responsible',
      'cbcde4e2ec28a0bf4533f7e5173561732c31acde7e9c3f0b5a1a89d79712570c',
    'rpc_criar_visita_idempotente',
      'a1273b8eed509268d73d7c5345d1779fd3389207e32c624bda6daba01351f3bc',
    'rpc_iniciar_atendimento_solicitacao_v1',
      '08225d8ca367a9d5345c440bc628ac1ecc7ff852eef0faab45a500b9c7aca851',
    'rpc_listar_atendimentos_tecnicos_v1',
      '56aff563154e14d63516e41498b7dcf0152a18f46a4f91c041d29fb9a23ae52b',
    'rpc_resumo_atendimentos_tecnicos_v1',
      'bffd7dc86c34fd1c057ff86a43a061562eb8ba9d6c1d659d8c2b57b517ef409a',
    'rpc_finalizar_visita_v2',
      '480c8a8a97458abced69f11029fd4b28617ee4958493bf9972fdc66ec7a9e382'
  );
  v_ref text;
  r record;
  v_got text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: marcador de staging inexistente';
  END IF;
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref = c_prod OR v_ref IS DISTINCT FROM c_expected THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente % nao autorizado', coalesce(v_ref,'<null>');
  END IF;

  FOR r IN SELECT key AS fname, value #>> '{}' AS sum FROM jsonb_each(expected) LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname = r.fname) <> 1 THEN
      RAISE EXCEPTION 'POST FAIL: % ausente ou com overload', r.fname;
    END IF;
    SELECT encode(extensions.digest(pg_get_functiondef(p.oid)::bytea,'sha256'),'hex') INTO v_got
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname = r.fname;
    IF v_got IS DISTINCT FROM r.sum THEN
      RAISE EXCEPTION 'POST FAIL: checksum % esperado % obtido %', r.fname, r.sum, v_got;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname = r.fname
                  AND has_function_privilege('anon', p.oid, 'EXECUTE')) THEN
      RAISE EXCEPTION 'POST FAIL: anon possui EXECUTE em %', r.fname;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE n.nspname='public' AND p.proname = r.fname
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'POST FAIL: PUBLIC possui EXECUTE em %', r.fname;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                    WHERE n.nspname='public' AND p.proname=r.fname
                      AND p.prosecdef AND p.proconfig @> ARRAY['search_path=public']
                      AND pg_get_userbyid(p.proowner)='postgres') THEN
      RAISE EXCEPTION 'POST FAIL: owner/security/search_path incorretos em %', r.fname;
    END IF;
    RAISE NOTICE 'POST OK: % checksum e grants conferem', r.fname;
  END LOOP;

  RAISE NOTICE 'POSTCHECK_FINAL_OK';
END
$post$;
