-- ============================================================================
-- FASE PRÉ-F1.2 — REPLICAÇÃO DOS GUARDS cf_user_guards_v1 EM HOMOLOG
-- Destino: SOMENTE homolog vrlcdwmlytukrjezrrnf. NUNCA executar em produção
-- (swzpzcwiasxmjutrmvkm) — lá o schema já existe (preflight P0 aborta).
-- EXECUTÁVEL após revisão externa. Pré-requisito: PRÉ-F1 já aplicada
-- (migration cultivofarm_pref1_partner_owner_homolog_only_20261018).
--
-- Escopo P0–P3 (estrito):
--   P0  Preflight: ambiente é homolog divergente, PRÉ-F1 presente, tabelas
--       referenciadas pelos corpos existem, schema ainda ausente.
--   P1  Schema cf_user_guards_v1 + tabela state (singleton, revision) + linha
--       inicial (true, 0) — contador técnico, NÃO é dado pessoal.
--   P2  As 3 funções usadas pelos triggers de partner_users, com CORPOS
--       EXATOS de produção (extraídos read-only em 2026-10-18, sem overloads
--       — verificado: 1 oid por nome), mesmo owner/security/search_path:
--         - acquire_gate            SECURITY DEFINER, search_path=''
--         - touch_related_profiles  SECURITY DEFINER, search_path=''
--         - block_truncate          SECURITY INVOKER,  search_path=''
--       EXECUTE revogado de PUBLIC (e de anon/authenticated quando existirem)
--       — em produção os grants são apenas postgres=X/postgres.
--   P3  Os 3 triggers em public.partner_users, mesmos nomes/timing/nível:
--         - a00_cf_user_gate         BEFORE INSERT/DELETE/UPDATE STATEMENT
--         - a00_cf_user_no_truncate  BEFORE TRUNCATE STATEMENT
--         - z90_cf_touch_profile     AFTER INSERT/DELETE/UPDATE ROW
--
-- Fora de escopo (documentado, NÃO incluído):
--   * Funções acquire_invitation_gate, touch_invitation_profiles,
--     require_admin, advance_stamp e triggers em profiles, user_roles,
--     user_clientes, platform_org_admin_invites — pertencem a um passo P4
--     futuro de paridade ampla; esta fase não altera outras tabelas.
--   * Nenhum dado de auth/usuários/profiles é copiado. Nenhum mock: os
--     corpos são verbatim de produção; se homolog divergir nas dependências,
--     o preflight ABORTA em vez de adaptar.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- P0 — PREFLIGHT (qualquer divergência aborta a transação inteira)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- 0.1 Schema ainda ausente (idempotência invertida: se existe, já foi aplicado)
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cf_user_guards_v1') THEN
    RAISE EXCEPTION 'pref12_abort: schema cf_user_guards_v1 já existe — PRÉ-F1.2 já aplicada ou ambiente não é homolog';
  END IF;

  -- 0.2 auth.uid() presente (acquire_gate chama auth.uid())
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    RAISE EXCEPTION 'pref12_abort: auth.uid() ausente — ambiente não é Supabase compatível';
  END IF;

  -- 0.3 Tabelas referenciadas pelos corpos dos guards (TG_RELID de acquire_gate
  --     valida estas 5; touch_related_profiles atualiza public.profiles)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='partner_users')
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles')
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_roles')
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_clientes')
     OR NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='auth'   AND table_name='users') THEN
    RAISE EXCEPTION 'pref12_abort: tabela referenciada pelos guards ausente (partner_users/profiles/user_roles/user_clientes/auth.users)';
  END IF;

  -- 0.4 PRÉ-F1 aplicada (coluna predecessora presente)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='partner_accounts'
      AND column_name='commercial_owner_organization_id'
  ) THEN
    RAISE EXCEPTION 'pref12_abort: PRÉ-F1 não aplicada — commercial_owner_organization_id ausente';
  END IF;

  -- 0.5 partner_users sem triggers (estado esperado de homolog; se houver,
  --     algo diverge do inventário — abortar para investigação)
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='partner_users' AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'pref12_abort: partner_users já possui triggers — divergência do inventário de homolog, investigar';
  END IF;

  RAISE NOTICE 'pref12_p0 OK: preflight sem divergências';
END;
$$;

-- ----------------------------------------------------------------------------
-- P1 — Schema + tabela de estado (grants fechados: só o owner)
-- ----------------------------------------------------------------------------
CREATE SCHEMA cf_user_guards_v1;

CREATE TABLE cf_user_guards_v1.state (
  singleton boolean NOT NULL PRIMARY KEY,
  revision  bigint  NOT NULL
);

INSERT INTO cf_user_guards_v1.state (singleton, revision) VALUES (true, 0);

-- Produção: state -> postgres=arwdDxtm/postgres (nenhum outro role). Garantir
-- que PUBLIC não recebeu nada por default:
REVOKE ALL ON cf_user_guards_v1.state FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- P2 — Funções com corpos EXATOS de produção (verbatim, extraídos 2026-10-18)
-- ----------------------------------------------------------------------------
CREATE FUNCTION cf_user_guards_v1.acquire_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass,'auth.users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL THEN RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 RETURN NULL;
END $function$;

CREATE FUNCTION cf_user_guards_v1.block_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN RAISE EXCEPTION 'user_bulk_truncate_forbidden' USING ERRCODE='PT409'; END $function$;

CREATE FUNCTION cf_user_guards_v1.touch_related_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old_id uuid; new_id uuid; item uuid;
BEGIN
 IF TG_LEVEL<>'ROW' OR TG_RELID NOT IN ('public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'INSERT' THEN old_id:=OLD.user_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.user_id; END IF;
 FOR item IN SELECT DISTINCT x FROM unnest(ARRAY[old_id,new_id]) x WHERE x IS NOT NULL ORDER BY x LOOP UPDATE public.profiles SET updated_at=updated_at WHERE user_id=item; END LOOP;
 RETURN NULL;
END $function$;

-- Grants: em produção, EXECUTE apenas para postgres (owner). Revogar PUBLIC
-- sempre; anon/authenticated apenas se existirem no ambiente.
DO $$
DECLARE
  v_roles text := 'PUBLIC';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    v_roles := v_roles || ', anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    v_roles := v_roles || ', authenticated';
  END IF;
  EXECUTE format('REVOKE EXECUTE ON FUNCTION cf_user_guards_v1.acquire_gate() FROM %s', v_roles);
  EXECUTE format('REVOKE EXECUTE ON FUNCTION cf_user_guards_v1.block_truncate() FROM %s', v_roles);
  EXECUTE format('REVOKE EXECUTE ON FUNCTION cf_user_guards_v1.touch_related_profiles() FROM %s', v_roles);
END;
$$;

-- ----------------------------------------------------------------------------
-- P3 — Triggers em public.partner_users (nomes/timing/nível idênticos)
-- ----------------------------------------------------------------------------
CREATE TRIGGER a00_cf_user_gate
  BEFORE INSERT OR DELETE OR UPDATE ON public.partner_users
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();

CREATE TRIGGER a00_cf_user_no_truncate
  BEFORE TRUNCATE ON public.partner_users
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();

CREATE TRIGGER z90_cf_touch_profile
  AFTER INSERT OR DELETE OR UPDATE ON public.partner_users
  FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();

-- ----------------------------------------------------------------------------
-- Verificação pós-execução (dentro da transação): 3 triggers, 3 funções,
-- state com exatamente 1 linha singleton revision=0
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_trg integer;
  v_fun integer;
  v_rev bigint;
BEGIN
  SELECT count(*) INTO v_trg
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relname='partner_users' AND NOT t.tgisinternal;
  IF v_trg <> 3 THEN
    RAISE EXCEPTION 'pref12_abort: esperados 3 triggers em partner_users, encontrados %', v_trg;
  END IF;

  SELECT count(*) INTO v_fun
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='cf_user_guards_v1'
     AND p.proname IN ('acquire_gate','block_truncate','touch_related_profiles');
  IF v_fun <> 3 THEN
    RAISE EXCEPTION 'pref12_abort: esperadas 3 funções, encontradas %', v_fun;
  END IF;

  SELECT s.revision INTO v_rev FROM cf_user_guards_v1.state s WHERE s.singleton;
  IF v_rev IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'pref12_abort: state.revision inicial <> 0 (%)', v_rev;
  END IF;

  RAISE NOTICE 'pref12 OK: schema, state, 3 funções e 3 triggers replicados';
END;
$$;

COMMIT;

-- ============================================================================
-- ROLLBACK PRÉ-F1.2 (passos explícitos, SEM DROP SCHEMA CASCADE genérico):
--
--   BEGIN;
--   DROP TRIGGER IF EXISTS a00_cf_user_gate         ON public.partner_users;
--   DROP TRIGGER IF EXISTS a00_cf_user_no_truncate  ON public.partner_users;
--   DROP TRIGGER IF EXISTS z90_cf_touch_profile     ON public.partner_users;
--   DROP FUNCTION IF EXISTS cf_user_guards_v1.acquire_gate();
--   DROP FUNCTION IF EXISTS cf_user_guards_v1.block_truncate();
--   DROP FUNCTION IF EXISTS cf_user_guards_v1.touch_related_profiles();
--   DROP TABLE IF EXISTS cf_user_guards_v1.state;
--   DROP SCHEMA IF EXISTS cf_user_guards_v1;  -- vazio neste ponto; falha (RESTRICT implícito) se sobrar objeto
--   COMMIT;
--
-- ============================================================================
-- TESTE DE FUMAÇA (transacional, BEGIN/ROLLBACK — nada persiste).
-- Executar APÓS o COMMIT acima, como role privilegiada (editor SQL).
-- Critério: 3 NOTICEs de PASS; qualquer exceção inesperada = FAIL.
--
--   BEGIN;
--   DO $$
--   DECLARE
--     v_before bigint; v_after bigint; v_partner uuid; v_bloqueou boolean;
--   BEGIN
--     SELECT s.revision INTO v_before FROM cf_user_guards_v1.state s WHERE s.singleton;
--     INSERT INTO public.partner_accounts (razao_social, commercial_owner_organization_id)
--       VALUES ('FIXTURE PREF12 SMOKE', gen_random_uuid()) RETURNING id INTO v_partner;
--     INSERT INTO public.partner_users (partner_id, user_id, papel)
--       VALUES (v_partner, gen_random_uuid(), 'gestor');
--     SELECT s.revision INTO v_after FROM cf_user_guards_v1.state s WHERE s.singleton;
--     IF v_after IS DISTINCT FROM v_before + 1 THEN
--       RAISE EXCEPTION 'SMOKE FAIL: acquire_gate não incrementou revision (% → %)', v_before, v_after;
--     END IF;
--     RAISE NOTICE 'SMOKE 1 PASS: gate incrementou revision (% → %)', v_before, v_after;
--
--     v_bloqueou := false;
--     BEGIN
--       TRUNCATE public.partner_users;
--     EXCEPTION WHEN OTHERS THEN
--       IF SQLERRM LIKE '%user_bulk_truncate_forbidden%' THEN v_bloqueou := true;
--       ELSE RAISE; END IF;
--     END;
--     IF NOT v_bloqueou THEN
--       RAISE EXCEPTION 'SMOKE FAIL: TRUNCATE não foi bloqueado';
--     END IF;
--     RAISE NOTICE 'SMOKE 2 PASS: TRUNCATE bloqueado (user_bulk_truncate_forbidden)';
--
--     -- touch_related_profiles: UPDATE toca profiles.updated_at do user_id
--     -- (sem profile fixture o UPDATE não encontra linha — aceitável; o que
--     -- se valida é o trigger disparar sem erro de contexto)
--     UPDATE public.partner_users SET papel = 'tecnico'
--      WHERE partner_id = v_partner;
--     RAISE NOTICE 'SMOKE 3 PASS: UPDATE disparou gate+touch sem erro';
--   END;
--   $$;
--   ROLLBACK;
-- ============================================================================
