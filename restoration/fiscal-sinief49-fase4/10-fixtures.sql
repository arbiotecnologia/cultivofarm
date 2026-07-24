-- =====================================================================
-- Fase SINIEF 4.0 — FIXTURES SINTÉTICAS DE PAPÉIS (STAGING ONLY)
--
-- NÃO EXECUTAR NESTE SANDBOX. Este arquivo é preparado para ser rodado
-- externamente contra o staging AR-Bio-TEMP (ref ikaauvsflpmamgxmkhoq),
-- via service_role, após 00-snapshot-pre.sql e a migration canônica.
--
-- Todos os UUIDs sintéticos usam o namespace/prefixo `sinief49-fx-*`
-- em metadata para permitir cleanup determinístico (99-cleanup.sql).
--
-- Papéis cobertos (app_role):
--   • administrador           → leitura + escrita nas 3 tabelas novas
--   • financeiro              → leitura + escrita
--   • gestor                  → leitura apenas
--   • administrativo          → leitura apenas
--   • cliente_produtor        → sem acesso
--   • (sem papel)             → sem acesso
--
-- Guardas anti-produção obrigatórias antes de qualquer INSERT.
-- =====================================================================

BEGIN;

-- === Guards inegociáveis =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public._fiscal_staging_marker
     WHERE marker='STAGING' AND project_ref='ikaauvsflpmamgxmkhoq'
  ) THEN
    RAISE EXCEPTION 'ABORT: marker _fiscal_staging_marker ausente/incompatível';
  END IF;

  IF current_setting('server_version_num')::int < 130000 THEN
    RAISE EXCEPTION 'ABORT: Postgres < 13 não suportado';
  END IF;
END $$;

-- === Fixtures de usuários sintéticos ==================================
-- Requisito: chamador é service_role. Emails com sufixo determinístico
-- @sinief49.fixture.local para permitir cleanup por LIKE.
--
-- Papéis são gravados em public.user_roles (fonte canônica, jamais em
-- profiles). has_role() usa essa tabela.

INSERT INTO auth.users (id, email, raw_user_meta_data, encrypted_password, created_at, updated_at, aud, role)
VALUES
  ('00000000-0000-4000-8000-00000000f101','admin.sinief49@sinief49.fixture.local', '{"fixture":"sinief49-fx-admin"}', '$fixture$', now(), now(), 'authenticated','authenticated'),
  ('00000000-0000-4000-8000-00000000f102','fin.sinief49@sinief49.fixture.local',   '{"fixture":"sinief49-fx-fin"}',   '$fixture$', now(), now(), 'authenticated','authenticated'),
  ('00000000-0000-4000-8000-00000000f103','gestor.sinief49@sinief49.fixture.local','{"fixture":"sinief49-fx-gestor"}','$fixture$', now(), now(), 'authenticated','authenticated'),
  ('00000000-0000-4000-8000-00000000f104','adm.sinief49@sinief49.fixture.local',   '{"fixture":"sinief49-fx-adm"}',   '$fixture$', now(), now(), 'authenticated','authenticated'),
  ('00000000-0000-4000-8000-00000000f105','prod.sinief49@sinief49.fixture.local',  '{"fixture":"sinief49-fx-prod"}',  '$fixture$', now(), now(), 'authenticated','authenticated'),
  ('00000000-0000-4000-8000-00000000f106','none.sinief49@sinief49.fixture.local',  '{"fixture":"sinief49-fx-none"}',  '$fixture$', now(), now(), 'authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-4000-8000-00000000f101','administrador'),
  ('00000000-0000-4000-8000-00000000f102','financeiro'),
  ('00000000-0000-4000-8000-00000000f103','gestor'),
  ('00000000-0000-4000-8000-00000000f104','administrativo'),
  ('00000000-0000-4000-8000-00000000f105','cliente_produtor')
ON CONFLICT (user_id, role) DO NOTHING;
-- f106 permanece SEM papel (baseline "no role").

-- === Invoice fixture-alvo para as três tabelas novas ==================
-- Reutiliza um único documento fantasma marcado com direction='OUT' e
-- fiscal_operation_type='NORMAL' para não colidir com invariantes.
INSERT INTO public.fiscal_invoices
  (id, status, direction, fiscal_operation_type, legal_basis, legal_version, tax_authority_notes)
VALUES
  ('00000000-0000-4000-8000-000000000f01','DRAFT','OUT','NORMAL',
   'FIXTURE sinief49-fx', 'FIXTURE', 'sinief49-fx-target')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_items (id, fiscal_invoice_id)
VALUES ('00000000-0000-4000-8000-000000000f11','00000000-0000-4000-8000-000000000f01')
ON CONFLICT (id) DO NOTHING;

COMMIT;
