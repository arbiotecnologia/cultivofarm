-- =====================================================================
-- Fase SINIEF 4.0.1 — TEMPLATE PARAMETRIZADO DE FIXTURES DE DOMÍNIO
-- (STAGING AR-Bio-TEMP APENAS)
--
-- Este arquivo é um TEMPLATE psql. Os UUIDs dos usuários sintéticos são
-- criados PELO RUNNER (`runner/run-staging.ts`) via auth.admin.createUser
-- e injetados como variáveis psql `\set`. NENHUM `INSERT INTO auth.users`
-- vive aqui — o runner é a única fonte de identidades sintéticas.
--
-- Variáveis obrigatórias (definidas pelo runner):
--   :'u_admin', :'u_fin', :'u_gestor', :'u_adm', :'u_prod', :'u_none'
--   :'seed_user_id'  → mesmo :u_admin (usado como created_by nos SEEDs)
--
-- Guardas anti-produção + marker obrigatórios antes de qualquer INSERT.
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

-- === Guard fail-fast ==================================================
DO $guard$
DECLARE
  v_project_ref text;
  v_prod_ref    constant text := 'navfzbwgwzruipouyfnk';
  v_expected    constant text := 'ikaauvsflpmamgxmkhoq';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker) THEN
    RAISE EXCEPTION 'ABORT[fixtures]: marker _fiscal_staging_marker ausente';
  END IF;
  SELECT project_ref INTO v_project_ref
    FROM public._fiscal_staging_marker WHERE marker='STAGING';
  IF v_project_ref = v_prod_ref THEN
    RAISE EXCEPTION 'ABORT[fixtures]: project_ref aponta PRODUÇÃO';
  END IF;
  IF v_project_ref IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'ABORT[fixtures]: project_ref=% ≠ %', v_project_ref, v_expected;
  END IF;
  IF current_setting('server_version_num')::int < 130000 THEN
    RAISE EXCEPTION 'ABORT[fixtures]: Postgres < 13';
  END IF;
END
$guard$;

-- === user_roles (papéis atribuídos aos usuários criados pelo runner) ==
-- Fonte canônica de papéis. Runner cria auth.users antes; template só
-- amarra papel×user_id via user_roles (nunca escreve em profiles).
INSERT INTO public.user_roles (user_id, role) VALUES
  (:'u_admin'::uuid,  'administrador'),
  (:'u_fin'::uuid,    'financeiro'),
  (:'u_gestor'::uuid, 'gestor'),
  (:'u_adm'::uuid,    'administrativo'),
  (:'u_prod'::uuid,   'cliente_produtor')
ON CONFLICT (user_id, role) DO NOTHING;
-- :u_none permanece SEM papel (baseline no-role).

-- === Invoice fixture-alvo (payload completo, campos NOT NULL) =========
-- Requisitos schema fase 2:
--   invoice_type NOT NULL (NFE|NFSE|NFCE|OUTRO)
--   status       NOT NULL DEFAULT 'PENDING' CHECK IN (PENDING|ISSUED|CANCELED|ERROR)
--   created_by   uuid NOT NULL
INSERT INTO public.fiscal_invoices
  (id, invoice_type, status, created_by,
   direction, fiscal_operation_type,
   legal_basis, legal_version, tax_authority_notes)
VALUES
  ('00000000-0000-4000-8000-000000000f01',
   'NFE', 'PENDING', :'seed_user_id'::uuid,
   'OUT', 'NORMAL',
   'FIXTURE sinief49-fx', 'FIXTURE', 'sinief49-fx-target')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_items
  (id, fiscal_invoice_id, item_sequence, item_kind, description)
VALUES
  ('00000000-0000-4000-8000-000000000f11',
   '00000000-0000-4000-8000-000000000f01',
   1, 'PRODUCT', 'FIXTURE sinief49-fx target-item')
ON CONFLICT (id) DO NOTHING;

COMMIT;
