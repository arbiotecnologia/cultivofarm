-- =====================================================================
-- PACOTE DE PROMOCAO MOTOR B2B — 099_rollback_forward_safe.sql
-- Contingência FORWARD-SAFE. Não apaga dados, não remove preços legítimos,
-- não reabre permissões, não desabilita triggers de proteção.
--
-- Ordem de contingência recomendada:
--   1. Se a falha ocorrer DURANTE o apply: nada a fazer — o apply roda com
--      psql --single-transaction; a transação inteira é revertida.
--   2. Se a falha for detectada APÓS o commit: aplicar este arquivo, que
--      apenas reverte comportamento de superfície (vitrine/estado) sem tocar
--      dados, e reavaliar.
--   3. Perda/corrupção de DADOS só é recuperável por PITR (confirmado no
--      preflight). Não há caminho de rollback de dados neste pacote.
-- =====================================================================

DO $rb$
DECLARE
  v_mode text := lower(nullif(trim(current_setting('promo.mode', true)), ''));
BEGIN
  IF v_mode IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: promo.mode não declarado (production|rehearsal)';
  END IF;
  IF nullif(trim(current_setting('promo.human_authorization', true)), '') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: autorização humana não declarada';
  END IF;
END
$rb$;

-- 1) Nenhum DROP é executado. As funções introduzidas (fn_b2b_*, gates de
--    status, trigger de recebível) são STABLE/SECURITY DEFINER sem grants para
--    anon/authenticated e não são referenciadas por caminhos de escrita legados.
--    Removê-las reabriria defeitos conhecidos (cobrança antes da aprovação,
--    transição livre de status). Por isso a contingência padrão é MANTÊ-LAS.

-- 2) Reversão opcional e pontual da vitrine (restaura o defeito conhecido
--    "PLAN_REQUIRED => todos os itens como sob consulta"). Só executar sob
--    decisão explícita: reaplicar a definição anterior de
--    public.get_partner_catalog_secure a partir do histórico de migrations.
--    Nenhum GRANT deve ser adicionado no rollback.

-- 3) Pós-condição obrigatória da contingência.
DO $post$
DECLARE v_leak int; v_off int;
BEGIN
  SELECT count(*) INTO v_leak
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('fn_b2b_resolve_base_unit_price','fn_resolve_commercial_price',
                       'fn_b2b_plan_selectable','create_partner_order_secure')
     AND (has_function_privilege('anon', p.oid, 'EXECUTE')
       OR has_function_privilege('public', p.oid, 'EXECUTE'));
  IF v_leak > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: contingência reabriria % permissão(ões) sensível(is)', v_leak;
  END IF;

  SELECT count(*) INTO v_off
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='public' AND NOT t.tgisinternal AND t.tgenabled='D';
  IF v_off > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: % trigger(s) desabilitado(s) — estado inseguro', v_off;
  END IF;

  RAISE NOTICE 'ROLLBACK_FORWARD_SAFE_OK';
END
$post$;
