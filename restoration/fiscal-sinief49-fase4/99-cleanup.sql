-- =====================================================================
-- Fase SINIEF 4.0.2.1 — CLEANUP DETERMINISTICO (STAGING AR-Bio-TEMP)
-- Ordem REVERSA de setup:
--   dependencias fiscais -> dominio fiscal -> user_roles (inclui prod)
--   -> user_clientes -> clientes -> (auth.users pelo runner via
--   auth.admin.deleteUser).
-- Este script NAO toca auth.users.
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Guard fail-fast.
DO $guard$
DECLARE
  v_project_ref text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker) THEN
    RAISE EXCEPTION 'ABORT[cleanup]: marker ausente';
  END IF;
  SELECT project_ref INTO v_project_ref
    FROM public._fiscal_staging_marker WHERE marker='STAGING';
  IF v_project_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT[cleanup]: PRODUÇÃO detectada';
  END IF;
  IF v_project_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ABORT[cleanup]: project_ref=% ≠ staging esperado', v_project_ref;
  END IF;
END
$guard$;

-- 1) Dependências (item_references, references, stock_loss_contexts).
DELETE FROM public.fiscal_invoice_item_references
 WHERE fiscal_invoice_item_id IN (
   SELECT id FROM public.fiscal_invoice_items
    WHERE fiscal_invoice_id IN (
      SELECT id FROM public.fiscal_invoices
       WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
          OR id::text LIKE '00000000-0000-4000-8000-0000000000%'
    )
 );

DELETE FROM public.fiscal_invoice_references
 WHERE fiscal_invoice_id IN (
   SELECT id FROM public.fiscal_invoices
    WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
       OR id::text LIKE '00000000-0000-4000-8000-0000000000%'
 );

DELETE FROM public.fiscal_stock_loss_contexts
 WHERE fiscal_invoice_id IN (
   SELECT id FROM public.fiscal_invoices
    WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
 );

-- 2) Dados de domínio (items → invoices).
DELETE FROM public.fiscal_invoice_items
 WHERE fiscal_invoice_id IN (
   SELECT id FROM public.fiscal_invoices
    WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
       OR id::text LIKE '00000000-0000-4000-8000-0000000000%'
 );

DELETE FROM public.fiscal_invoices
 WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%'
    OR id::text LIKE '00000000-0000-4000-8000-0000000000%';

-- 3) Papeis dos usuarios sinteticos criados pelo runner — SEMPRE ANTES
--    de user_clientes/clientes para respeitar a ordem reversa de setup.
DO $roles_cleanup$
DECLARE
  v_uses_temp boolean;
BEGIN
  SELECT to_regclass('pg_temp._sinief49_fx_users') IS NOT NULL INTO v_uses_temp;
  IF v_uses_temp THEN
    DELETE FROM public.user_roles
     WHERE user_id IN (SELECT user_id FROM pg_temp._sinief49_fx_users);
  ELSE
    DELETE FROM public.user_roles
     WHERE user_id IN (
       SELECT id FROM auth.users
        WHERE email LIKE '%@sinief49.fixture.local'
     );
  END IF;
END
$roles_cleanup$;

-- 4) Vinculos cliente_produtor: user_clientes (FK -> clientes) primeiro,
--    depois clientes. Auth users sao removidos pelo runner via SDK.
DO $prod_cleanup$
DECLARE
  v_uses_temp boolean;
BEGIN
  SELECT to_regclass('pg_temp._sinief49_fx_users') IS NOT NULL INTO v_uses_temp;
  IF v_uses_temp THEN
    DELETE FROM public.user_clientes
     WHERE user_id IN (SELECT user_id FROM pg_temp._sinief49_fx_users);
  END IF;
  DELETE FROM public.clientes
   WHERE nome LIKE 'FIXTURE sinief49-fx%'
      OR observacoes LIKE 'FIXTURE sinief49-fx%';
END
$prod_cleanup$;

-- 4) Confirmação: zero fixture residual nas 3 novas tabelas + fiscal_invoices.
DO $verify$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left FROM public.fiscal_invoices
   WHERE tax_authority_notes LIKE 'FIXTURE sinief49-fx%';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'ABORT[cleanup]: % fixture residual em fiscal_invoices', v_left;
  END IF;

  SELECT count(*) INTO v_left FROM public.fiscal_invoice_references
   WHERE notes LIKE 'FIXTURE sinief49-fx%';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'ABORT[cleanup]: fixture residual em fiscal_invoice_references';
  END IF;

  SELECT count(*) INTO v_left FROM public.fiscal_stock_loss_contexts
   WHERE legal_reason_details LIKE 'FIXTURE sinief49-fx%';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'ABORT[cleanup]: fixture residual em fiscal_stock_loss_contexts';
  END IF;

  SELECT count(*) INTO v_left FROM public.clientes
   WHERE nome LIKE 'FIXTURE sinief49-fx%' OR observacoes LIKE 'FIXTURE sinief49-fx%';
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'ABORT[cleanup]: fixture residual em clientes';
  END IF;
END
$verify$;

COMMIT;
