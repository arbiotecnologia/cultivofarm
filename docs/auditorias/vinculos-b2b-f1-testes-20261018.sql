-- ============================================================================
-- FASE F1 — TESTES SQL TRANSACIONAIS v2 (BEGIN/ROLLBACK — nada persiste)
-- Destino: HOMOLOG vrlcdwmlytukrjezrrnf APÓS PRÉ-F1 + F1 aplicados.
-- Executar como role privilegiada (editor SQL / service_role).
--
-- REVISÃO 2026-10-18 (auditoria externa) — defeitos corrigidos:
--   1. ASSERT com múltiplos argumentos de formato é SINTAXE INVÁLIDA em
--      PL/pgSQL (ASSERT cond, msg — msg é expressão simples, sem %).
--      Todos os asserts reescritos: mensagens fixas em ASSERT, ou
--      RAISE EXCEPTION com % onde a mensagem precisa de valores.
--   2. SKIP silencioso não conta como PASS → eliminado. Fixtures agora são
--      CRIADAS transacionalmente pelos próprios testes (parceiro próprio
--      com razao_social — única coluna NOT NULL sem default, verificado em
--      produção). Se a fixture não puder ser criada, o teste FALHA com
--      mensagem explícita (f1_fixture_unavailable), nunca passa em branco.
--   3. T3: INSERT passa a incluir papel explícito (default 'gestor' existe
--      em produção, mas o teste não deve depender de defaults).
--   4. T2: captura de erro reescrita — sem EXCEPTION WHEN raise_exception
--      (relançaria o próprio assert); agora usa flag booleana + SQLERRM.
--   5. Cenário homolog com 0 vínculos: coberto — nenhum teste depende de
--      dados pré-existentes; T7 é read-only e informa o estado da base.
--
-- Critério: cada bloco termina com RAISE NOTICE '<Tn> PASS'; qualquer
-- exceção = FAIL explícito. Não existe caminho de SKIP.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- T1 — INSERT deriva tenant_id do parceiro; defaults valid_from/version
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_partner uuid;
  v_tenant  uuid := gen_random_uuid(); -- tenant fictício transacional (não precisa existir em organizations: coluna sem FK formal, verificado)
  v_link    public.partner_users%ROWTYPE;
BEGIN
  INSERT INTO public.partner_accounts (razao_social, commercial_owner_organization_id)
  VALUES ('FIXTURE F1 T1', v_tenant)
  RETURNING id INTO v_partner;

  INSERT INTO public.partner_users (partner_id, user_id, papel)
  VALUES (v_partner, gen_random_uuid(), 'tecnico')
  RETURNING * INTO v_link;

  IF v_link.tenant_id IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'T1 FAIL: tenant_id não derivado do parceiro';
  END IF;
  IF v_link.valid_from IS NULL THEN
    RAISE EXCEPTION 'T1 FAIL: valid_from sem default';
  END IF;
  IF v_link.version <> 1 THEN
    RAISE EXCEPTION 'T1 FAIL: version inicial <> 1';
  END IF;
  IF v_link.revoked_at IS NULL THEN
    RAISE NOTICE 'T1 PASS';
  ELSE
    RAISE EXCEPTION 'T1 FAIL: revoked_at deveria ser NULL';
  END IF;
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T2 — INSERT com tenant_id divergente do parceiro é REJEITADO (fail-closed)
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_partner  uuid;
  v_rejeitou boolean := false;
  v_erro     text;
BEGIN
  INSERT INTO public.partner_accounts (razao_social, commercial_owner_organization_id)
  VALUES ('FIXTURE F1 T2', gen_random_uuid())
  RETURNING id INTO v_partner;

  BEGIN
    INSERT INTO public.partner_users (partner_id, user_id, papel, tenant_id)
    VALUES (v_partner, gen_random_uuid(), 'gestor', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_rejeitou := true;
    v_erro := SQLERRM;
  END;

  IF NOT v_rejeitou THEN
    RAISE EXCEPTION 'T2 FAIL: tenant divergente foi aceito';
  END IF;
  IF v_erro NOT LIKE '%tenant_mismatch%' THEN
    RAISE EXCEPTION 'T2 FAIL: rejeitado por motivo inesperado: %', v_erro;
  END IF;
  RAISE NOTICE 'T2 PASS (rejeitado: %)', v_erro;
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T3 — Checks de revogação: incompleta rejeita; completa aceita; janela inválida rejeita
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_partner  uuid;
  v_user     uuid := gen_random_uuid();
  v_rejeitou boolean;
BEGIN
  INSERT INTO public.partner_accounts (razao_social, commercial_owner_organization_id)
  VALUES ('FIXTURE F1 T3', gen_random_uuid())
  RETURNING id INTO v_partner;

  INSERT INTO public.partner_users (partner_id, user_id, papel)
  VALUES (v_partner, v_user, 'gestor');

  -- 3a: revoked_at sem revoked_by/reason → check_violation
  v_rejeitou := false;
  BEGIN
    UPDATE public.partner_users SET revoked_at = now() WHERE user_id = v_user;
  EXCEPTION WHEN check_violation THEN
    v_rejeitou := true;
  END;
  IF NOT v_rejeitou THEN
    RAISE EXCEPTION 'T3a FAIL: revogação incompleta aceita';
  END IF;
  RAISE NOTICE 'T3a PASS';

  -- 3b: revogação completa e coerente → aceita
  UPDATE public.partner_users
     SET revoked_at = now(), revoked_by = gen_random_uuid(), revoke_reason = 'teste F1'
   WHERE user_id = v_user;
  RAISE NOTICE 'T3b PASS';

  -- 3c: revoked_at < valid_from → check_violation
  v_rejeitou := false;
  BEGIN
    UPDATE public.partner_users
       SET revoked_at = valid_from - interval '1 day'
     WHERE user_id = v_user;
  EXCEPTION WHEN check_violation THEN
    v_rejeitou := true;
  END;
  IF NOT v_rejeitou THEN
    RAISE EXCEPTION 'T3c FAIL: janela temporal inválida aceita';
  END IF;
  RAISE NOTICE 'T3c PASS';
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T4 — version incrementa em UPDATE (base do CAS da fase Guards)
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_partner uuid;
  v_user    uuid := gen_random_uuid();
  v_v1      integer;
  v_v2      integer;
BEGIN
  INSERT INTO public.partner_accounts (razao_social, commercial_owner_organization_id)
  VALUES ('FIXTURE F1 T4', gen_random_uuid())
  RETURNING id INTO v_partner;

  INSERT INTO public.partner_users (partner_id, user_id, papel)
  VALUES (v_partner, v_user, 'gestor')
  RETURNING version INTO v_v1;

  UPDATE public.partner_users SET papel = 'tecnico' WHERE user_id = v_user
  RETURNING version INTO v_v2;

  IF v_v2 <> v_v1 + 1 THEN
    RAISE EXCEPTION 'T4 FAIL: version não incrementou (% → %)', v_v1, v_v2;
  END IF;
  RAISE NOTICE 'T4 PASS';
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T5 — Compatibilidade com guards existentes: acquire_gate (statement) segue
--       disparando com as novas colunas. FAIL explícito se o schema de guards
--       ou a tabela de estado não existir (homolog divergente).
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_rev_before bigint;
  v_rev_after  bigint;
  v_partner    uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'cf_user_guards_v1' AND table_name = 'state'
  ) THEN
    RAISE EXCEPTION 'T5 FAIL: cf_user_guards_v1.state ausente — homolog divergente de produção, investigar antes de prosseguir';
  END IF;

  SELECT s.revision INTO v_rev_before FROM cf_user_guards_v1.state s WHERE s.singleton;
  IF v_rev_before IS NULL THEN
    RAISE EXCEPTION 'T5 FAIL: cf_user_guards_v1.state sem linha singleton';
  END IF;

  INSERT INTO public.partner_accounts (razao_social, commercial_owner_organization_id)
  VALUES ('FIXTURE F1 T5', gen_random_uuid())
  RETURNING id INTO v_partner;

  INSERT INTO public.partner_users (partner_id, user_id, papel)
  VALUES (v_partner, gen_random_uuid(), 'gestor');

  SELECT s.revision INTO v_rev_after FROM cf_user_guards_v1.state s WHERE s.singleton;
  IF v_rev_after IS DISTINCT FROM v_rev_before + 1 THEN
    RAISE EXCEPTION 'T5 FAIL: acquire_gate não incrementou revision (% → %)', v_rev_before, v_rev_after;
  END IF;
  RAISE NOTICE 'T5 PASS (gate revision % → %)', v_rev_before, v_rev_after;
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T6 — Backfill idempotente: reexecutar o UPDATE de backfill não gera
--       divergências; tenant derivado permanece coerente
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_partner     uuid;
  v_tenant      uuid := gen_random_uuid();
  v_user        uuid := gen_random_uuid();
  v_divergentes integer;
BEGIN
  INSERT INTO public.partner_accounts (razao_social, commercial_owner_organization_id)
  VALUES ('FIXTURE F1 T6', v_tenant)
  RETURNING id INTO v_partner;

  INSERT INTO public.partner_users (partner_id, user_id, papel)
  VALUES (v_partner, v_user, 'gestor');

  -- Reexecução do backfill (mesma forma da migration, passo 5)
  UPDATE public.partner_users pu
     SET tenant_id = pa.commercial_owner_organization_id
    FROM public.partner_accounts pa
   WHERE pa.id = pu.partner_id
     AND pu.tenant_id IS NULL
     AND pa.commercial_owner_organization_id IS NOT NULL;

  SELECT count(*) INTO v_divergentes
    FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id = pu.partner_id
   WHERE pu.tenant_id IS DISTINCT FROM pa.commercial_owner_organization_id;

  IF v_divergentes > 0 THEN
    RAISE EXCEPTION 'T6 FAIL: % divergências após backfill', v_divergentes;
  END IF;
  RAISE NOTICE 'T6 PASS';
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T7 — READ-ONLY puro (seguro mesmo sem F1 aplicada): estado da base e
--       prontidão do Cutover. Em homolog espera-se 0 vínculos — é informativo,
--       não há fixture; resultado deve ser registrado no relatório de homolog.
-- ----------------------------------------------------------------------------
SELECT
  count(*) AS vinculos_totais,
  count(*) FILTER (WHERE pa.commercial_owner_organization_id IS NULL) AS vinculos_parceiro_sem_tenant,
  count(*) - count(DISTINCT pu.user_id) AS vinculos_excedentes_por_usuario
FROM public.partner_users pu
JOIN public.partner_accounts pa ON pa.id = pu.partner_id;
-- Critério NO-GO para Cutover (produção): vinculos_parceiro_sem_tenant > 0
-- (PENDÊNCIA P1) ou vinculos_excedentes_por_usuario > 0.
