-- ROLLBACK GUARDADO — NÃO EXECUTAR sem decisão explícita do proprietário.
-- ALERTA: reintroduz ERRCODE='40001' customizado, que o PostgREST trata como
-- serialization failure e REPETE INDEFINIDAMENTE (retry infinito / CPU alta conhecidos:
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).
-- Inverso exato: somente a partir do md5 pós; troca as 9 PT409 por 40001 e exige md5 pré.
BEGIN;
DO $guard$
DECLARE
  fn constant regprocedure := 'platform_private.transition_subscription_core(uuid,text,text,uuid,uuid)'::regprocedure;
  pre_md5  constant text := 'e7e3b57debf67673a82e3f4f7c2daa48';
  post_md5 constant text := '447ee6a17af25c2b746ce082df6b9b01';
  def text; n int; acl_before text; acl_after text;
BEGIN
  IF current_setting('app.expected_project_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm'
     OR current_setting('app.confirm_reintroduce_40001_retry', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'fail-closed: ref e confirmação explícita obrigatórios';
  END IF;
  SELECT pg_get_functiondef(fn), p.proacl::text INTO def, acl_before FROM pg_proc p WHERE p.oid = fn;
  IF md5(def) <> post_md5 THEN RAISE EXCEPTION 'drift: md5 % não é o pós', md5(def); END IF;
  n := (length(def) - length(replace(def, $q$ERRCODE='PT409'$q$, ''))) / length($q$ERRCODE='PT409'$q$);
  IF n <> 9 THEN RAISE EXCEPTION 'drift: esperadas 9 PT409, achou %', n; END IF;
  EXECUTE replace(def, $q$ERRCODE='PT409'$q$, $q$ERRCODE='40001'$q$);
  SELECT pg_get_functiondef(fn), p.proacl::text INTO def, acl_after FROM pg_proc p WHERE p.oid = fn;
  IF md5(def) <> pre_md5 OR acl_after IS DISTINCT FROM acl_before
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = fn AND p.prosecdef
                    AND pg_get_userbyid(p.proowner) = 'postgres'
                    AND p.proconfig = ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'post rollback falhou: md5 %', md5(def);
  END IF;
END
$guard$;
COMMIT;
