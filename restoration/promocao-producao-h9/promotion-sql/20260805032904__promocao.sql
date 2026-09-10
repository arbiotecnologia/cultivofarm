-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260805032904_e870b640-c77e-4d75-a1aa-a398fb5c7c3c.sql
-- SHA-256 orig: 183f73bb9f08ea763f92056ab84bc59974e47ca760310a8eee2e18004fb80ff3
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
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_criar_visita_idempotente';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'PATCH_ABORT: rpc_criar_visita_idempotente ausente';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF position('HAVING count(*) OVER () = 1' in v_def) = 0 THEN
    RAISE NOTICE 'PATCH_SKIP: defeito ja corrigido';
    RETURN;
  END IF;

  v_new := regexp_replace(
    v_def,
    'SELECT ts\.cultura_id, ts\.safra\s+INTO v_cultura, v_safra\s+FROM public\.talhao_safras ts\s+WHERE ts\.talhao_id = p_talhao_id\s+AND ts\.cultura_id IS NOT NULL\s+AND COALESCE\(ts\.status,''ativa''\) IN \(''ativa'',''em_andamento'',''plantada''\)\s+GROUP BY ts\.cultura_id, ts\.safra\s+HAVING count\(\*\) OVER \(\) = 1;',
    'WITH cand AS (
      SELECT DISTINCT ts.cultura_id, ts.safra
        FROM public.talhao_safras ts
       WHERE ts.talhao_id = p_talhao_id
         AND ts.cultura_id IS NOT NULL
         AND COALESCE(ts.status,''ativa'') IN (''ativa'',''em_andamento'',''plantada'')
    )
    SELECT c.cultura_id, c.safra
      INTO v_cultura, v_safra
      FROM cand c
     WHERE (SELECT count(*) FROM cand) = 1;',
    'g');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'PATCH_ABORT: bloco alvo nao localizado — nenhuma alteracao aplicada';
  END IF;

  EXECUTE v_new;
  RAISE NOTICE 'PATCH_OK: resolucao de cultura corrigida';
END $patch$;

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_criar_visita_idempotente';
  IF position('OVER () = 1' in v_def) > 0 THEN
    RAISE EXCEPTION 'VERIFY_FAIL: window function em HAVING persiste';
  END IF;
  RAISE NOTICE 'VERIFY_OK';
END $verify$;