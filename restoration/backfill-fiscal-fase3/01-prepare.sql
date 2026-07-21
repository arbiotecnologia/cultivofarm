-- Fase Fiscal 3.0.1 — 01-prepare.sql
-- Cria marker anti-produção e fixtures em TABELAS REAIS public.*
-- SÓ EXECUTAR EM BANCO ISOLADO. Guard rejeita qualquer URL com o ref real.
SET search_path = public;

-- Marker obrigatório para o runner e para o guard SQL.
CREATE TABLE IF NOT EXISTS public._fiscal_staging_marker (marker text PRIMARY KEY);
INSERT INTO public._fiscal_staging_marker(marker) VALUES ('STAGING')
  ON CONFLICT DO NOTHING;

-- Guard: aborta se o banco parece produção (heurística por ref no current_database).
DO $$
BEGIN
  IF current_database() ILIKE '%navfzbwgwzruipouyfnk%' THEN
    RAISE EXCEPTION 'ABORT: banco parece PRODUÇÃO';
  END IF;
END $$;

-- Fixtures — assume que as tabelas public.clientes, public.produtos,
-- public.entregas, public.accounts_receivable, public.financial_documents
-- e public.fiscal_invoices já existem (aplicar migrations base antes).

-- 4 clientes
INSERT INTO public.clientes (id, nome, cpf_cnpj)
VALUES
  ('11111111-1111-1111-1111-111111111111','Fazenda Alpha','11.111.111/0001-11'),
  ('22222222-2222-2222-2222-222222222222','Fazenda Beta','22.222.222/0001-22'),
  ('33333333-3333-3333-3333-333333333333','Distribuidor Gama','33.333.333/0001-33'),
  ('44444444-4444-4444-4444-444444444444','Cooperativa Delta','44.444.444/0001-44')
ON CONFLICT (id) DO NOTHING;

-- fiscal_invoices legadas cobrindo os casos exigidos
-- Colunas mínimas — ajuste conforme schema real no staging.
INSERT INTO public.fiscal_invoices
  (id, customer_id, invoice_type, status, series, invoice_number, access_key, receivable_id, delivery_id)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','NFE','PENDING','1',1001,NULL,NULL,NULL),
  ('aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','NFE','ISSUED','1',1002,'35240100000000000000550010000000011234567890',NULL,NULL),
  ('aaaaaaaa-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','NFE','CANCELED','1',1003,NULL,NULL,NULL),
  ('aaaaaaaa-0000-0000-0000-000000000004','44444444-4444-4444-4444-444444444444','NFE','ERROR','1',1004,NULL,NULL,NULL),
  ('aaaaaaaa-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','NFE','PENDING',NULL,NULL,NULL,NULL,NULL), -- sem número/série
  ('aaaaaaaa-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','NFSE','ISSUED','1',1,NULL,NULL,NULL),
  ('aaaaaaaa-0000-0000-0000-000000000007','22222222-2222-2222-2222-222222222222','NFE','ISSUED','1',2001,NULL,NULL,NULL), -- múltiplo mesma conta
  ('aaaaaaaa-0000-0000-0000-000000000008','22222222-2222-2222-2222-222222222222','NFE','ISSUED','1',2002,NULL,NULL,NULL),
  ('aaaaaaaa-0000-0000-0000-000000000009','33333333-3333-3333-3333-333333333333','NFE','ISSUED','1',3001,NULL,NULL,NULL), -- manual
  ('aaaaaaaa-0000-0000-0000-000000000010','44444444-4444-4444-4444-444444444444','NFE','ISSUED','1',4001,'35240100000000000000550010000000041234567890',NULL,NULL) -- externo
ON CONFLICT (id) DO NOTHING;
