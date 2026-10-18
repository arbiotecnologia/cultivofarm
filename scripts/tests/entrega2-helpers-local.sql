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
$$ SELECT CASE WHEN count(*) = 1 THEN (array_agg(pu.partner_id))[1] END FROM lab.partner_users pu
   JOIN lab.partner_accounts pa ON pa.id = pu.partner_id
   WHERE pu.user_id = lab.uid()
     AND pu.revoked_at IS NULL
     AND pa.ativo = true AND pa.deleted_at IS NULL
     AND pa.commercial_owner_organization_id IS NOT NULL
     AND pu.tenant_id IS NOT NULL
     AND pu.tenant_id = pa.commercial_owner_organization_id $$;
CREATE OR REPLACE FUNCTION lab.get_partner_papel(_user_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'lab' AS
$$ SELECT CASE WHEN count(*) = 1 THEN (array_agg(pu.papel))[1] END FROM lab.partner_users pu
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

-- ===== FASE 5: réplica laboratorial de b2b_commercial_context() (rev 2.1) =====
-- Dependências mínimas stubadas: user_roles, organizations, entitlements,
-- platform_actor_access_ready, h15_actor_organization, b2b_phase1_partner_visible.
CREATE TABLE lab.user_roles(user_id uuid, role text);
CREATE TABLE lab.organizations(id uuid, partner_account_id uuid, ativo boolean, status text);
CREATE TABLE lab.entitlements(user_id uuid, feature_key text);
CREATE FUNCTION lab.actor_ready(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION lab.actor_org() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('lab.actor_org', true),'')::uuid $$;
CREATE FUNCTION lab.phase1_visible(uuid, boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;

-- Corpo espelho da candidata rev 2.1 (com stubs no lugar das funções privadas).
CREATE FUNCTION lab.b2b_commercial_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS
$ctx$
DECLARE u uuid:=lab.uid(); org uuid; role_name text; link record; owner uuid; legacy uuid; mode text;
BEGIN
 IF u IS NULL OR NOT lab.actor_ready(u) THEN RETURN NULL; END IF;
 org:=lab.actor_org();
 IF org IS NULL OR (SELECT count(*) FROM lab.user_roles r WHERE r.user_id=u)<>1 THEN RETURN NULL; END IF;
 SELECT r.role::text INTO role_name FROM lab.user_roles r WHERE r.user_id=u;
 IF role_name NOT IN ('parceiro_b2b','parceiro_b2b_tecnico') THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM lab.partner_users pu WHERE pu.user_id=u AND pu.revoked_at IS NULL)<>1 THEN RETURN NULL; END IF;
 SELECT pu.partner_id,pu.papel,pu.tenant_id INTO link FROM lab.partner_users pu WHERE pu.user_id=u AND pu.revoked_at IS NULL;
 IF link.papel IS DISTINCT FROM (CASE WHEN role_name='parceiro_b2b_tecnico' THEN 'tecnico' ELSE 'gestor' END) THEN RETURN NULL; END IF;
 SELECT pa.commercial_owner_organization_id INTO owner FROM lab.partner_accounts pa
 WHERE pa.id=link.partner_id AND pa.ativo IS TRUE AND pa.deleted_at IS NULL;
 IF owner IS NULL THEN RETURN NULL; END IF;
 IF link.tenant_id IS NULL OR link.tenant_id IS DISTINCT FROM owner THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM lab.entitlements e WHERE e.user_id=u AND e.feature_key='catalogo_precos') THEN RETURN NULL; END IF;
 SELECT o.partner_account_id INTO legacy FROM lab.organizations o WHERE o.id=org AND o.ativo IS TRUE AND o.status='ativa';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF owner=org THEN
   IF legacy IS NOT NULL AND legacy IS DISTINCT FROM link.partner_id THEN RETURN NULL; END IF;
   mode:='commercial_owner';
 ELSIF legacy=link.partner_id AND COALESCE(lab.phase1_visible(link.partner_id,true),false) THEN
   mode:='legacy_partner_tenant';
 ELSE RETURN NULL;
 END IF;
 RETURN jsonb_build_object('partner_id',link.partner_id,'organization_id',org,
   'commercial_owner_organization_id',owner,'role',role_name,'papel',link.papel,'mode',mode);
END $ctx$;

-- Fixtures de contexto: U1 gestor elegível (parceiro A, owner aa).
INSERT INTO lab.user_roles VALUES ('10000000-0000-4000-8000-000000000001','parceiro_b2b');
INSERT INTO lab.entitlements VALUES ('10000000-0000-4000-8000-000000000001','catalogo_precos');
-- Org do ator = owner (modo commercial_owner) e org legada distinta (modo legacy_partner_tenant).
INSERT INTO lab.organizations VALUES
  ('a0000000-0000-4000-8000-0000000000aa', NULL, true, 'ativa'),
  ('a0000000-0000-4000-8000-0000000000cc', 'a0000000-0000-4000-8000-0000000000a1', true, 'ativa');

DO $$
DECLARE c jsonb;
BEGIN
  -- 5.1 commercial_owner: org do ator = owner
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('lab.actor_org','a0000000-0000-4000-8000-0000000000aa',true);
  c := lab.b2b_commercial_context();
  ASSERT c->>'mode' = 'commercial_owner', '5.1 modo commercial_owner esperado';

  -- 5.2 legacy_partner_tenant REAL: org do ator (cc) != owner (aa), org legada ao parceiro
  PERFORM set_config('lab.actor_org','a0000000-0000-4000-8000-0000000000cc',true);
  c := lab.b2b_commercial_context();
  ASSERT c->>'mode' = 'legacy_partner_tenant', '5.2 modo legacy_partner_tenant esperado (owner diverge da org do ator)';
  ASSERT c->>'commercial_owner_organization_id' = 'a0000000-0000-4000-8000-0000000000aa', '5.2 owner comercial preservado';

  -- 5.3 tenant mismatch: vínculo com tenant_id divergente do owner => NULL (lacuna fechada)
  UPDATE lab.partner_users SET tenant_id='a0000000-0000-4000-8000-0000000000dd'
    WHERE user_id='10000000-0000-4000-8000-000000000001';
  ASSERT lab.b2b_commercial_context() IS NULL, '5.3 tenant mismatch deve falhar fechado';
  UPDATE lab.partner_users SET tenant_id='a0000000-0000-4000-8000-0000000000aa'
    WHERE user_id='10000000-0000-4000-8000-000000000001';

  -- 5.4 tenant NULL no vínculo => NULL
  UPDATE lab.partner_users SET tenant_id=NULL WHERE user_id='10000000-0000-4000-8000-000000000001';
  ASSERT lab.b2b_commercial_context() IS NULL, '5.4 tenant NULL deve falhar fechado';
  UPDATE lab.partner_users SET tenant_id='a0000000-0000-4000-8000-0000000000aa'
    WHERE user_id='10000000-0000-4000-8000-000000000001';

  -- 5.5 owner NULL (parceiro b1) => NULL mesmo com vínculo não revogado
  UPDATE lab.partner_users SET partner_id='a0000000-0000-4000-8000-0000000000b1'
    WHERE user_id='10000000-0000-4000-8000-000000000001';
  ASSERT lab.b2b_commercial_context() IS NULL, '5.5 owner NULL deve falhar fechado';
  UPDATE lab.partner_users SET partner_id='a0000000-0000-4000-8000-0000000000a1'
    WHERE user_id='10000000-0000-4000-8000-000000000001';

  -- 5.6 revogado => NULL (contagem 0)
  UPDATE lab.partner_users SET revoked_at=now() WHERE user_id='10000000-0000-4000-8000-000000000001';
  ASSERT lab.b2b_commercial_context() IS NULL, '5.6 revogado deve falhar fechado';
  UPDATE lab.partner_users SET revoked_at=NULL WHERE user_id='10000000-0000-4000-8000-000000000001';

  -- 5.7 multi-vínculo não revogado (U6) => NULL (contagem 2+, fail-closed)
  INSERT INTO lab.user_roles VALUES ('10000000-0000-4000-8000-000000000006','parceiro_b2b');
  INSERT INTO lab.entitlements VALUES ('10000000-0000-4000-8000-000000000006','catalogo_precos');
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000006',true);
  ASSERT lab.b2b_commercial_context() IS NULL, '5.7 multi-vínculo deve falhar fechado';

  -- 5.8 revogação parcial em multi-vínculo: 1 revogado + 1 ativo => conta 1, resolve
  UPDATE lab.partner_users SET revoked_at=now()
    WHERE user_id='10000000-0000-4000-8000-000000000006'
      AND ctid IN (SELECT ctid FROM lab.partner_users WHERE user_id='10000000-0000-4000-8000-000000000006' LIMIT 1);
  c := lab.b2b_commercial_context();
  ASSERT c IS NOT NULL, '5.8 um vínculo ativo entre vários deve resolver';

  RAISE NOTICE 'PASS fase5: contexto do portal com coerência de tenant fail-closed';
END $$;

ROLLBACK;
