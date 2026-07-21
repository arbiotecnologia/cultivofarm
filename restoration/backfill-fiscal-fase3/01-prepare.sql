-- Fase Fiscal 3.0 — schema isolado para backfill sintético.
-- NUNCA executar em produção. Uso: Docker local (postgres:15).

CREATE SCHEMA IF NOT EXISTS fiscal_test;
SET search_path = fiscal_test, public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Dependências mínimas para os fixtures. Não replica o schema completo do app;
-- apenas o suficiente para exercitar as FKs e uniqueness da Fase 2/2.1.

CREATE TABLE IF NOT EXISTS fiscal_test.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS fiscal_test.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text UNIQUE NOT NULL,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS fiscal_test.legacy_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_cnpj text NOT NULL,
  document_model text NOT NULL,
  series text NOT NULL,
  invoice_number int NOT NULL,
  environment text NOT NULL DEFAULT 'homologacao',
  customer_id uuid REFERENCES fiscal_test.customers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
