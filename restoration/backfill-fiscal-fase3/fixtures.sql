-- Fase Fiscal 3.0 — 12 registros sintéticos pré-migration.
-- Executar após 01-prepare.sql. NUNCA em produção.

SET search_path = fiscal_test, public;

-- 4 produtos legados
INSERT INTO fiscal_test.products (sku, name) VALUES
  ('SKU-001', 'Bioinseticida A'),
  ('SKU-002', 'Bioinseticida B'),
  ('SKU-003', 'Bionematicida C'),
  ('SKU-004', 'Biofertilizante D');

-- 4 clientes legados
INSERT INTO fiscal_test.customers (cnpj, name) VALUES
  ('11.111.111/0001-11', 'Fazenda Alpha'),
  ('22.222.222/0001-22', 'Fazenda Beta'),
  ('33.333.333/0001-33', 'Distribuidor Gama'),
  ('44.444.444/0001-44', 'Cooperativa Delta');

-- 4 invoices legadas (mesma série/número em ambientes diferentes — caso crítico
-- da uniqueness por environment introduzida na Fase 2.1)
INSERT INTO fiscal_test.legacy_invoices
  (company_cnpj, document_model, series, invoice_number, environment, customer_id)
SELECT
  '99.999.999/0001-99', '55', '1', 1001, 'homologacao', id
FROM fiscal_test.customers WHERE cnpj = '11.111.111/0001-11';

INSERT INTO fiscal_test.legacy_invoices
  (company_cnpj, document_model, series, invoice_number, environment, customer_id)
SELECT
  '99.999.999/0001-99', '55', '1', 1001, 'producao', id
FROM fiscal_test.customers WHERE cnpj = '22.222.222/0001-22';

INSERT INTO fiscal_test.legacy_invoices
  (company_cnpj, document_model, series, invoice_number, environment, customer_id)
SELECT
  '99.999.999/0001-99', '55', '1', 1002, 'homologacao', id
FROM fiscal_test.customers WHERE cnpj = '33.333.333/0001-33';

INSERT INTO fiscal_test.legacy_invoices
  (company_cnpj, document_model, series, invoice_number, environment, customer_id)
SELECT
  '99.999.999/0001-99', 'NFSe', '1', 1, 'producao', id
FROM fiscal_test.customers WHERE cnpj = '44.444.444/0001-44';
