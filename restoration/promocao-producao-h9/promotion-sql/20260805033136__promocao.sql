-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260805033136_7af48a56-abc9-49f9-9242-c15695568e2b.sql
-- SHA-256 orig: 28f3202927c4a412d361dc6155e346285ce18550338cd5bd0dc2b465d08513ef
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- [guarda de homologação removida pelo gerador de promoção]


DO $patch$
DECLARE v_oid oid; v_def text; v_new text;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_criar_visita_idempotente';
  v_def := pg_get_functiondef(v_oid);

  v_new := replace(v_def,
    E'    v_uid, v_uid,\n    v_natureza,',
    E'    v_uid, (SELECT pr.id FROM public.profiles pr WHERE pr.user_id = v_uid LIMIT 1), v_uid,\n    v_natureza,');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'PATCH_ABORT: bloco VALUES nao localizado';
  END IF;
  EXECUTE v_new;
END $patch$;

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_criar_visita_idempotente';
  IF position('SELECT pr.id FROM public.profiles pr WHERE pr.user_id = v_uid LIMIT 1' in v_def) = 0 THEN
    RAISE EXCEPTION 'VERIFY_FAIL: valor de consultor_profile_id ausente';
  END IF;
  RAISE NOTICE 'VERIFY_OK';
END $verify$;