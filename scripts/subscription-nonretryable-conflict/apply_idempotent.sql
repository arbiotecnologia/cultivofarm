-- REGISTRO da migration JÁ APLICADA `subscription_business_conflict_nonretryable`
-- (swzpzcwiasxmjutrmvkm, 2026-10-19). NÃO reaplicar automaticamente.
-- Estado já aplicado (md5 pós) => NO-OP. Estado baseline (md5 pré) => troca dos 9
-- ERRCODE='40001' exatos por 'PT409' com verificação pós. Qualquer outro md5 => DRIFT, aborta.
BEGIN;
DO $guard$
DECLARE
  fn constant regprocedure := 'platform_private.transition_subscription_core(uuid,text,text,uuid,uuid)'::regprocedure;
  pre_md5  constant text := 'e7e3b57debf67673a82e3f4f7c2daa48';
  post_md5 constant text := '447ee6a17af25c2b746ce082df6b9b01';
  def text; newdef text; n int; acl_before text; acl_after text;
BEGIN
  IF current_setting('app.expected_project_ref', true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'fail-closed: defina SET app.expected_project_ref = swzpzcwiasxmjutrmvkm';
  END IF;
  SELECT pg_get_functiondef(fn), p.proacl::text INTO def, acl_before FROM pg_proc p WHERE p.oid = fn;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = fn AND p.prosecdef
                 AND pg_get_userbyid(p.proowner) = 'postgres'
                 AND p.proconfig = ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'drift: owner/security definer/search_path divergentes';
  END IF;
  IF md5(def) = post_md5 THEN
    RAISE NOTICE 'NO-OP: mitigação já aplicada (md5 %)', post_md5;
    RETURN;
  END IF;
  IF md5(def) <> pre_md5 THEN
    RAISE EXCEPTION 'drift: md5 % não é pré nem pós', md5(def);
  END IF;
  n := (length(def) - length(replace(def, $q$ERRCODE='40001'$q$, ''))) / length($q$ERRCODE='40001'$q$);
  IF n <> 9 OR position('PT409' in def) > 0 THEN
    RAISE EXCEPTION 'drift: esperadas 9 ocorrências 40001 e nenhuma PT409 (achou %)', n;
  END IF;
  newdef := replace(def, $q$ERRCODE='40001'$q$, $q$ERRCODE='PT409'$q$);
  EXECUTE newdef;
  SELECT pg_get_functiondef(fn), p.proacl::text INTO def, acl_after FROM pg_proc p WHERE p.oid = fn;
  IF md5(def) <> post_md5 OR acl_after IS DISTINCT FROM acl_before
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = fn AND p.prosecdef
                    AND pg_get_userbyid(p.proowner) = 'postgres'
                    AND p.proconfig = ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'post falhou: md5 %, acl %', md5(def), acl_after;
  END IF;
END
$guard$;
COMMIT;
