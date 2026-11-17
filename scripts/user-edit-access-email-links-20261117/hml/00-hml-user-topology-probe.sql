-- SONDA SOMENTE LEITURA — rodar em vrlcdwmlytukrjezrrnf ANTES do candidato. Lista exatamente as garantias faltantes.
BEGIN TRANSACTION READ ONLY;
DO $probe$
DECLARE v_fail text[] := ARRAY[]::text[]; v_sync text; r record;
BEGIN
  -- 1) impressão digital (mesma de homolog-alignment-20261102/00): só a homologação
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = 'c809e74f-486b-44b2-b2f4-4088f53421bb') OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = 'dcf50a75-579a-4828-a0fc-1d8eadcb4b8a') THEN v_fail := v_fail || 'not_homolog:homolog_orgs_absent'::text; END IF;
  IF EXISTS (SELECT 1 FROM public.organizations WHERE id IN ('8eae2bc1-ad00-4402-9f57-564258e493ca','442444d9-263f-45d9-a991-a679498d06c3','4e537fd6-4632-4c70-a782-386dba3e8f9f','8f57c7dd-0557-4041-b401-7a00f7244626','007bb519-cba0-4704-be2c-cb93ad010048')) THEN v_fail := v_fail || 'not_homolog:production_org_present'::text; END IF;
  -- 2) pins comprovados pelo POST do alinhamento 01 (aplicado em HML), iguais aos de produção
  FOR r IN SELECT * FROM (VALUES ('public.guard_profile_tenant_fields()','bd6d513d936f5c5fb0490b5d1d2f9f1d'), ('public.enforce_cliente_id_for_produtor()','ecad56badcb2120f7048fad7519f76f4'), ('cf_user_guards_v1.acquire_gate()','b0dd9a14d5fd799a40df0975baf4c5a6'), ('public.is_platform_superadmin(uuid)','3dfe79d976821244d9b7a7f893d765f2'), ('platform_private.has_role(uuid,app_role)','c5af5b55de6d79da9b73a33948746ae2'), ('platform_private.h15_actor_organization()','64e10608403238a41a9baf92857ca881')) v(f, h) LOOP
    IF to_regprocedure(r.f) IS NULL THEN v_fail := v_fail || ('missing_function:' || r.f);
    ELSIF md5(pg_get_functiondef(to_regprocedure(r.f))) <> r.h THEN v_fail := v_fail || ('function_drift:' || r.f || ':' || md5(pg_get_functiondef(to_regprocedure(r.f)))); END IF;
  END LOOP;
  -- 3) os 25 gatilhos de guarda de produção: mesmos nome/tabela/definição e HABILITADOS (nenhum desativado)
  FOR r IN SELECT * FROM (VALUES
    ('partner_users','a00_cf_user_gate','CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.partner_users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate()'),
    ('partner_users','a00_cf_user_no_truncate','CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.partner_users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate()'),
    ('partner_users','a10_partner_users_derive_tenant','CREATE TRIGGER a10_partner_users_derive_tenant BEFORE INSERT OR UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION partner_users_derive_tenant()'),
    ('partner_users','a20_partner_users_bump_version','CREATE TRIGGER a20_partner_users_bump_version BEFORE UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION partner_users_bump_version()'),
    ('partner_users','z90_cf_touch_profile','CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles()'),
    ('profiles','a00_cf_user_gate','CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate()'),
    ('profiles','a00_cf_user_no_truncate','CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate()'),
    ('profiles','guard_profile_senha_provisoria','CREATE TRIGGER guard_profile_senha_provisoria BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_senha_provisoria()'),
    ('profiles','guard_profile_senha_ticket','CREATE TRIGGER guard_profile_senha_ticket BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_senha_ticket()'),
    ('profiles','guard_profile_sensitive_fields','CREATE TRIGGER guard_profile_sensitive_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_sensitive_fields()'),
    ('profiles','h15_profile_organization_guard','CREATE TRIGGER h15_profile_organization_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION h15_profile_organization_guard()'),
    ('profiles','trg_guard_profile_tenant_fields','CREATE TRIGGER trg_guard_profile_tenant_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_tenant_fields()'),
    ('profiles','trg_profiles_enforce_cliente','CREATE TRIGGER trg_profiles_enforce_cliente BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION enforce_cliente_id_for_produtor()'),
    ('profiles','update_profiles_updated_at','CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()'),
    ('profiles','z99_cf_profile_stamp','CREATE TRIGGER z99_cf_profile_stamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp()'),
    ('profiles','z99_cf_require_admin','CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin()'),
    ('user_clientes','a00_cf_user_gate','CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate()'),
    ('user_clientes','a00_cf_user_no_truncate','CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.user_clientes FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate()'),
    ('user_clientes','z90_cf_touch_profile','CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles()'),
    ('user_roles','a00_cf_user_gate','CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate()'),
    ('user_roles','a00_cf_user_no_truncate','CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate()'),
    ('user_roles','trg_guard_superadmin_role_assignment','CREATE TRIGGER trg_guard_superadmin_role_assignment BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION guard_superadmin_role_assignment()'),
    ('user_roles','trg_user_roles_enforce_cliente','CREATE TRIGGER trg_user_roles_enforce_cliente BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION enforce_cliente_id_for_produtor()'),
    ('user_roles','z90_cf_touch_profile','CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles()'),
    ('user_roles','z99_cf_require_admin','CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin()')) v(t, n, d) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || r.t)::regclass AND tgname = r.n AND NOT tgisinternal) THEN v_fail := v_fail || ('missing_guard_trigger:' || r.t || '.' || r.n);
    ELSIF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || r.t)::regclass AND tgname = r.n AND tgenabled = 'O' AND pg_get_triggerdef(oid) = r.d) THEN v_fail := v_fail || ('guard_trigger_drift_or_disabled:' || r.t || '.' || r.n); END IF;
  END LOOP;
  -- 4) gatilho de principal: só variantes testadas, com a topologia correspondente
  v_sync := md5(pg_get_functiondef('public.sync_user_cliente_principal()'::regprocedure));
  IF v_sync = '1d053564ccd5fa672a10ec87d5cb0baa' THEN
    FOR r IN SELECT * FROM (VALUES ('user_clientes','trg_user_clientes_sync_del','CREATE TRIGGER trg_user_clientes_sync_del AFTER DELETE ON public.user_clientes REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_user_cliente_principal()'),
    ('user_clientes','trg_user_clientes_sync_ins','CREATE TRIGGER trg_user_clientes_sync_ins AFTER INSERT ON public.user_clientes REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_user_cliente_principal()'),
    ('user_clientes','trg_user_clientes_sync_upd','CREATE TRIGGER trg_user_clientes_sync_upd AFTER UPDATE ON public.user_clientes REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_user_cliente_principal()')) v(t, n, d) LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_clientes'::regclass AND tgname = r.n AND tgenabled = 'O' AND pg_get_triggerdef(oid) = r.d) THEN v_fail := v_fail || ('sync_topology:' || r.n); END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_clientes'::regclass AND tgname = 'trg_user_clientes_sync') THEN v_fail := v_fail || 'sync_topology:mixed'::text; END IF;
  ELSIF v_sync = '50392a57c5908c67c709c4e84f0e932e' THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_clientes'::regclass AND tgname = 'trg_user_clientes_sync' AND tgenabled = 'O' AND pg_get_triggerdef(oid) = 'CREATE TRIGGER trg_user_clientes_sync AFTER INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION sync_user_cliente_principal()')
       OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.user_clientes'::regclass AND tgname LIKE 'trg_user_clientes_sync\_%') THEN v_fail := v_fail || 'sync_topology:legacy_row'::text; END IF;
  ELSE v_fail := v_fail || ('sync_variant_untested:' || v_sync);
  END IF;
  -- 5) nenhum gatilho não testado nas 4 tabelas de usuário
  FOR r IN SELECT c.relname, t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
            WHERE NOT t.tgisinternal AND c.oid IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass)
              AND (c.relname, t.tgname) NOT IN (SELECT * FROM (VALUES ('partner_users','a00_cf_user_gate'), ('partner_users','a00_cf_user_no_truncate'), ('partner_users','a10_partner_users_derive_tenant'), ('partner_users','a20_partner_users_bump_version'), ('partner_users','z90_cf_touch_profile'), ('profiles','a00_cf_user_gate'), ('profiles','a00_cf_user_no_truncate'), ('profiles','guard_profile_senha_provisoria'), ('profiles','guard_profile_senha_ticket'), ('profiles','guard_profile_sensitive_fields'), ('profiles','h15_profile_organization_guard'), ('profiles','trg_guard_profile_tenant_fields'), ('profiles','trg_profiles_enforce_cliente'), ('profiles','update_profiles_updated_at'), ('profiles','z99_cf_profile_stamp'), ('profiles','z99_cf_require_admin'), ('user_clientes','a00_cf_user_gate'), ('user_clientes','a00_cf_user_no_truncate'), ('user_clientes','z90_cf_touch_profile'), ('user_roles','a00_cf_user_gate'), ('user_roles','a00_cf_user_no_truncate'), ('user_roles','trg_guard_superadmin_role_assignment'), ('user_roles','trg_user_roles_enforce_cliente'), ('user_roles','z90_cf_touch_profile'), ('user_roles','z99_cf_require_admin'), ('user_clientes','trg_user_clientes_sync_del'), ('user_clientes','trg_user_clientes_sync_ins'), ('user_clientes','trg_user_clientes_sync_upd'), ('user_clientes','trg_user_clientes_sync')) x(a, b)) LOOP
    v_fail := v_fail || ('untested_extra_trigger:' || r.relname || '.' || r.tgname);
  END LOOP;
  RAISE NOTICE 'PROBE sync_md5=%', v_sync;
  FOR r IN SELECT unnest(v_fail) AS i LOOP RAISE NOTICE 'PROBE %', r.i; END LOOP;
  IF cardinality(v_fail) = 0 THEN RAISE NOTICE 'PROBE PRE_WOULD_PASS'; END IF;
END $probe$;
ROLLBACK;
