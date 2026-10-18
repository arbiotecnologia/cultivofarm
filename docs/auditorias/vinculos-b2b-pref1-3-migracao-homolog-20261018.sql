-- ============================================================================
-- PRÉ-F1.3 — Reconciliação dos guards cf_user_guards_v1 nas tabelas
-- profiles, user_roles, user_clientes, platform_org_admin_invites
-- DESTINO: SOMENTE homologação vrlcdwmlytukrjezrrnf
-- PRODUÇÃO swzpzcwiasxmjutrmvkm: NÃO EXECUTAR
-- Data: 2026-10-18 | Natureza: SOMENTE ADITIVA (cria funções/triggers ausentes;
-- não altera nem remove nada existente; não copia usuários nem dados)
-- Pré-requisitos: PRÉ-F1, PRÉ-F1.2 e F1 já aplicadas em homolog (confirmado
-- pelo auditor externo em 2026-10-18).
-- Fonte dos corpos: extraídos read-only de produção em 2026-10-18
-- (pg_get_functiondef), transcritos verbatim abaixo.
-- ============================================================================

BEGIN;

-- ============================================================================
-- P0 — PREFLIGHT FAIL-CLOSED (aborta a transação em qualquer divergência)
-- ============================================================================
DO $$
DECLARE
  v_count int;
BEGIN
  -- P0.1 Schema e state da PRÉ-F1.2 presentes
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='cf_user_guards_v1') THEN
    RAISE EXCEPTION 'PREF13_PRECOND: schema cf_user_guards_v1 ausente — aplique PRÉ-F1.2 antes'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cf_user_guards_v1.state WHERE singleton) THEN
    RAISE EXCEPTION 'PREF13_PRECOND: cf_user_guards_v1.state sem linha singleton'; END IF;

  -- P0.2 As 3 funções da PRÉ-F1.2 presentes com flags de segurança corretas
  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='cf_user_guards_v1' AND p.proname IN ('acquire_gate','block_truncate','touch_related_profiles');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'PREF13_PRECOND: funções PRÉ-F1.2 incompletas (%/3)', v_count; END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='cf_user_guards_v1' AND p.proname='acquire_gate'
               AND (NOT p.prosecdef OR p.proconfig IS NULL OR NOT 'search_path='=ANY(p.proconfig))) THEN
    RAISE EXCEPTION 'PREF13_DIVERGENCE: acquire_gate sem SECURITY DEFINER/search_path esperados'; END IF;

  -- P0.3 Tabelas alvo existem
  FOREACH v_count IN ARRAY ARRAY[
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='profiles'),
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='user_roles'),
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='user_clientes'),
      (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='platform_org_admin_invites')]
  LOOP
    IF v_count <> 1 THEN RAISE EXCEPTION 'PREF13_PRECOND: tabela alvo ausente em public'; END IF;
  END LOOP;

  -- P0.4 Nenhum dos triggers a criar já existe (adição limpa, sem conflito)
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND NOT t.tgisinternal
               AND t.tgname IN ('a00_cf_user_gate','a00_cf_user_no_truncate','z90_cf_touch_profile',
                                'z99_cf_profile_stamp','z99_cf_require_admin',
                                'a00_cf_invitation_gate','a00_cf_invitation_no_truncate',
                                'z90_cf_invitation_profile_stamp')
               AND c.relname IN ('profiles','user_roles','user_clientes','platform_org_admin_invites')) THEN
    RAISE EXCEPTION 'PREF13_CONFLICT: trigger de guard já presente — abortando para evitar duplicidade'; END IF;

  -- P0.5 Nenhuma das 4 funções novas já existe (adição limpa)
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='cf_user_guards_v1'
               AND p.proname IN ('acquire_invitation_gate','advance_stamp','require_admin','touch_invitation_profiles')) THEN
    RAISE EXCEPTION 'PREF13_CONFLICT: função de guard já presente — abortando'; END IF;

  -- P0.6 auth.uid() disponível (contrato dos gates)
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='auth' AND p.proname='uid') THEN
    RAISE EXCEPTION 'PREF13_PRECOND: auth.uid() indisponível'; END IF;
END $$;

-- ============================================================================
-- P1 — FUNÇÕES NOVAS (corpos verbatim de produção, 2026-10-18)
-- Segurança idêntica à produção: owner do executor da migration (postgres),
-- search_path='', SECURITY DEFINER conforme origem, EXECUTE somente do owner.
-- ============================================================================

-- Produção: SECURITY DEFINER, search_path=''
CREATE FUNCTION cf_user_guards_v1.acquire_invitation_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID<>'public.platform_org_admin_invites'::regclass THEN
  RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS NULL THEN
  RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'user_guard_unavailable' USING ERRCODE='PT503'; END IF;
 UPDATE cf_user_guards_v1.state SET revision=revision+1 WHERE singleton;
 RETURN NULL;
END $function$;

-- Produção: SECURITY INVOKER, search_path=''
CREATE FUNCTION cf_user_guards_v1.advance_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond'); RETURN NEW; END $function$;

-- Produção: SECURITY DEFINER, search_path=''
CREATE FUNCTION cf_user_guards_v1.require_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r USING(user_id) WHERE p.ativo IS TRUE AND r.role='administrador') THEN RAISE EXCEPTION 'user_last_active_admin' USING ERRCODE='PT409'; END IF;
 RETURN NULL;
END $function$;

-- Produção: SECURITY DEFINER, search_path=''
CREATE FUNCTION cf_user_guards_v1.touch_invitation_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old_id uuid; new_id uuid; item uuid;
BEGIN
 IF TG_LEVEL<>'ROW' OR TG_RELID<>'public.platform_org_admin_invites'::regclass THEN
  RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'INSERT' THEN old_id:=OLD.user_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.user_id; END IF;
 FOR item IN SELECT DISTINCT x FROM unnest(ARRAY[old_id,new_id]) x WHERE x IS NOT NULL ORDER BY x
 LOOP UPDATE public.profiles SET updated_at=updated_at WHERE user_id=item; END LOOP;
 RETURN NULL;
END $function$;

-- Grants idênticos à produção (verificado 2026-10-18): somente o owner (postgres)
-- executa; anon/authenticated/service_role NÃO têm EXECUTE.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION cf_user_guards_v1.acquire_invitation_gate() FROM anon;
    REVOKE ALL ON FUNCTION cf_user_guards_v1.advance_stamp() FROM anon;
    REVOKE ALL ON FUNCTION cf_user_guards_v1.require_admin() FROM anon;
    REVOKE ALL ON FUNCTION cf_user_guards_v1.touch_invitation_profiles() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION cf_user_guards_v1.acquire_invitation_gate() FROM authenticated;
    REVOKE ALL ON FUNCTION cf_user_guards_v1.advance_stamp() FROM authenticated;
    REVOKE ALL ON FUNCTION cf_user_guards_v1.require_admin() FROM authenticated;
    REVOKE ALL ON FUNCTION cf_user_guards_v1.touch_invitation_profiles() FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    REVOKE ALL ON FUNCTION cf_user_guards_v1.acquire_invitation_gate() FROM service_role;
    REVOKE ALL ON FUNCTION cf_user_guards_v1.advance_stamp() FROM service_role;
    REVOKE ALL ON FUNCTION cf_user_guards_v1.require_admin() FROM service_role;
    REVOKE ALL ON FUNCTION cf_user_guards_v1.touch_invitation_profiles() FROM service_role;
  END IF;
END $$;
REVOKE ALL ON FUNCTION cf_user_guards_v1.acquire_invitation_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION cf_user_guards_v1.advance_stamp() FROM PUBLIC;
REVOKE ALL ON FUNCTION cf_user_guards_v1.require_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION cf_user_guards_v1.touch_invitation_profiles() FROM PUBLIC;

-- ============================================================================
-- P2 — TRIGGERS (nomes, timing, eventos e funções idênticos à produção)
-- tgtype produção: 30=BEFORE STATEMENT I/U/D; 34=BEFORE TRUNCATE;
-- 29=AFTER ROW I/U/D; 19=BEFORE ROW UPDATE; 28=AFTER STATEMENT I/U/D
-- ============================================================================

-- profiles
CREATE TRIGGER a00_cf_user_gate
  BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate
  BEFORE TRUNCATE ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER z99_cf_profile_stamp
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp();
CREATE TRIGGER z99_cf_require_admin
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();

-- user_roles
CREATE TRIGGER a00_cf_user_gate
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate
  BEFORE TRUNCATE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER z90_cf_touch_profile
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
CREATE TRIGGER z99_cf_require_admin
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();

-- user_clientes
CREATE TRIGGER a00_cf_user_gate
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_clientes
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate
  BEFORE TRUNCATE ON public.user_clientes
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER z90_cf_touch_profile
  AFTER INSERT OR UPDATE OR DELETE ON public.user_clientes
  FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();

-- platform_org_admin_invites
CREATE TRIGGER a00_cf_invitation_gate
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_org_admin_invites
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_invitation_gate();
CREATE TRIGGER a00_cf_invitation_no_truncate
  BEFORE TRUNCATE ON public.platform_org_admin_invites
  FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER z90_cf_invitation_profile_stamp
  AFTER INSERT OR UPDATE OR DELETE ON public.platform_org_admin_invites
  FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_invitation_profiles();

-- ============================================================================
-- P3 — VALIDAÇÃO PÓS-CRIAÇÃO (fail-closed dentro da mesma transação)
-- ============================================================================
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM pg_trigger t
   JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace nf ON nf.oid=p.pronamespace
  WHERE n.nspname='public' AND nf.nspname='cf_user_guards_v1' AND NOT t.tgisinternal
    AND c.relname IN ('profiles','user_roles','user_clientes','platform_org_admin_invites','partner_users');
  -- 3 (partner_users, PRÉ-F1.2) + 12 novos = 15
  IF v_count <> 15 THEN
    RAISE EXCEPTION 'PREF13_VALIDATE: esperados 15 triggers de guard, encontrados %', v_count; END IF;
END $$;

COMMIT;

-- ============================================================================
-- SMOKE TESTS TRANSACIONAIS (executar SEPARADAMENTE após COMMIT; cada bloco
-- faz ROLLBACK e não persiste dados). Não são prova de RLS em sessões reais.
-- ============================================================================
-- S1: gate incrementa revision em UPDATE privilegiado em profiles
-- DO $$
-- DECLARE r0 bigint; r1 bigint;
-- BEGIN
--   SELECT revision INTO r0 FROM cf_user_guards_v1.state WHERE singleton;
--   UPDATE public.profiles SET updated_at = updated_at WHERE user_id IS NULL; -- 0 linhas, mas STATEMENT dispara
--   SELECT revision INTO r1 FROM cf_user_guards_v1.state WHERE singleton;
--   ASSERT r1 = r0 + 1, 'S1 FAIL: gate não incrementou revision';
--   ROLLBACK; -- via bloco externo: executar dentro de BEGIN; ... ROLLBACK;
-- END $$;
-- NOTA: em psql/SQL editor, envolver cada smoke em BEGIN; ... ROLLBACK; manual.
--
-- S2: TRUNCATE bloqueado em cada tabela protegida (esperar erro PT409 user_bulk_truncate_forbidden)
-- BEGIN; TRUNCATE public.user_clientes; -- deve falhar
-- ROLLBACK;
--
-- S3: require_admin bloqueia remoção do último admin ativo (fixture transacional)
-- BEGIN;
--   -- criar profile+role admin de fixture, desativar todos os demais admins na transação,
--   -- tentar DELETE do fixture admin -> esperar erro PT409 user_last_active_admin
-- ROLLBACK;
--
-- S4: proteção cross-tenant / cache de autorização — NÃO reproduzível via SQL
-- privilegiado. Exige sessões reais anon/authenticated (Admin A/B). Registrado
-- como PENDENTE; este smoke NÃO declara PASS de login real.
--
-- S5: touch_invitation_profiles toca profiles.updated_at do user afetado
-- (fixture transacional com user_id de profile existente; verificar updated_at
-- avançou; ROLLBACK).

-- ============================================================================
-- ROLLBACK COMPLETO (somente homolog; sem CASCADE; preserva PRÉ-F1.2/F1)
-- ============================================================================
-- BEGIN;
-- DROP TRIGGER a00_cf_user_gate ON public.profiles;
-- DROP TRIGGER a00_cf_user_no_truncate ON public.profiles;
-- DROP TRIGGER z99_cf_profile_stamp ON public.profiles;
-- DROP TRIGGER z99_cf_require_admin ON public.profiles;
-- DROP TRIGGER a00_cf_user_gate ON public.user_roles;
-- DROP TRIGGER a00_cf_user_no_truncate ON public.user_roles;
-- DROP TRIGGER z90_cf_touch_profile ON public.user_roles;
-- DROP TRIGGER z99_cf_require_admin ON public.user_roles;
-- DROP TRIGGER a00_cf_user_gate ON public.user_clientes;
-- DROP TRIGGER a00_cf_user_no_truncate ON public.user_clientes;
-- DROP TRIGGER z90_cf_touch_profile ON public.user_clientes;
-- DROP TRIGGER a00_cf_invitation_gate ON public.platform_org_admin_invites;
-- DROP TRIGGER a00_cf_invitation_no_truncate ON public.platform_org_admin_invites;
-- DROP TRIGGER z90_cf_invitation_profile_stamp ON public.platform_org_admin_invites;
-- DROP FUNCTION cf_user_guards_v1.acquire_invitation_gate();
-- DROP FUNCTION cf_user_guards_v1.advance_stamp();
-- DROP FUNCTION cf_user_guards_v1.require_admin();
-- DROP FUNCTION cf_user_guards_v1.touch_invitation_profiles();
-- COMMIT;
-- (Não remove schema/state nem os 3 guards de partner_users da PRÉ-F1.2.)
