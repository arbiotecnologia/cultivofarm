-- Fase Fiscal 3.0.2-C — 01-prepare.sql
-- Cria fixtures em tabelas REAIS public.* usando o schema efetivo:
--   fiscal_invoices REQUER created_by (uuid) e invoice_type (text). NÃO existe customer_id.
--   Ownership do cliente_produtor é derivada por receivable_id -> accounts_receivable.customer_id.
--
-- ATENÇÃO: SÓ EXECUTAR EM BANCO ISOLADO. Guard rejeita ref principal.
-- Requisitos ANTES desta execução (README):
--   1) Migrations base já aplicadas.
--   2) Usuário sintético de harness criado via service_role em auth.users e passado como
--      psql var `-v harness_user_id='<uuid>'`.
--   3) Marker `_fiscal_staging_marker` inserido com project_ref='<ref-do-staging>'.

\set ON_ERROR_STOP on
SET search_path = public;

-- --------------------------------------------------------------------
-- Guard: marker obrigatório + project_ref consistente.
-- --------------------------------------------------------------------
DO $$
DECLARE v_marker text; v_ref text;
BEGIN
  IF current_database() ILIKE '%navfzbwgwzruipouyfnk%' THEN
    RAISE EXCEPTION 'ABORT: banco parece PRODUÇÃO';
  END IF;
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker LIMIT 1;
  IF v_marker IS DISTINCT FROM 'STAGING' THEN
    RAISE EXCEPTION 'ABORT: marker _fiscal_staging_marker ausente ou <> STAGING';
  END IF;
  IF v_ref IS NULL OR v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT: project_ref inválido (%)', v_ref;
  END IF;
END $$;

-- --------------------------------------------------------------------
-- Registra baseline em schema isolado para 04-verify.
-- --------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS fiscal_backfill_audit;
CREATE TABLE IF NOT EXISTS fiscal_backfill_audit.fixture_ids (
  entity text primary key,
  id     uuid  not null,
  meta   jsonb not null default '{}'::jsonb
);

-- --------------------------------------------------------------------
-- Fixtures: clientes A/B, contas receber e 10 fiscal_invoices legadas.
-- --------------------------------------------------------------------
INSERT INTO public.clientes (id, nome, cpf_cnpj)
VALUES
  ('c1111111-1111-1111-1111-111111111111','[HARNESS] Fazenda Alpha','11.111.111/0001-11'),
  ('c2222222-2222-2222-2222-222222222222','[HARNESS] Fazenda Beta','22.222.222/0001-22'),
  ('c3333333-3333-3333-3333-333333333333','[HARNESS] Distribuidor Gama','33.333.333/0001-33'),
  ('c4444444-4444-4444-4444-444444444444','[HARNESS] Cooperativa Delta','44.444.444/0001-44')
ON CONFLICT (id) DO NOTHING;

-- accounts_receivable ancoram ownership: fiscal_invoices.receivable_id -> AR.customer_id
INSERT INTO public.accounts_receivable (id, customer_id, amount, status)
VALUES
  ('a1111111-0000-0000-0000-000000000001','c1111111-1111-1111-1111-111111111111', 100.00, 'PENDING'),
  ('a2222222-0000-0000-0000-000000000002','c2222222-2222-2222-2222-222222222222', 200.00, 'PENDING'),
  ('a3333333-0000-0000-0000-000000000003','c3333333-3333-3333-3333-333333333333', 300.00, 'PENDING'),
  ('a4444444-0000-0000-0000-000000000004','c4444444-4444-4444-4444-444444444444', 400.00, 'PENDING')
ON CONFLICT (id) DO NOTHING;

-- 10 fiscal_invoices legadas: PENDING/ISSUED/CANCELED/ERROR; c/s access_key; c/s número/série;
-- múltiplos por cliente; NFE e NFSE; manual e externo.
INSERT INTO public.fiscal_invoices
  (id, created_by, invoice_type, status, series, invoice_number, access_key, receivable_id)
VALUES
  ('f0000001-0000-0000-0000-000000000001', :'harness_user_id'::uuid, 'NFE','PENDING', '1', 1001, NULL, 'a1111111-0000-0000-0000-000000000001'),
  ('f0000002-0000-0000-0000-000000000002', :'harness_user_id'::uuid, 'NFE','ISSUED',  '1', 1002, '35240100000000000000550010000000011234567890', 'a2222222-0000-0000-0000-000000000002'),
  ('f0000003-0000-0000-0000-000000000003', :'harness_user_id'::uuid, 'NFE','CANCELED','1', 1003, NULL, 'a3333333-0000-0000-0000-000000000003'),
  ('f0000004-0000-0000-0000-000000000004', :'harness_user_id'::uuid, 'NFE','ERROR',   '1', 1004, NULL, 'a4444444-0000-0000-0000-000000000004'),
  ('f0000005-0000-0000-0000-000000000005', :'harness_user_id'::uuid, 'NFE','PENDING', NULL, NULL, NULL, 'a1111111-0000-0000-0000-000000000001'),
  ('f0000006-0000-0000-0000-000000000006', :'harness_user_id'::uuid, 'NFSE','ISSUED', '1', 1,    NULL, 'a1111111-0000-0000-0000-000000000001'),
  ('f0000007-0000-0000-0000-000000000007', :'harness_user_id'::uuid, 'NFE','ISSUED',  '1', 2001, NULL, 'a2222222-0000-0000-0000-000000000002'),
  ('f0000008-0000-0000-0000-000000000008', :'harness_user_id'::uuid, 'NFE','ISSUED',  '1', 2002, NULL, 'a2222222-0000-0000-0000-000000000002'),
  ('f0000009-0000-0000-0000-000000000009', :'harness_user_id'::uuid, 'NFE','ISSUED',  '1', 3001, NULL, 'a3333333-0000-0000-0000-000000000003'),
  ('f0000010-0000-0000-0000-000000000010', :'harness_user_id'::uuid, 'NFE','ISSUED',  '1', 4001, '35240100000000000000550010000000041234567890', 'a4444444-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- Registro de UUIDs para 04-verify comparar por identidade e não só contagem.
INSERT INTO fiscal_backfill_audit.fixture_ids (entity, id) VALUES
  ('cliente_A', 'c1111111-1111-1111-1111-111111111111'),
  ('cliente_B', 'c2222222-2222-2222-2222-222222222222'),
  ('ar_A',      'a1111111-0000-0000-0000-000000000001'),
  ('ar_B',      'a2222222-0000-0000-0000-000000000002'),
  ('invoice_pending',  'f0000001-0000-0000-0000-000000000001'),
  ('invoice_issued',   'f0000002-0000-0000-0000-000000000002'),
  ('invoice_canceled', 'f0000003-0000-0000-0000-000000000003'),
  ('invoice_error',    'f0000004-0000-0000-0000-000000000004'),
  ('invoice_no_serie', 'f0000005-0000-0000-0000-000000000005'),
  ('invoice_nfse',     'f0000006-0000-0000-0000-000000000006'),
  ('invoice_multi_1',  'f0000007-0000-0000-0000-000000000007'),
  ('invoice_multi_2',  'f0000008-0000-0000-0000-000000000008'),
  ('invoice_manual',   'f0000009-0000-0000-0000-000000000009'),
  ('invoice_external', 'f0000010-0000-0000-0000-000000000010')
ON CONFLICT (entity) DO NOTHING;
