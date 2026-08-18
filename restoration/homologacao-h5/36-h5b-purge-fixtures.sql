-- =====================================================================
-- H5b — PURGA DE FIXTURES DO HARNESS CONCORRENTE (prefixo H5B-)
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq. Produção RECUSADA.
-- Uso: bash restoration/os-e2e/staging-psql.sh -f restoration/homologacao-h5/36-h5b-purge-fixtures.sql
-- Desabilita gatilhos append-only APENAS dentro desta transação de manutenção.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente nao autorizado (%)', COALESCE(v_ref,'null');
  END IF;
END $guard$;

SELECT set_config('app.estoque_purge_fixture','on', true);
SELECT set_config('app.cq_purge_fixture','on', true);

ALTER TABLE public.estoque_movimentacoes DISABLE TRIGGER USER;
ALTER TABLE public.estoque_produto       DISABLE TRIGGER USER;
ALTER TABLE public.envase                DISABLE TRIGGER USER;
ALTER TABLE public.controle_qualidade    DISABLE TRIGGER USER;
ALTER TABLE public.lotes                 DISABLE TRIGGER USER;
ALTER TABLE public.ordens_servico        DISABLE TRIGGER USER;
ALTER TABLE public.programacao_producao  DISABLE TRIGGER USER;
ALTER TABLE public.production_order_link DISABLE TRIGGER USER;
ALTER TABLE public.production_planning   DISABLE TRIGGER USER;
ALTER TABLE public.production_timeline_events DISABLE TRIGGER USER;
ALTER TABLE public.partner_order_items   DISABLE TRIGGER USER;
ALTER TABLE public.partner_orders        DISABLE TRIGGER USER;
ALTER TABLE public.partner_accounts      DISABLE TRIGGER USER;

CREATE TEMP TABLE _h5b_orders ON COMMIT DROP AS
  SELECT id FROM public.partner_orders WHERE observacoes LIKE 'H5B-%';
CREATE TEMP TABLE _h5b_lotes ON COMMIT DROP AS
  SELECT id FROM public.lotes WHERE codigo_lote LIKE 'H5B-%';

DELETE FROM public.estoque_movimentacoes
 WHERE estoque_produto_id IN (SELECT id FROM public.estoque_produto WHERE lote_id IN (SELECT id FROM _h5b_lotes));
DELETE FROM public.estoque_produto    WHERE lote_id IN (SELECT id FROM _h5b_lotes);
DELETE FROM public.envase             WHERE lote_id IN (SELECT id FROM _h5b_lotes);
DELETE FROM public.controle_qualidade WHERE lote_id IN (SELECT id FROM _h5b_lotes);
DELETE FROM public.production_order_link WHERE partner_order_id IN (SELECT id FROM _h5b_orders);
DELETE FROM public.programacao_producao
 WHERE ordem_servico_id IN (SELECT id FROM public.ordens_servico
                             WHERE partner_order_id IN (SELECT id FROM _h5b_orders)
                                OR numero_os LIKE 'H5B-%');
DELETE FROM public.ordens_servico
 WHERE partner_order_id IN (SELECT id FROM _h5b_orders) OR numero_os LIKE 'H5B-%';
DELETE FROM public.lotes                 WHERE id IN (SELECT id FROM _h5b_lotes);
DELETE FROM public.production_planning   WHERE partner_order_id IN (SELECT id FROM _h5b_orders);
DELETE FROM public.production_timeline_events WHERE partner_order_id IN (SELECT id FROM _h5b_orders);
DELETE FROM public.partner_order_audit_logs   WHERE order_id IN (SELECT id FROM _h5b_orders);
DELETE FROM public.partner_order_items   WHERE order_id IN (SELECT id FROM _h5b_orders);
DELETE FROM public.partner_orders        WHERE id IN (SELECT id FROM _h5b_orders);
DELETE FROM public.partner_accounts      WHERE nome_fantasia LIKE 'H5B-%';

ALTER TABLE public.estoque_movimentacoes ENABLE TRIGGER USER;
ALTER TABLE public.estoque_produto       ENABLE TRIGGER USER;
ALTER TABLE public.envase                ENABLE TRIGGER USER;
ALTER TABLE public.controle_qualidade    ENABLE TRIGGER USER;
ALTER TABLE public.lotes                 ENABLE TRIGGER USER;
ALTER TABLE public.ordens_servico        ENABLE TRIGGER USER;
ALTER TABLE public.programacao_producao  ENABLE TRIGGER USER;
ALTER TABLE public.production_order_link ENABLE TRIGGER USER;
ALTER TABLE public.production_planning   ENABLE TRIGGER USER;
ALTER TABLE public.production_timeline_events ENABLE TRIGGER USER;
ALTER TABLE public.partner_order_items   ENABLE TRIGGER USER;
ALTER TABLE public.partner_orders        ENABLE TRIGGER USER;
ALTER TABLE public.partner_accounts      ENABLE TRIGGER USER;

DO $check$
DECLARE v_n int;
BEGIN
  SELECT (SELECT count(*) FROM public.partner_accounts WHERE nome_fantasia LIKE 'H5B-%')
       + (SELECT count(*) FROM public.partner_orders   WHERE observacoes  LIKE 'H5B-%')
       + (SELECT count(*) FROM public.lotes            WHERE codigo_lote  LIKE 'H5B-%')
       + (SELECT count(*) FROM public.ordens_servico   WHERE numero_os    LIKE 'H5B-%')
       + (SELECT count(*) FROM public.controle_qualidade WHERE responsavel LIKE 'H5B-%')
       + (SELECT count(*) FROM public.envase           WHERE operador     LIKE 'H5B-%')
    INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'H5B_RESIDUO: % linhas remanescentes', v_n; END IF;
  RAISE NOTICE 'PASS_H5B_PURGE: zero residuos';
END $check$;

COMMIT;
