-- ============================================================================
-- FASE F1 — TESTES SQL TRANSACIONAIS (BEGIN/ROLLBACK — nada persiste)
-- Destino: HOMOLOG vrlcdwmlytukrjezrrnf APÓS aplicação da migration F1,
-- e produção somente após aprovação. Executar como role com privilégio
-- (service_role/editor SQL). Cada bloco é independente e termina em ROLLBACK.
-- Critério: todos os DO blocks concluem sem exceção = PASS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- T1 — INSERT deriva tenant_id do parceiro e valid_from/version têm defaults
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_partner uuid;
  v_tenant  uuid;
  v_link    public.partner_users%ROWTYPE;
  v_user    uuid := gen_random_uuid(); -- user_id sem auth.users: FK não existe para auth nesta tabela (verificado F0)
BEGIN
  SELECT pa.id, pa.commercial_owner_organization_id
    INTO v_partner, v_tenant
    FROM public.partner_accounts pa
   WHERE pa.commercial_owner_organization_id IS NOT NULL
   LIMIT 1;

  IF v_partner IS NULL THEN
    RAISE NOTICE 'T1 SKIP: nenhum parceiro com tenant na base';
    RETURN;
  END IF;

  INSERT INTO public.partner_users (partner_id, user_id, papel)
  VALUES (v_partner, v_user, 'tecnico')
  RETURNING * INTO v_link;

  ASSERT v_link.tenant_id IS NOT DISTINCT FROM v_tenant, 'T1 FALHOU: tenant_id não derivado do parceiro';
  ASSERT v_link.valid_from IS NOT NULL, 'T1 FALHOU: valid_from sem default';
  ASSERT v_link.version = 1, 'T1 FALHOU: version inicial <> 1';
  ASSERT v_link.revoked_at IS NULL, 'T1 FALHOU: revoked_at deveria ser NULL';
  RAISE NOTICE 'T1 PASS';
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T2 — INSERT com tenant_id divergente do parceiro é REJEITADO (fail-closed)
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_partner uuid;
BEGIN
  SELECT pa.id INTO v_partner FROM public.partner_accounts pa LIMIT 1;
  IF v_partner IS NULL THEN
    RAISE NOTICE 'T2 SKIP: sem parceiros';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.partner_users (partner_id, user_id, papel, tenant_id)
    VALUES (v_partner, gen_random_uuid(), 'gestor', gen_random_uuid());
    RAISE EXCEPTION 'T2 FALHOU: tenant divergente aceito';
  EXCEPTION
    WHEN raise_exception THEN RAISE; -- propaga apenas a falha do ASSERT acima
    WHEN OTHERS THEN
      ASSERT SQLERRM LIKE '%tenant_mismatch%', 'T2 FALHOU: erro inesperado: %', SQLERRM;
      RAISE NOTICE 'T2 PASS (rejeitado: %)', SQLERRM;
  END;
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T3 — Checks de revogação: revoked_at sem motivo/autor é rejeitado;
--       revogação completa e coerente é aceita; revoked_at < valid_from rejeita
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_partner uuid;
  v_user    uuid := gen_random_uuid();
BEGIN
  SELECT pa.id INTO v_partner FROM public.partner_accounts pa LIMIT 1;
  IF v_partner IS NULL THEN
    RAISE NOTICE 'T3 SKIP: sem parceiros';
    RETURN;
  END IF;

  INSERT INTO public.partner_users (partner_id, user_id)
  VALUES (v_partner, v_user);

  -- 3a: revoked_at sem revoked_by/reason → rejeita
  BEGIN
    UPDATE public.partner_users SET revoked_at = now() WHERE user_id = v_user;
    RAISE EXCEPTION 'T3a FALHOU: revogação incompleta aceita';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T3a PASS';
  END;

  -- 3b: revogação completa → aceita
  UPDATE public.partner_users
     SET revoked_at = now(), revoked_by = gen_random_uuid(), revoke_reason = 'teste F1'
   WHERE user_id = v_user;
  RAISE NOTICE 'T3b PASS';

  -- 3c: revoked_at < valid_from → rejeita
  BEGIN
    UPDATE public.partner_users
       SET revoked_at = valid_from - interval '1 day'
     WHERE user_id = v_user;
    RAISE EXCEPTION 'T3c FALHOU: janela inválida aceita';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'T3c PASS';
  END;
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
  SELECT pa.id INTO v_partner FROM public.partner_accounts pa LIMIT 1;
  IF v_partner IS NULL THEN
    RAISE NOTICE 'T4 SKIP: sem parceiros';
    RETURN;
  END IF;

  INSERT INTO public.partner_users (partner_id, user_id)
  VALUES (v_partner, v_user)
  RETURNING version INTO v_v1;

  UPDATE public.partner_users SET papel = 'tecnico' WHERE user_id = v_user
  RETURNING version INTO v_v2;

  ASSERT v_v2 = v_v1 + 1, 'T4 FALHOU: version não incrementou (% → %)', v_v1, v_v2;
  RAISE NOTICE 'T4 PASS';
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T5 — Compatibilidade com guards existentes: acquire_gate (statement) e
--       touch_related_profiles (row) continuam disparando com as novas colunas
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_rev_before bigint;
  v_rev_after  bigint;
  v_partner    uuid;
BEGIN
  SELECT s.revision INTO v_rev_before FROM cf_user_guards_v1.state s WHERE s.singleton;
  SELECT pa.id INTO v_partner FROM public.partner_accounts pa LIMIT 1;
  IF v_partner IS NULL THEN
    RAISE NOTICE 'T5 SKIP: sem parceiros';
    RETURN;
  END IF;

  INSERT INTO public.partner_users (partner_id, user_id) VALUES (v_partner, gen_random_uuid());

  SELECT s.revision INTO v_rev_after FROM cf_user_guards_v1.state s WHERE s.singleton;
  ASSERT v_rev_after = v_rev_before + 1, 'T5 FALHOU: acquire_gate não incrementou revision';
  RAISE NOTICE 'T5 PASS (gate revision % → %)', v_rev_before, v_rev_after;
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T6 — Backfill idempotente: reexecutar o UPDATE de backfill não altera linhas
--       já coerentes (0 divergências após reexecução)
-- ----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_divergentes integer;
BEGIN
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

  ASSERT v_divergentes = 0, 'T6 FALHOU: % divergências após backfill', v_divergentes;
  RAISE NOTICE 'T6 PASS';
END;
$$;
ROLLBACK;

-- ----------------------------------------------------------------------------
-- T7 — READ-ONLY puro (seguro em produção mesmo sem F1 aplicada): pré-checagem
--       de prontidão do Cutover — parceiros sem tenant e vínculos por usuário
-- ----------------------------------------------------------------------------
SELECT
  count(*) FILTER (WHERE pa.commercial_owner_organization_id IS NULL) AS vinculos_parceiro_sem_tenant,
  count(*) AS vinculos_totais,
  count(*) - count(DISTINCT pu.user_id) AS vinculos_excedentes_por_usuario
FROM public.partner_users pu
JOIN public.partner_accounts pa ON pa.id = pu.partner_id;
-- Critério NO-GO para Cutover: vinculos_parceiro_sem_tenant > 0 (PENDÊNCIA P1)
-- ou vinculos_excedentes_por_usuario > 0 (exigiria compensação).
