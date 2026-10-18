-- ENTREGA 2 rev 2.3 — matriz comportamental sobre os TRÊS CORPOS REAIS
-- instalados pelo runner a partir do ARQUIVO CANDIDATO INTEIRO (sem duplicar
-- implementação) + corpo real instalado da Entrega 1. PostgreSQL descartável;
-- NÃO é Auth/JWT/RLS real. Stubs mínimos com paridade de colunas live.
-- Cada cenário afirma os TRÊS corpos (get_user_partner_id, get_partner_papel,
-- b2b_commercial_context) com roles/entitlements válidos nos fixtures.
\set ON_ERROR_STOP on
BEGIN;

-- ===== Fixtures =====
-- Parceiros: A ok (owner aa), B owner NULL, C inativo, D deletado, E ok (owner ee).
INSERT INTO public.partner_accounts VALUES
  ('a0000000-0000-4000-8000-0000000000a1', true, NULL, 'a0000000-0000-4000-8000-0000000000aa'),
  ('a0000000-0000-4000-8000-0000000000b1', true, NULL, NULL),
  ('a0000000-0000-4000-8000-0000000000c1', false, NULL, 'a0000000-0000-4000-8000-0000000000aa'),
  ('a0000000-0000-4000-8000-0000000000d1', true, now(), 'a0000000-0000-4000-8000-0000000000aa'),
  ('a0000000-0000-4000-8000-0000000000e1', true, NULL, 'a0000000-0000-4000-8000-0000000000ee');

-- Usuários (vínculos partner_users):
-- U1 gestor elegível (A, tenant=owner aa)
-- U2 revogado; U3 owner NULL; U4 parceiro inativo; U4b parceiro deletado
-- U5 tenant divergente; U5b tenant NULL
-- U6 multi-vínculo 2 elegíveis (A + E)
-- U7 1 elegível (A) + 1 inelegível não revogado (B, owner NULL) — divergência rev 2.1
-- U8 1 ativo (A) + 1 revogado (E) — histórico preservado
-- U9 sem nenhum vínculo (zero links)
INSERT INTO public.partner_users VALUES
  ('10000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-0000000000a1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL),
  ('10000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-0000000000a1','gestor','a0000000-0000-4000-8000-0000000000aa',now()),
  ('10000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-0000000000b1','gestor',NULL,NULL),
  ('10000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-0000000000c1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL),
  ('10000000-0000-4000-8000-00000000004b','a0000000-0000-4000-8000-0000000000d1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL),
  ('10000000-0000-4000-8000-000000000005','a0000000-0000-4000-8000-0000000000a1','tecnico','a0000000-0000-4000-8000-0000000000bb',NULL),
  ('10000000-0000-4000-8000-00000000005b','a0000000-0000-4000-8000-0000000000a1','gestor',NULL,NULL),
  ('10000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-0000000000a1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL),
  ('10000000-0000-4000-8000-000000000006','a0000000-0000-4000-8000-0000000000e1','gestor','a0000000-0000-4000-8000-0000000000ee',NULL),
  ('10000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-0000000000a1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL),
  ('10000000-0000-4000-8000-000000000007','a0000000-0000-4000-8000-0000000000b1','gestor',NULL,NULL),
  ('10000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-0000000000a1','gestor','a0000000-0000-4000-8000-0000000000aa',NULL),
  ('10000000-0000-4000-8000-000000000008','a0000000-0000-4000-8000-0000000000e1','gestor','a0000000-0000-4000-8000-0000000000ee',now());

-- Papéis (user_roles, exatamente 1 por usuário) e entitlements para o portal.
INSERT INTO public.user_roles VALUES
  ('10000000-0000-4000-8000-000000000001','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000003','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000004','parceiro_b2b'),
  ('10000000-0000-4000-8000-00000000004b','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000005','parceiro_b2b_tecnico'),
  ('10000000-0000-4000-8000-00000000005b','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000006','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000007','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000008','parceiro_b2b'),
  ('10000000-0000-4000-8000-000000000009','parceiro_b2b');
INSERT INTO lab.entitlements(user_id, feature_key) VALUES
  ('10000000-0000-4000-8000-000000000001','catalogo_precos'),
  ('10000000-0000-4000-8000-000000000003','catalogo_precos'),
  ('10000000-0000-4000-8000-000000000004','catalogo_precos'),
  ('10000000-0000-4000-8000-00000000004b','catalogo_precos'),
  ('10000000-0000-4000-8000-000000000005','catalogo_precos'),
  ('10000000-0000-4000-8000-00000000005b','catalogo_precos'),
  ('10000000-0000-4000-8000-000000000006','catalogo_precos'),
  ('10000000-0000-4000-8000-000000000007','catalogo_precos'),
  ('10000000-0000-4000-8000-000000000008','catalogo_precos'),
  ('10000000-0000-4000-8000-000000000009','catalogo_precos');
-- Org do ator = owner (aa) e org legada (cc) vinculada ao parceiro A.
INSERT INTO public.organizations VALUES
  ('a0000000-0000-4000-8000-0000000000aa', NULL, true, 'ativa'),
  ('a0000000-0000-4000-8000-0000000000cc', 'a0000000-0000-4000-8000-0000000000a1', true, 'ativa');

-- Contextual cliente: c1 na carteira do parceiro A (partner_clients ativo);
-- c2 existe mas NÃO está associado a nenhum parceiro (negativo).
INSERT INTO public.clientes VALUES
  ('c0000000-0000-4000-8000-0000000000c1'),
  ('c0000000-0000-4000-8000-0000000000c2');
INSERT INTO public.partner_clients VALUES
  ('a0000000-0000-4000-8000-0000000000a1','c0000000-0000-4000-8000-0000000000c1',true);

-- ===== Matriz sobre os corpos REAIS (os três corpos afirmados por cenário) =====
DO $$
DECLARE c jsonb;
BEGIN
  -- M1: elegível, org do ator = owner => commercial_owner; os três resolvem
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000001',true);
  PERFORM set_config('lab.actor_org','a0000000-0000-4000-8000-0000000000aa',true);
  ASSERT public.get_user_partner_id() = 'a0000000-0000-4000-8000-0000000000a1', 'M1 escalar deve resolver';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000001') = 'gestor', 'M1 papel deve resolver';
  c := platform_private.b2b_commercial_context();
  ASSERT c->>'mode' = 'commercial_owner', 'M1 modo commercial_owner';

  -- M2: legacy_partner_tenant REAL — org do ator (cc) != owner comercial (aa)
  PERFORM set_config('lab.actor_org','a0000000-0000-4000-8000-0000000000cc',true);
  c := platform_private.b2b_commercial_context();
  ASSERT c->>'mode' = 'legacy_partner_tenant', 'M2 modo legacy_partner_tenant (owner diverge da org do ator)';
  ASSERT c->>'commercial_owner_organization_id' = 'a0000000-0000-4000-8000-0000000000aa', 'M2 owner comercial preservado';
  ASSERT public.get_user_partner_id() = 'a0000000-0000-4000-8000-0000000000a1', 'M2 escalar resolve no legado';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000001') = 'gestor', 'M2 papel resolve no legado';

  -- M3: contextual cliente — ramo parceiro_b2b do can_user_access_cliente real (Entrega 1)
  ASSERT public.can_user_access_cliente('10000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-0000000000c1') IS TRUE,
    'M3 cliente na carteira válida deve autorizar';

  -- M4: owner NULL => NULL/false nos três
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000003',true);
  PERFORM set_config('lab.actor_org','a0000000-0000-4000-8000-0000000000aa',true);
  ASSERT public.get_user_partner_id() IS NULL, 'M4 owner NULL escalar';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000003') IS NULL, 'M4 owner NULL papel';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M4 owner NULL portal';

  -- M5: tenant NULL => NULL nos três
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-00000000005b',true);
  ASSERT public.get_user_partner_id() IS NULL, 'M5 tenant NULL escalar';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-00000000005b') IS NULL, 'M5 tenant NULL papel';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M5 tenant NULL portal';

  -- M6: tenant mismatch => NULL nos três (técnico U5, tenant bb != owner aa)
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000005',true);
  ASSERT public.get_user_partner_id() IS NULL, 'M6 tenant mismatch escalar';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000005') IS NULL, 'M6 tenant mismatch papel';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M6 tenant mismatch portal';

  -- M7: parceiro inativo / deletado => NULL nos três
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000004',true);
  ASSERT public.get_user_partner_id() IS NULL, 'M7 parceiro inativo escalar';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000004') IS NULL, 'M7 parceiro inativo papel';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M7 parceiro inativo portal';
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-00000000004b',true);
  ASSERT public.get_user_partner_id() IS NULL, 'M7b parceiro deletado escalar';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-00000000004b') IS NULL, 'M7b parceiro deletado papel';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M7b parceiro deletado portal';

  -- M8: 2 elegíveis não revogados => NULL nos três (fail-closed, nunca LIMIT 1)
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000006',true);
  ASSERT public.get_user_partner_id() IS NULL, 'M8 2 elegíveis escalar';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000006') IS NULL, 'M8 2 elegíveis papel';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M8 2 elegíveis portal';

  -- M9: 1 elegível + 1 inelegível NÃO revogado => NULL nos três (uniformidade
  --     de cardinalidade/elegibilidade rev 2.2; na rev 2.1 o escalar autorizava
  --     e o portal negava)
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000007',true);
  ASSERT public.get_user_partner_id() IS NULL, 'M9 escalar deve negar (contagem de não revogados = 2)';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000007') IS NULL, 'M9 papel deve negar';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M9 portal deve negar';

  -- M10: 1 ativo + 1 revogado (histórico) => resolve normalmente nos três
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000008',true);
  PERFORM set_config('lab.actor_org','a0000000-0000-4000-8000-0000000000aa',true);
  ASSERT public.get_user_partner_id() = 'a0000000-0000-4000-8000-0000000000a1', 'M10 1 ativo + 1 revogado resolve';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000008') = 'gestor', 'M10 papel resolve';
  c := platform_private.b2b_commercial_context();
  ASSERT c->>'mode' = 'commercial_owner', 'M10 portal resolve com histórico revogado';

  -- M11: revogação dinâmica fecha imediatamente (escalar, papel, portal e
  --      contextual cliente); restauração reabre
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000001',true);
  UPDATE public.partner_users SET revoked_at = now()
    WHERE user_id = '10000000-0000-4000-8000-000000000001';
  ASSERT public.get_user_partner_id() IS NULL, 'M11 revogação fecha escalar';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000001') IS NULL, 'M11 revogação fecha papel';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M11 revogação fecha portal';
  ASSERT public.can_user_access_cliente('10000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-0000000000c1') IS FALSE,
    'M11 revogação fecha acesso ao cliente';
  UPDATE public.partner_users SET revoked_at = NULL
    WHERE user_id = '10000000-0000-4000-8000-000000000001';
  ASSERT public.get_user_partner_id() = 'a0000000-0000-4000-8000-0000000000a1', 'M11 restauração reabre';

  -- M12: alvo terceiro (callers internos) — get_partner_papel de outro usuário
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000008') = 'gestor', 'M12 papel de alvo terceiro elegível';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000002') IS NULL, 'M12 papel de alvo revogado';

  -- M13: zero vínculos => NULL nos três
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000009',true);
  ASSERT public.get_user_partner_id() IS NULL, 'M13 zero vínculos escalar';
  ASSERT public.get_partner_papel('10000000-0000-4000-8000-000000000009') IS NULL, 'M13 zero vínculos papel';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M13 zero vínculos portal';

  -- M14: ator NULL => NULL nos corpos do ator; papel de alvo NULL => NULL
  PERFORM set_config('lab.actor','',true);
  ASSERT public.get_user_partner_id() IS NULL, 'M14 ator NULL escalar';
  ASSERT platform_private.b2b_commercial_context() IS NULL, 'M14 ator NULL portal';
  ASSERT public.get_partner_papel(NULL) IS NULL, 'M14 alvo NULL papel';

  -- M15: cliente NÃO associado => false (negativo contextual, corpo Entrega 1)
  PERFORM set_config('lab.actor','10000000-0000-4000-8000-000000000001',true);
  ASSERT public.can_user_access_cliente('10000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-0000000000c2') IS FALSE,
    'M15 cliente fora da carteira deve negar';

  RAISE NOTICE 'PASS matriz M1-M15: corpos reais fail-closed e uniformes';
END $$;

ROLLBACK;
