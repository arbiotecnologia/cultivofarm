-- ENTREGA 2 harness sintético (PostgreSQL descartável; NÃO é Auth/JWT/RLS real).
-- Reproduz os corpos baseline dos helpers escalares em schema mínimo (paridade
-- de colunas com live), aplica a candidata e prova os comportamentos.
\set ON_ERROR_STOP on
BEGIN;

CREATE SCHEMA lab;
CREATE TABLE lab.partner_accounts(id uuid, ativo boolean, deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TABLE lab.partner_users(user_id uuid, partner_id uuid, papel text, tenant_id uuid, revoked_at timestamptz);

-- auth.uid() sintético via GUC de laboratório
CREATE FUNCTION lab.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('lab.actor', true),'')::uuid $$;

-- ===== Baseline (espelho dos corpos hospedados) =====
CREATE FUNCTION lab.get_user_partner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'lab' AS
$$ SELECT partner_id FROM lab.partner_users WHERE user_id = lab.uid() LIMIT 1 $$;
CREATE FUNCTION lab.get_partner_papel(_user_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'lab' AS
$$ SELECT papel FROM lab.partner_users WHERE user_id = _user_id LIMIT 1 $$;

-- Fixtures
INSERT INTO lab.partner_accounts VALUES
  ('a0000000-0000-4000-8000-0000000000a1', true, NULL, 'a0000000-0000-4000-8000-0000000000aa'), -- parceiro A ok
  ('a0000000-0000-4000-8000-0000000000b1', true, NULL, NULL),                                     -- owner NULL
  ('a0000000-0000-4000-8000-0000000000c1', false, NULL, 'a0000000-0000-4000-8000-0000000000aa');-- inativo
INSERT INTO lab.partner_users VALUES
  ('10000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-0000000000a1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL),  -- U1 elegível
  ('10000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-0000000000a1','gestor','a0000000-0000-4000-8000-0000000000aa',now()),-- U2 revogado
  ('10000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-0000000000b1','gestor',NULL,NULL),                                    -- U3 owner NULL
  ('10000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-0000000000c1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL),  -- U4 parceiro inativo
  ('10000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-0000000000a1','tecnico','a0000000-0000-4000-8000-0000000000bb',NULL), -- U5 tenant divergente
  ('10000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-0000000000a1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL),  -- U6 multi-vínculo (1/2)
  ('10000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-0000000000a1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL);  -- U6 multi-vínculo (2/2)

-- ===== FASE 1: brechas no baseline =====
DO $$
BEGIN
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000002',true);
  ASSERT lab.get_user_partner_id() IS NOT NULL, 'baseline: revogado ainda resolve parceiro (brecha)';
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000003',true);
  ASSERT lab.get_user_partner_id() IS NOT NULL, 'baseline: owner NULL ainda resolve (brecha)';
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000004',true);
  ASSERT lab.get_user_partner_id() IS NOT NULL, 'baseline: parceiro inativo ainda resolve (brecha)';
  ASSERT lab.get_partner_papel('10000000-0000-4000-8000-000000000002') = 'gestor', 'baseline: papel de revogado ainda resolve (brecha)';
  RAISE NOTICE 'PASS fase1: brechas reproduzidas no baseline';
END $$;

-- ===== FASE 2: aplica a candidata (CREATE OR REPLACE, mesmos corpos do SQL real, schema lab) =====
CREATE OR REPLACE FUNCTION lab.get_user_partner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'lab' AS
$$ SELECT CASE WHEN count(*) = 1 THEN min(pu.partner_id) END FROM lab.partner_users pu
   JOIN lab.partner_accounts pa ON pa.id = pu.partner_id
   WHERE pu.user_id = lab.uid()
     AND pu.revoked_at IS NULL
     AND pa.ativo = true AND pa.deleted_at IS NULL
     AND pa.commercial_owner_organization_id IS NOT NULL
     AND pu.tenant_id IS NOT NULL
     AND pu.tenant_id = pa.commercial_owner_organization_id $$;
CREATE OR REPLACE FUNCTION lab.get_partner_papel(_user_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'lab' AS
$$ SELECT CASE WHEN count(*) = 1 THEN min(pu.papel) END FROM lab.partner_users pu
   JOIN lab.partner_accounts pa ON pa.id = pu.partner_id
   WHERE pu.user_id = _user_id
     AND pu.revoked_at IS NULL
     AND pa.ativo = true AND pa.deleted_at IS NULL
     AND pa.commercial_owner_organization_id IS NOT NULL
     AND pu.tenant_id IS NOT NULL
     AND pu.tenant_id = pa.commercial_owner_organization_id $$;

-- ===== FASE 3: endurecido =====
DO $$
BEGIN
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000001',true);
  ASSERT lab.get_user_partner_id() = 'a0000000-0000-4000-8000-0000000000a1', 'U1 elegível deve resolver';
  ASSERT lab.get_partner_papel('10000000-0000-4000-8000-000000000001') = 'gestor', 'U1 papel deve resolver';
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000002',true);
  ASSERT lab.get_user_partner_id() IS NULL, 'U2 revogado deve falhar fechado';
  ASSERT lab.get_partner_papel('10000000-0000-4000-8000-000000000002') IS NULL, 'U2 papel revogado deve falhar fechado';
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000003',true);
  ASSERT lab.get_user_partner_id() IS NULL, 'U3 owner NULL deve falhar fechado';
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000004',true);
  ASSERT lab.get_user_partner_id() IS NULL, 'U4 parceiro inativo deve falhar fechado';
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000005',true);
  ASSERT lab.get_user_partner_id() IS NULL, 'U5 tenant divergente deve falhar fechado';
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000006',true);
  ASSERT lab.get_user_partner_id() IS NULL, 'U6 multi-vínculo deve falhar fechado (nunca LIMIT 1 aleatório)';
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-0000000000ff',true);
  ASSERT lab.get_user_partner_id() IS NULL, 'usuário sem vínculo deve falhar fechado';
  RAISE NOTICE 'PASS fase3: helpers endurecidos fail-closed';
END $$;

-- ===== FASE 4: revogação dinâmica =====
DO $$
BEGIN
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000001',true);
  UPDATE lab.partner_users SET revoked_at = now() WHERE user_id = '10000000-0000-4000-8000-000000000001';
  ASSERT lab.get_user_partner_id() IS NULL, 'revogação deve fechar imediatamente';
  UPDATE lab.partner_users SET revoked_at = NULL WHERE user_id = '10000000-0000-4000-8000-000000000001';
  ASSERT lab.get_user_partner_id() = 'a0000000-0000-4000-8000-0000000000a1', 'restauração deve reabrir';
  RAISE NOTICE 'PASS fase4: revogação dinâmica respeitada';
END $$;

ROLLBACK;
