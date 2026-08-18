-- =====================================================================
-- H6d — POSTCHECK DE PARIDADE REPO x LIVE (H6c)
-- Staging ikaauvsflpmamgxmkhoq. Transacional: termina em ROLLBACK.
-- Reaplica as migrations CANONICAS dentro da transacao e prova que o
-- estado live e byte-identico ao que o repositorio reproduz.
--
-- Uso:
--   psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f 49-h6d-paridade-repo-live.sql
-- Requer execucao a partir da raiz do repositorio (caminhos \i relativos).
-- =====================================================================
\pset pager off
\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE h6d_fn_before AS
  SELECT proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND proname IN ('fn_entrega_valor_faturavel_v1','fn_b2b_order_billing_eligibility',
                     'fn_entrega_guard_faturamento_v1','generate_b2b_receivable_secure_impl',
                     'fn_h6c_entrega_ar_b2b_link','fn_h6c_set_canonical_payment_terms');

CREATE TEMP TABLE h6d_tg_before AS
  SELECT tgname, pg_get_triggerdef(oid) AS def
    FROM pg_trigger
   WHERE tgname IN ('trg_h6c_entrega_ar_b2b_link','trg_h6c_set_canonical_payment_terms')
     AND NOT tgisinternal;

CREATE TEMP TABLE h6d_link_before AS
  SELECT id, payment_terms_id FROM public.partner_orders;

-- Reaplicacao idempotente das migrations canonicas do repositorio.
\i supabase/migrations/20260917000000_h6c_financeiro_snapshot_b2b_credito.sql
-- A etapa 2 abre/fecha a propria transacao; aqui e executada linha a linha
-- pelo runner externo (49-h6d-paridade.sh) para preservar o ROLLBACK global.
\i /tmp/h6d/f2_notx.sql

WITH t AS (
  SELECT 'P1 as 6 funcoes H6c existem no live' AS teste,
         (SELECT count(*) FROM h6d_fn_before) = 6 AS ok
  UNION ALL SELECT 'P2 definicoes das funcoes: repo == live',
         NOT EXISTS (
           SELECT 1 FROM h6d_fn_before b
             JOIN (SELECT proname, pg_get_functiondef(p.oid) AS def
                     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public') a ON a.proname = b.proname
            WHERE a.def IS DISTINCT FROM b.def)
  UNION ALL SELECT 'P3 os 2 triggers H6c existem no live',
         (SELECT count(*) FROM h6d_tg_before) = 2
  UNION ALL SELECT 'P4 definicoes dos triggers: repo == live',
         NOT EXISTS (
           SELECT 1 FROM h6d_tg_before b JOIN pg_trigger t2 ON t2.tgname = b.tgname
            WHERE pg_get_triggerdef(t2.oid) IS DISTINCT FROM b.def)
  UNION ALL SELECT 'P5 backfill e no-op (nenhum vinculo alterado)',
         NOT EXISTS (
           SELECT 1 FROM h6d_link_before l JOIN public.partner_orders o ON o.id = l.id
            WHERE o.payment_terms_id IS DISTINCT FROM l.payment_terms_id)
  UNION ALL SELECT 'P6 nenhum pedido com termo unico sem vinculo canonico',
         NOT EXISTS (
           SELECT 1 FROM public.partner_order_payment_terms t3
             JOIN public.partner_orders o ON o.id = t3.partner_order_id
            WHERE o.payment_terms_id IS NULL
            GROUP BY t3.partner_order_id HAVING count(*) = 1)
)
SELECT CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS r, teste FROM t ORDER BY teste;

ROLLBACK;
