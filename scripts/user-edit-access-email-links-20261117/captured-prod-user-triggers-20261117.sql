-- CAPTURA VERBATIM (somente leitura) de swzpzcwiasxmjutrmvkm em 17/11/2026 ~14:52 UTC: todas as funções de gatilho
-- e os 28 gatilhos não internos de profiles/user_roles/user_clientes/partner_users (pg_get_functiondef/pg_get_triggerdef).
-- md5(pg_get_functiondef) pinados: sync_user_cliente_principal=1d053564ccd5fa672a10ec87d5cb0baa,
-- guard_profile_tenant_fields=bd6d513d936f5c5fb0490b5d1d2f9f1d, enforce_cliente_id_for_produtor=ecad56badcb2120f7048fad7519f76f4,
-- cf_user_guards_v1.acquire_gate=b0dd9a14d5fd799a40df0975baf4c5a6. HML tem versão diferente: NÃO usar como referência.
CREATE OR REPLACE FUNCTION public.enforce_cliente_id_for_produtor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_role app_role;
  v_count int;
BEGIN
  -- Lógica específica para a tabela user_roles
  IF TG_TABLE_NAME = 'user_roles' THEN
    -- Aqui o record NEW possui o campo 'role'
    IF NEW.role = 'cliente_produtor' THEN
      SELECT count(*) INTO v_count
        FROM public.user_clientes WHERE user_id = NEW.user_id;
      IF v_count = 0 THEN
        RAISE EXCEPTION 'Para a função "Produtor (Portal)" é obrigatório vincular o usuário a pelo menos um cliente.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Lógica específica para a tabela user_clientes (que não possui campo 'role')
  IF TG_TABLE_NAME = 'user_clientes' THEN
    v_user := COALESCE(NEW.user_id, OLD.user_id);
    
    -- Verifica se o usuário tem a role de produtor
    SELECT role INTO v_role FROM public.user_roles
      WHERE user_id = v_user AND role = 'cliente_produtor' LIMIT 1;
      
    IF v_role IS NOT NULL THEN
      -- Conta quantos vínculos restariam após a operação
      IF TG_OP = 'DELETE' THEN
        SELECT count(*) INTO v_count FROM public.user_clientes
          WHERE user_id = v_user AND id <> OLD.id;
      ELSE
        SELECT count(*) INTO v_count FROM public.user_clientes
          WHERE user_id = v_user;
      END IF;

      IF v_count = 0 THEN
        RAISE EXCEPTION 'Este usuário é Produtor e precisa permanecer vinculado a pelo menos um cliente.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;$function$
;

CREATE OR REPLACE FUNCTION public.sync_user_cliente_principal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_users uuid[] := '{}';
  v_principal uuid;
  v_marked uuid;
BEGIN
  -- Reconcilia TODOS os usuários afetados: NEW e OLD (UPDATE de user_id
  -- reconcilia o usuário antigo e o novo; nenhum dado é reatribuído).
  -- Coleta por evento: cada trigger statement só executa o branch cuja
  -- transition table existe (plpgsql planeja cada statement na 1ª execução).
  IF TG_OP = 'INSERT' THEN
    FOR v_user IN SELECT DISTINCT n.user_id FROM new_rows n LOOP
      v_users := v_users || v_user;
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR v_user IN SELECT DISTINCT o.user_id FROM old_rows o LOOP
      v_users := v_users || v_user;
    END LOOP;
  ELSE
    FOR v_user IN
      SELECT n.user_id FROM new_rows n
      UNION
      SELECT o.user_id FROM old_rows o
    LOOP
      v_users := v_users || v_user;
    END LOOP;
  END IF;

  FOREACH v_user IN ARRAY v_users LOOP
    -- 1) Rebaixa principais não vigentes (inativo, revogado, futuro, expirado).
    --    Só emite UPDATE quando há trabalho: é o que encerra a recursão.
    IF EXISTS (
      SELECT 1 FROM public.user_clientes
       WHERE user_id = v_user AND principal = true
         AND NOT (is_active AND revoked_at IS NULL
                  AND valid_from <= now()
                  AND (valid_until IS NULL OR valid_until >= now()))
    ) THEN
      UPDATE public.user_clientes
         SET principal = false
       WHERE user_id = v_user
         AND principal = true
         AND NOT (is_active AND revoked_at IS NULL
                  AND valid_from <= now()
                  AND (valid_until IS NULL OR valid_until >= now()));
    END IF;

    -- 2) Principal explicitamente marcado e vigente neste comando vence;
    --    desempate determinístico (created_at, id) se houver mais de um
    IF TG_OP = 'DELETE' THEN
      v_marked := NULL;
    ELSE
      SELECT uc.id INTO v_marked
        FROM new_rows n
        JOIN public.user_clientes uc ON uc.id = n.id
       WHERE n.user_id = v_user AND n.principal
         AND uc.is_active AND uc.revoked_at IS NULL
         AND uc.valid_from <= now()
         AND (uc.valid_until IS NULL OR uc.valid_until >= now())
       ORDER BY uc.created_at ASC, uc.id ASC
       LIMIT 1;
    END IF;
    IF v_marked IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.user_clientes
                    WHERE user_id = v_user AND id <> v_marked AND principal = true) THEN
      UPDATE public.user_clientes
         SET principal = false
       WHERE user_id = v_user
         AND id <> v_marked
         AND principal = true;
    END IF;

    -- 3) Garante exatamente um principal vigente (mais antigo; desempate por id)
    IF NOT EXISTS (
      SELECT 1 FROM public.user_clientes
       WHERE user_id = v_user AND principal = true
         AND is_active AND revoked_at IS NULL
         AND valid_from <= now()
         AND (valid_until IS NULL OR valid_until >= now())
    ) AND EXISTS (
      SELECT 1 FROM public.user_clientes
       WHERE user_id = v_user
         AND is_active AND revoked_at IS NULL
         AND valid_from <= now()
         AND (valid_until IS NULL OR valid_until >= now())
    ) THEN
      UPDATE public.user_clientes
         SET principal = true
       WHERE id = (
         SELECT id FROM public.user_clientes
          WHERE user_id = v_user
            AND is_active AND revoked_at IS NULL
            AND valid_from <= now()
            AND (valid_until IS NULL OR valid_until >= now())
          ORDER BY created_at ASC, id ASC
          LIMIT 1
       );
    END IF;

    -- 4) profiles.cliente_id SOMENTE com principal vigente (ou NULL);
    --    nunca aponta para vínculo histórico/revogado
    SELECT cliente_id INTO v_principal
      FROM public.user_clientes
     WHERE user_id = v_user AND principal = true
       AND is_active AND revoked_at IS NULL
       AND valid_from <= now()
       AND (valid_until IS NULL OR valid_until >= now())
     LIMIT 1;

    IF EXISTS (SELECT 1 FROM public.profiles
                WHERE user_id = v_user AND cliente_id IS DISTINCT FROM v_principal) THEN
      UPDATE public.profiles
         SET cliente_id = v_principal
       WHERE user_id = v_user
         AND cliente_id IS DISTINCT FROM v_principal;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.guard_profile_sensitive_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ BEGIN IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF; IF public.has_role(auth.uid(),'administrador'::public.app_role) THEN RETURN NEW; END IF; IF TG_OP='INSERT' THEN IF NEW.ativo IS DISTINCT FROM true OR NEW.cliente_id IS NOT NULL OR NEW.organization_id IS NOT NULL OR NEW.data_admissao IS NOT NULL OR NEW.observacoes_internas IS NOT NULL THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF; ELSE IF OLD.ativo IS NOT TRUE OR ROW(NEW.id,NEW.user_id,NEW.email,NEW.ativo,NEW.cliente_id,NEW.organization_id,NEW.created_at,NEW.data_admissao,NEW.observacoes_internas) IS DISTINCT FROM ROW(OLD.id,OLD.user_id,OLD.email,OLD.ativo,OLD.cliente_id,OLD.organization_id,OLD.created_at,OLD.data_admissao,OLD.observacoes_internas) THEN RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501'; END IF; END IF; RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.h15_profile_organization_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF current_setting('role',true) IN ('authenticated','anon') THEN
 IF TG_OP='INSERT' THEN
 IF NEW.organization_id IS NOT NULL THEN RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSIF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
 RAISE EXCEPTION 'H15_ORGANIZATION_PROVISIONING_REQUIRED' USING ERRCODE='42501';
 END IF;
 END IF;
 RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION cf_user_guards_v1.acquire_gate()
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
END $function$
;

CREATE OR REPLACE FUNCTION cf_user_guards_v1.require_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r USING(user_id) WHERE p.ativo IS TRUE AND r.role='administrador') THEN RAISE EXCEPTION 'user_last_active_admin' USING ERRCODE='PT409'; END IF;
 RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION cf_user_guards_v1.advance_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond'); RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION cf_user_guards_v1.touch_related_profiles()
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
END $function$
;

CREATE OR REPLACE FUNCTION cf_user_guards_v1.block_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN RAISE EXCEPTION 'user_bulk_truncate_forbidden' USING ERRCODE='PT409'; END $function$
;

CREATE OR REPLACE FUNCTION public.guard_superadmin_role_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_touches boolean := false;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.role = 'superadmin'::public.app_role THEN
    v_touches := true;
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.role = 'superadmin'::public.app_role THEN
    v_touches := true;
  END IF;

  IF v_touches AND current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'superadmin_role_reserved'
      USING ERRCODE = '42501',
            HINT = 'O papel de plataforma so pode ser atribuido ou removido pelo mecanismo interno.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_profile_senha_provisoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.senha_provisoria IS TRUE THEN
      RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria THEN
    RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.guard_profile_senha_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF session_user = 'authenticator'
     AND OLD.senha_provisoria IS TRUE AND NEW.senha_provisoria IS DISTINCT FROM TRUE
     AND NOT platform_private.has_ticket('pwd_conclude', NEW.user_id) THEN
    RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING errcode='42501';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.guard_profile_tenant_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria
     OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() = OLD.user_id AND NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    RAISE EXCEPTION 'profile_protected_fields' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.partner_users_derive_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_tenant uuid;
BEGIN
 SELECT pa.commercial_owner_organization_id INTO v_tenant
 FROM public.partner_accounts pa WHERE pa.id=NEW.partner_id;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'partner_users_partner_not_found' USING ERRCODE='23503';
 END IF;
 IF v_tenant IS NULL THEN
  RAISE EXCEPTION 'partner_users_partner_without_tenant' USING ERRCODE='42501';
 END IF;
 IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_tenant THEN
  RAISE EXCEPTION 'partner_users_tenant_mismatch' USING ERRCODE='42501';
 END IF;
 NEW.tenant_id:=v_tenant;
 RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.partner_users_bump_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.partner_users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.partner_users FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER a10_partner_users_derive_tenant BEFORE INSERT OR UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION partner_users_derive_tenant();
CREATE TRIGGER a20_partner_users_bump_version BEFORE UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION partner_users_bump_version();
CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.partner_users FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER guard_profile_senha_provisoria BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_senha_provisoria();
CREATE TRIGGER guard_profile_senha_ticket BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_senha_ticket();
CREATE TRIGGER guard_profile_sensitive_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_sensitive_fields();
CREATE TRIGGER h15_profile_organization_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION h15_profile_organization_guard();
CREATE TRIGGER trg_guard_profile_tenant_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile_tenant_fields();
CREATE TRIGGER trg_profiles_enforce_cliente BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION enforce_cliente_id_for_produtor();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER z99_cf_profile_stamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.advance_stamp();
CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.user_clientes FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER trg_user_clientes_sync_del AFTER DELETE ON public.user_clientes REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_user_cliente_principal();
CREATE TRIGGER trg_user_clientes_sync_ins AFTER INSERT ON public.user_clientes REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_user_cliente_principal();
CREATE TRIGGER trg_user_clientes_sync_upd AFTER UPDATE ON public.user_clientes REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_user_cliente_principal();
CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
CREATE TRIGGER a00_cf_user_gate BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.acquire_gate();
CREATE TRIGGER a00_cf_user_no_truncate BEFORE TRUNCATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.block_truncate();
CREATE TRIGGER trg_guard_superadmin_role_assignment BEFORE INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION guard_superadmin_role_assignment();
CREATE TRIGGER trg_user_roles_enforce_cliente BEFORE INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION enforce_cliente_id_for_produtor();
CREATE TRIGGER z90_cf_touch_profile AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION cf_user_guards_v1.touch_related_profiles();
CREATE TRIGGER z99_cf_require_admin AFTER INSERT OR DELETE OR UPDATE ON public.user_roles FOR EACH STATEMENT EXECUTE FUNCTION cf_user_guards_v1.require_admin();
