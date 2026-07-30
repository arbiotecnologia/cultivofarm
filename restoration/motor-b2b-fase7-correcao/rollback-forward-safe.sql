-- Fase 7 — Correção consolidada — ROLLBACK FORWARD-SAFE
-- Reverte APENAS a vitrine do catálogo B2B para o comportamento anterior
-- (resolução via fn_resolve_commercial_price sem plano). NÃO apaga dados,
-- NÃO remove preços legítimos, NÃO reabre permissões.
--
-- ATENÇÃO: aplicar este rollback restaura o defeito conhecido
-- "PLAN_REQUIRED ⇒ todos os itens como sob_consulta".
-- Use somente se a correção causar regressão pior.
--
-- Guarda de ambiente obrigatória.

DO $guard$
DECLARE
  v_marker text;
  v_ref    text;
  c_expected constant text := 'ikaauvsflpmamgxmkhoq';
  c_prod     constant text := 'navfzbwgwzruipouyfnk';
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente nao identificado (marker inexistente)';
  END IF;

  SELECT marker, project_ref INTO v_marker, v_ref
    FROM public._fiscal_staging_marker
   WHERE marker = 'STAGING'
   LIMIT 1;

  IF v_marker IS NULL THEN
    RAISE EXCEPTION 'GUARD_ABORT: nenhuma linha marker=STAGING';
  END IF;
  IF v_ref = c_prod THEN
    RAISE EXCEPTION 'GUARD_ABORT: ambiente de PRODUCAO (%) — execucao proibida', c_prod;
  END IF;
  IF v_ref IS DISTINCT FROM c_expected THEN
    RAISE EXCEPTION 'GUARD_ABORT: project_ref % difere do staging autorizado %',
      coalesce(v_ref,'<null>'), c_expected;
  END IF;
  IF EXISTS (SELECT 1 FROM public._fiscal_staging_marker WHERE project_ref = c_prod) THEN
    RAISE EXCEPTION 'GUARD_ABORT: marker contem ref de PRODUCAO';
  END IF;
END
$guard$;

-- 1) A função helper fn_b2b_resolve_base_unit_price pode permanecer:
--    ela é STABLE, SECURITY DEFINER, sem grants para anon/authenticated,
--    e não é referenciada por nenhum caminho de escrita.
--    Remoção opcional (somente se nenhum outro objeto depender dela):
-- DROP FUNCTION IF EXISTS public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date);

-- 2) Para reverter get_partner_catalog_secure, reaplique a definição anterior
--    a partir do histórico de migrations (versão que chamava
--    fn_resolve_commercial_price com p_plan_id => NULL).
--    Nenhum GRANT deve ser adicionado no rollback.

-- 3) Pós-condição: nenhum GRANT para PUBLIC/anon/authenticated em funções B2B.
DO $post$
DECLARE v_leak int;
BEGIN
  SELECT count(*) INTO v_leak
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_b2b_resolve_base_unit_price','fn_resolve_commercial_price','fn_b2b_plan_selectable')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF v_leak > 0 THEN
    RAISE EXCEPTION 'ABORT: rollback reabriria % permissao(oes) sensivel(is)', v_leak;
  END IF;
END
$post$;
