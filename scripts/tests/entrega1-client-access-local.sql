-- ENTREGA 1 harness sintético (PostgreSQL descartável; NÃO é Auth/JWT/RLS real).
-- Reproduz o corpo baseline hospedado (md5 c610786f...) em schema mínimo,
-- aplica a candidata por substituição de marcador e prova os comportamentos.
\set ON_ERROR_STOP on
BEGIN;

CREATE SCHEMA lab;
CREATE TYPE lab.app_role AS ENUM ('administrador','gestor_comercial','gestor','tecnico_agronomo','consultor_tecnico','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor');

CREATE TABLE lab.user_roles(user_id uuid, role lab.app_role);
CREATE TABLE lab.partner_accounts(id uuid, ativo boolean, deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TABLE lab.partner_users(user_id uuid, partner_id uuid, tenant_id uuid, revoked_at timestamptz);
CREATE TABLE lab.partner_clients(partner_id uuid, cliente_id uuid, active boolean);
CREATE TABLE lab.partner_user_clients(partner_id uuid, user_id uuid, cliente_id uuid, active boolean); -- sem revoked_at: paridade exata com live
CREATE TABLE lab.partner_technician_clients(partner_id uuid, technician_user_id uuid, cliente_id uuid, active boolean);
CREATE TABLE lab.user_clientes(user_id uuid, cliente_id uuid, is_active boolean, revoked_at timestamptz, valid_from timestamptz, valid_until timestamptz);
CREATE TABLE lab.clientes(id uuid, organization_id uuid); -- paridade live: clientes.organization_id existe

CREATE FUNCTION lab.has_role(u uuid, r lab.app_role) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS (SELECT 1 FROM lab.user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION lab.has_active_user_cliente_access(u uuid, c uuid, l text[]) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT EXISTS (SELECT 1 FROM lab.user_clientes uc WHERE uc.user_id=u AND uc.cliente_id=c AND uc.is_active AND uc.revoked_at IS NULL) $$;

-- Corpo baseline (espelho do hospedado, schema lab).
CREATE FUNCTION lab.can_user_access_cliente(_user_id uuid, _cliente_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'lab' AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;

  IF COALESCE(lab.has_role(_user_id,'administrador'::lab.app_role), false)
     OR COALESCE(lab.has_role(_user_id,'gestor_comercial'::lab.app_role), false)
     OR COALESCE(lab.has_role(_user_id,'gestor'::lab.app_role), false)
  THEN
    RETURN true;
  END IF;

  IF COALESCE(lab.has_role(_user_id,'tecnico_agronomo'::lab.app_role), false)
     OR COALESCE(lab.has_role(_user_id,'consultor_tecnico'::lab.app_role), false)
  THEN
    RETURN COALESCE(
      lab.has_active_user_cliente_access(
        _user_id, _cliente_id, ARRAY['read','execute','manage']
      ), false);
  END IF;

  IF COALESCE(lab.has_role(_user_id,'parceiro_b2b'::lab.app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM lab.partner_clients pc
      JOIN lab.partner_users pu ON pu.partner_id = pc.partner_id
      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true
    )), false);
  END IF;

  IF COALESCE(lab.has_role(_user_id,'parceiro_b2b_tecnico'::lab.app_role), false) THEN
    RETURN COALESCE((EXISTS (
      SELECT 1 FROM lab.partner_user_clients puc
      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true
    ) OR EXISTS (
      SELECT 1 FROM lab.partner_technician_clients ptc
      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true
    )), false);
  END IF;

  RETURN COALESCE((EXISTS (
    SELECT 1 FROM lab.user_clientes uc
    WHERE uc.user_id = _user_id
      AND uc.cliente_id = _cliente_id
      AND uc.is_active = true
      AND uc.revoked_at IS NULL
      AND (uc.valid_from IS NULL OR uc.valid_from <= now())
      AND (uc.valid_until IS NULL OR uc.valid_until >= now())
  )), false);
END;
$function$;

-- Fixtures: tenant A/B, parceiros A/B, usuários.
INSERT INTO lab.partner_accounts VALUES
  ('a0000000-0000-4000-8000-0000000000a1', true, NULL, 'a0000000-0000-4000-8000-0000000000aa'), -- parceiro A, owner tenant A
  ('a0000000-0000-4000-8000-0000000000b1', true, NULL, 'a0000000-0000-4000-8000-0000000000bb'), -- parceiro B, owner tenant B
  ('a0000000-0000-4000-8000-0000000000c1', true, NULL, NULL),                                     -- parceiro legacy sem owner
  ('a0000000-0000-4000-8000-0000000000d1', false, NULL, 'a0000000-0000-4000-8000-0000000000aa'); -- parceiro inativo
INSERT INTO lab.partner_users VALUES
  ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000aa', NULL),                -- U1 legítimo A
  ('10000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000aa', now()),               -- U2 revogado
  ('10000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-0000000000c1', NULL, NULL),                                                 -- U3 legacy sem owner
  ('10000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000aa', NULL),                -- U4 parceiro inativo
  ('10000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000bb', NULL),                -- U5 legítimo B
  ('10000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000bb', NULL);                -- U6 tenant divergente do owner
INSERT INTO lab.partner_clients VALUES
  ('a0000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', true),
  ('a0000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', true),
  ('a0000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000c1', true),
  ('a0000000-0000-4000-8000-0000000000d1', '20000000-0000-4000-8000-0000000000d1', true);
-- clientes com organization_id (paridade live): a1/c1 tenant A, b1 tenant B
INSERT INTO lab.clientes VALUES
  ('20000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000aa'),
  ('20000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000bb'),
  ('20000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000aa'),
  ('20000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000aa');
INSERT INTO lab.user_roles VALUES
  ('10000000-0000-4000-8000-000000000001','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000002','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000003','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000004','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000005','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000006','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000007','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000008','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000011','parceiro_b2b_tecnico'),
  ('10000000-0000-4000-8000-000000000012','parceiro_b2b_tecnico'),
  ('10000000-0000-4000-8000-000000000013','parceiro_b2b_tecnico'),
  ('10000000-0000-4000-8000-000000000014','parceiro_b2b_tecnico'),
  ('10000000-0000-4000-8000-000000000099','administrador');

-- Técnico: T11 com PUC ativa via vínculo próprio em A; T12 só com PTC direct sem vínculo partner_users.
INSERT INTO lab.partner_users VALUES
  ('10000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-0000000000aa', NULL);
INSERT INTO lab.partner_user_clients VALUES
  ('a0000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-0000000000a1', true);
INSERT INTO lab.partner_technician_clients VALUES
  ('a0000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-0000000000a1', true);

-- REVISÃO 1.1: legado owner NULL com tenant divergente do cliente (cross-tenant legacy).
-- U7: parceiro legacy C, tenant_id=B, cliente c1 do tenant A -> deve ser BLOQUEADO.
-- U8: parceiro legacy C, tenant_id=A, cliente c1 do tenant A -> preservado.
INSERT INTO lab.partner_users VALUES
  ('10000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000bb', NULL),
  ('10000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000aa', NULL);
-- T13: técnico legacy com tenant B e PUC no cliente do tenant A -> bloqueado.
-- T14: técnico legacy com tenant A e PUC no cliente do tenant A -> preservado.
INSERT INTO lab.partner_users VALUES
  ('10000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000bb', NULL),
  ('10000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000aa', NULL);
INSERT INTO lab.partner_user_clients VALUES
  ('a0000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-0000000000c1', true),
  ('a0000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-0000000000c1', true);

-- ===== FASE 1: prova da brecha no corpo BASELINE =====
DO $$
BEGIN
  -- brecha: vínculo revogado ainda autoriza
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-0000000000a1'), 'baseline deveria autorizar revogado (brecha)';
  -- brecha: parceiro inativo ainda autoriza
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-0000000000d1'), 'baseline deveria autorizar parceiro inativo (brecha)';
  -- brecha: PTC direct sem vínculo partner_users autoriza técnico
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-0000000000a1'), 'baseline deveria autorizar PTC sem vínculo (brecha)';
  RAISE NOTICE 'PASS fase1: brechas reproduzidas no baseline';
END $$;

-- ===== FASE 2: aplica a candidata por substituição de marcador (mesmo algoritmo do SQL real) =====
DO $$
DECLARE
  d text;
  m1 text := E'      SELECT 1 FROM lab.partner_clients pc\n      JOIN lab.partner_users pu ON pu.partner_id = pc.partner_id\n      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true';
  r1 text := E'      SELECT 1 FROM lab.partner_clients pc\n      JOIN lab.partner_users pu ON pu.partner_id = pc.partner_id\n      JOIN lab.partner_accounts pa ON pa.id = pu.partner_id\n      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true\n        AND pu.revoked_at IS NULL\n        AND pa.ativo = true AND pa.deleted_at IS NULL\n        AND (\n          (pa.commercial_owner_organization_id IS NOT NULL\n           AND pu.tenant_id IS NOT NULL\n           AND pu.tenant_id = pa.commercial_owner_organization_id)\n          OR (pa.commercial_owner_organization_id IS NULL\n              AND (pu.tenant_id IS NULL\n                   OR pu.tenant_id = (SELECT c.organization_id FROM lab.clientes c WHERE c.id = _cliente_id)))\n        )';
  m2 text := E'      SELECT 1 FROM lab.partner_user_clients puc\n      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true\n    ) OR EXISTS (\n      SELECT 1 FROM lab.partner_technician_clients ptc\n      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true\n    )), false);';
  r2 text := E'      SELECT 1 FROM lab.partner_user_clients puc\n      JOIN lab.partner_users pu2 ON pu2.partner_id = puc.partner_id AND pu2.user_id = puc.user_id\n      JOIN lab.partner_accounts pa2 ON pa2.id = puc.partner_id\n      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true\n        AND pu2.revoked_at IS NULL\n        AND pa2.ativo = true AND pa2.deleted_at IS NULL\n        AND (\n          (pa2.commercial_owner_organization_id IS NOT NULL\n           AND pu2.tenant_id IS NOT NULL\n           AND pu2.tenant_id = pa2.commercial_owner_organization_id)\n          OR (pa2.commercial_owner_organization_id IS NULL\n              AND (pu2.tenant_id IS NULL\n                   OR pu2.tenant_id = (SELECT c2.organization_id FROM lab.clientes c2 WHERE c2.id = _cliente_id)))\n        )\n    ) OR EXISTS (\n      SELECT 1 FROM lab.partner_technician_clients ptc\n      JOIN lab.partner_users pu3 ON pu3.partner_id = ptc.partner_id AND pu3.user_id = ptc.technician_user_id\n      JOIN public.partner_accounts pa3 ON pa3.id = ptc.partner_id\n      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true\n        AND pu3.revoked_at IS NULL\n        AND pa3.ativo = true AND pa3.deleted_at IS NULL\n        AND (\n          (pa3.commercial_owner_organization_id IS NOT NULL\n           AND pu3.tenant_id IS NOT NULL\n           AND pu3.tenant_id = pa3.commercial_owner_organization_id)\n          OR (pa3.commercial_owner_organization_id IS NULL\n              AND (pu3.tenant_id IS NULL\n                   OR pu3.tenant_id = (SELECT c3.organization_id FROM lab.clientes c3 WHERE c3.id = _cliente_id)))\n        )\n    )), false);';
BEGIN
  SELECT pg_get_functiondef('lab.can_user_access_cliente(uuid,uuid)'::regprocedure) INTO d;
  ASSERT (length(d)-length(replace(d,m1,'')))/length(m1) = 1, 'marcador b2b divergente';
  ASSERT (length(d)-length(replace(d,m2,'')))/length(m2) = 1, 'marcador tecnico divergente';
  d := replace(replace(d,m1,r1),m2,r2);
  EXECUTE d;
  RAISE NOTICE 'PASS fase2: candidata aplicada por marcador';
END $$;

-- ===== FASE 3: comportamento endurecido =====
DO $$
BEGIN
  -- legítimo preservado (A e B)
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-0000000000a1'), 'U1 legítimo deve continuar autorizado';
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-0000000000b1'), 'U5 legítimo B deve continuar autorizado';
  -- revogado bloqueado
  ASSERT NOT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-0000000000a1'), 'U2 revogado deve ser bloqueado';
  -- parceiro inativo bloqueado
  ASSERT NOT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-0000000000d1'), 'U4 parceiro inativo deve ser bloqueado';
  -- tenant divergente do owner bloqueado
  ASSERT NOT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-0000000000a1'), 'U6 tenant divergente deve ser bloqueado';
  -- legacy sem owner preservado
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-0000000000c1'), 'U3 legacy sem owner deve continuar autorizado';
  -- cross-tenant: U1 (parceiro A) não acessa cliente do parceiro B
  ASSERT NOT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-0000000000b1'), 'cross-parceiro deve ser bloqueado';
  -- técnico com PUC ativa e vínculo vigente preservado
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-0000000000a1'), 'T11 PUC vigente deve continuar autorizado';
  -- técnico só com PTC direct e SEM vínculo partner_users bloqueado
  ASSERT NOT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000012','20000000-0000-4000-8000-0000000000a1'), 'T12 PTC sem vínculo deve ser bloqueado';
  -- admin (ramo inalterado) e alvo terceiro sem self-only
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000099','20000000-0000-4000-8000-0000000000a1'), 'admin deve continuar autorizado';
  RAISE NOTICE 'PASS fase3: endurecimento correto';
END $$;

-- ===== FASE 4: revogação dinâmica fecha acesso na mesma transação lógica =====
DO $$
BEGIN
  UPDATE lab.partner_users SET revoked_at = now()
  WHERE user_id = '10000000-0000-4000-8000-000000000001';
  ASSERT NOT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-0000000000a1'), 'revogação deve fechar acesso imediatamente';
  -- revogar o PRÓPRIO vínculo do técnico fecha sua PUC
  UPDATE lab.partner_users SET revoked_at = now()
  WHERE user_id = '10000000-0000-4000-8000-000000000011';
  ASSERT NOT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-0000000000a1'), 'revogação do próprio vínculo deve fechar PUC do técnico';
  UPDATE lab.partner_users SET revoked_at = NULL
  WHERE user_id IN ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000011');
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-0000000000a1'), 'restauração deve reabrir acesso legítimo';
  ASSERT lab.can_user_access_cliente('10000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-0000000000a1'), 'restauração deve reabrir PUC do técnico';
  RAISE NOTICE 'PASS fase4: revogação dinâmica respeitada';
END $$;

ROLLBACK;
