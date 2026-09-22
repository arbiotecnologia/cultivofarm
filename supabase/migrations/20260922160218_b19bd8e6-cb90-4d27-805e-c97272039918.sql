-- FASE SUPERADMIN — Migration 2/2: endurecimento do papel de plataforma.
-- Nenhum usuário é criado; nenhum dado operacional é alterado.
-- Objetivo: 'superadmin' só pode ser atribuído/removido por service_role
-- (mecanismo interno de plataforma). Administrador de empresa não alcança.
BEGIN;

-- 1) Trava de baixo nível na user_roles (defesa em profundidade).
--    Vale para qualquer caminho: PostgREST, RPC SECURITY INVOKER, trigger.
--    RPCs SECURITY DEFINER pertencentes a postgres passariam por current_user,
--    por isso os guards explícitos nas RPCs (item 3) também são aplicados.
CREATE OR REPLACE FUNCTION public.guard_superadmin_role_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_touches_superadmin boolean := false;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.role = 'superadmin'::public.app_role THEN
    v_touches_superadmin := true;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role = 'superadmin'::public.app_role THEN
    v_touches_superadmin := true;
  END IF;

  IF v_touches_superadmin AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'superadmin_role_reserved'
      USING ERRCODE = '42501',
            HINT = 'O papel de plataforma so pode ser atribuido ou removido pelo mecanismo interno.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.guard_superadmin_role_assignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_superadmin_role_assignment() FROM anon;
REVOKE ALL ON FUNCTION public.guard_superadmin_role_assignment() FROM authenticated;

DROP TRIGGER IF EXISTS trg_guard_superadmin_role_assignment ON public.user_roles;
CREATE TRIGGER trg_guard_superadmin_role_assignment
  BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.guard_superadmin_role_assignment();

-- 2) Policy: administrador de empresa deixa de alcançar linhas 'superadmin'.
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'administrador'::public.app_role)
    AND role <> 'superadmin'::public.app_role
  )
  WITH CHECK (
    public.has_role((SELECT auth.uid()), 'administrador'::public.app_role)
    AND role <> 'superadmin'::public.app_role
  );

-- 3a) RPC de edicao: recusa 'superadmin' no payload e recusa alvo superadmin.
CREATE OR REPLACE FUNCTION public.admin_edit_user_profile_v1(p_user_id uuid, p_expected_updated_at timestamp with time zone, p_profile jsonb, p_roles app_role[], p_cliente_ids uuid[], p_principal_cliente_id uuid, p_partner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE caller uuid:=auth.uid(); stamp timestamptz; ids uuid[]:=coalesce(p_cliente_ids,'{}'::uuid[]); partner_role text; item uuid; field text; n integer;
BEGIN
IF caller IS NULL OR NOT public.has_role(caller,'administrador') THEN RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
IF p_user_id IS NULL OR p_expected_updated_at IS NULL OR p_profile IS NULL OR jsonb_typeof(p_profile)<>'object' THEN RAISE EXCEPTION 'user_edit_invalid_input' USING ERRCODE='22023'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_profile) k WHERE k NOT IN ('nome','telefone','cargo','cpf_cnpj','crea','especialidade')) THEN RAISE EXCEPTION 'user_edit_invalid_fields' USING ERRCODE='22023'; END IF;
IF jsonb_typeof(p_profile->'nome') IS DISTINCT FROM 'string' OR char_length(btrim(coalesce(p_profile->>'nome',''))) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'user_edit_invalid_name' USING ERRCODE='22023'; END IF;
FOREACH field IN ARRAY ARRAY['telefone','cargo','cpf_cnpj','crea','especialidade'] LOOP
IF p_profile ? field AND jsonb_typeof(p_profile->field) NOT IN ('string','null') THEN RAISE EXCEPTION 'user_edit_invalid_fields' USING ERRCODE='22023'; END IF;
IF char_length(coalesce(p_profile->>field,''))>500 THEN RAISE EXCEPTION 'user_edit_field_too_long' USING ERRCODE='22023'; END IF; END LOOP;
IF nullif(p_profile->>'telefone','') IS NOT NULL AND (p_profile->>'telefone') !~ '^[0-9]{10,11}$' THEN RAISE EXCEPTION 'user_edit_invalid_phone' USING ERRCODE='22023'; END IF;
IF p_roles IS NULL OR cardinality(p_roles) NOT BETWEEN 1 AND 13 OR array_ndims(p_roles)<>1 OR array_position(p_roles,NULL) IS NOT NULL OR cardinality(p_roles)<>(SELECT count(DISTINCT r) FROM unnest(p_roles) r) THEN RAISE EXCEPTION 'user_edit_invalid_roles' USING ERRCODE='22023'; END IF;
IF 'superadmin'::public.app_role=ANY(p_roles) THEN RAISE EXCEPTION 'user_edit_superadmin_forbidden' USING ERRCODE='42501'; END IF;
IF EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_user_id AND ur.role='superadmin'::public.app_role) THEN RAISE EXCEPTION 'user_edit_superadmin_target' USING ERRCODE='42501'; END IF;
IF 'cliente_produtor'=ANY(p_roles) AND (cardinality(p_roles)<>1 OR cardinality(ids)=0) THEN RAISE EXCEPTION 'user_edit_producer_requires_client' USING ERRCODE='23514'; END IF;
IF 'parceiro_b2b'=ANY(p_roles) AND 'parceiro_b2b_tecnico'=ANY(p_roles) THEN RAISE EXCEPTION 'user_edit_conflicting_partner_roles' USING ERRCODE='23514'; END IF;
IF caller=p_user_id AND NOT ('administrador'=ANY(p_roles)) THEN RAISE EXCEPTION 'user_edit_self_admin_removal' USING ERRCODE='42501'; END IF;
IF cardinality(ids)>100 OR coalesce(array_ndims(ids),1)<>1 OR array_position(ids,NULL) IS NOT NULL OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'user_edit_invalid_clients' USING ERRCODE='22023'; END IF;
IF (cardinality(ids)=0 AND p_principal_cliente_id IS NOT NULL) OR (cardinality(ids)>0 AND (p_principal_cliente_id IS NULL OR NOT p_principal_cliente_id=ANY(ids))) THEN RAISE EXCEPTION 'user_edit_invalid_principal' USING ERRCODE='22023'; END IF;
partner_role:=CASE WHEN 'parceiro_b2b'=ANY(p_roles) THEN 'gestor' WHEN 'parceiro_b2b_tecnico'=ANY(p_roles) THEN 'tecnico' ELSE NULL END;
IF (partner_role IS NULL)<>(p_partner_id IS NULL) THEN RAISE EXCEPTION 'user_edit_invalid_partner' USING ERRCODE='23514'; END IF;
UPDATE public.profiles SET updated_at=updated_at WHERE false; PERFORM user_id FROM public.profiles WHERE user_id IN(caller,p_user_id) ORDER BY user_id FOR UPDATE;
IF NOT public.has_role(caller,'administrador') THEN RAISE EXCEPTION 'user_edit_forbidden' USING ERRCODE='42501'; END IF;
SELECT updated_at INTO stamp FROM public.profiles WHERE user_id=p_user_id;
IF NOT FOUND THEN RAISE EXCEPTION 'user_edit_not_found' USING ERRCODE='P0002'; END IF;
IF stamp IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'user_edit_conflict' USING ERRCODE='PT409'; END IF;
FOR item IN SELECT x FROM unnest(ids) x ORDER BY x LOOP
PERFORM id FROM public.clientes WHERE id=item FOR KEY SHARE;
IF NOT FOUND THEN RAISE EXCEPTION 'user_edit_client_not_found' USING ERRCODE='23503'; END IF; END LOOP;
IF p_partner_id IS NOT NULL THEN PERFORM id FROM public.partner_accounts WHERE id=p_partner_id AND ativo IS TRUE FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'user_edit_partner_unavailable' USING ERRCODE='23503'; END IF; END IF;
INSERT INTO public.user_clientes(user_id,cliente_id,principal) SELECT p_user_id,x,false FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM public.user_clientes uc WHERE uc.user_id=p_user_id AND uc.cliente_id=x);
DELETE FROM public.user_clientes WHERE user_id=p_user_id AND NOT(cliente_id=ANY(ids));
IF p_principal_cliente_id IS NOT NULL THEN UPDATE public.user_clientes SET principal=true WHERE user_id=p_user_id AND cliente_id=p_principal_cliente_id; END IF;
INSERT INTO public.user_roles(user_id,role) SELECT p_user_id,r FROM unnest(p_roles) r WHERE NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_user_id AND ur.role=r);
DELETE FROM public.user_roles WHERE user_id=p_user_id AND NOT(role=ANY(p_roles)) AND role<>'superadmin'::public.app_role;
IF p_partner_id IS NULL THEN DELETE FROM public.partner_users WHERE user_id=p_user_id;
ELSE INSERT INTO public.partner_users(user_id,partner_id,papel) VALUES(p_user_id,p_partner_id,partner_role) ON CONFLICT(user_id) DO UPDATE SET partner_id=EXCLUDED.partner_id,papel=EXCLUDED.papel; END IF;
UPDATE public.profiles SET nome=btrim(p_profile->>'nome'),telefone=nullif(p_profile->>'telefone',''),cargo=nullif(p_profile->>'cargo',''),cpf_cnpj=nullif(p_profile->>'cpf_cnpj',''),crea=nullif(p_profile->>'crea',''),especialidade=nullif(p_profile->>'especialidade','') WHERE user_id=p_user_id RETURNING updated_at INTO stamp;
GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'user_edit_not_found' USING ERRCODE='P0002'; END IF;
RETURN jsonb_build_object('success',true,'user_id',p_user_id,'updated_at',stamp);
END $function$;

-- 3b) RPC de provisionamento: recusa 'superadmin' no payload.
CREATE OR REPLACE FUNCTION public.admin_provision_user_profile_v1(p_user_id uuid, p_email text, p_nome text, p_roles app_role[], p_cliente_ids uuid[] DEFAULT ARRAY[]::uuid[], p_principal_cliente_id uuid DEFAULT NULL::uuid, p_partner_id uuid DEFAULT NULL::uuid, p_partner_papel text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_cargo text DEFAULT NULL::text, p_cpf_cnpj text DEFAULT NULL::text, p_crea text DEFAULT NULL::text, p_especialidade text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_profile_count integer;
  v_role_count integer;
  v_cliente_count integer;
  v_partner_role_count integer;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL OR p_nome IS NULL THEN
    RAISE EXCEPTION 'invalid_user_payload' USING ERRCODE = '22023';
  END IF;

  v_role_count := COALESCE(cardinality(p_roles), 0);
  IF v_role_count = 0 OR v_role_count > 13 THEN
    RAISE EXCEPTION 'invalid_roles' USING ERRCODE = '22023';
  END IF;

  IF 'superadmin'::public.app_role = ANY(p_roles) THEN
    RAISE EXCEPTION 'superadmin_role_reserved' USING ERRCODE = '42501';
  END IF;

  IF v_role_count <> (SELECT count(DISTINCT r) FROM unnest(p_roles) AS r) THEN
    RAISE EXCEPTION 'duplicate_roles' USING ERRCODE = '22023';
  END IF;

  p_cliente_ids := COALESCE(p_cliente_ids, ARRAY[]::uuid[]);
  v_cliente_count := cardinality(p_cliente_ids);
  IF v_cliente_count > 100
     OR v_cliente_count <> (SELECT count(DISTINCT c) FROM unnest(p_cliente_ids) AS c) THEN
    RAISE EXCEPTION 'invalid_customer_links' USING ERRCODE = '22023';
  END IF;

  IF 'cliente_produtor'::public.app_role = ANY(p_roles) AND v_cliente_count = 0 THEN
    RAISE EXCEPTION 'producer_requires_customer' USING ERRCODE = '23514';
  END IF;

  IF p_principal_cliente_id IS NOT NULL
     AND NOT (p_principal_cliente_id = ANY(p_cliente_ids)) THEN
    RAISE EXCEPTION 'invalid_primary_customer' USING ERRCODE = '23514';
  END IF;

  IF v_cliente_count > 0 AND (
    SELECT count(*) FROM public.clientes c WHERE c.id = ANY(p_cliente_ids)
  ) <> v_cliente_count THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_partner_role_count
  FROM unnest(p_roles) AS r
  WHERE r IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role);

  IF v_partner_role_count > 1 THEN
    RAISE EXCEPTION 'conflicting_partner_roles' USING ERRCODE = '23514';
  END IF;

  IF v_partner_role_count = 1 THEN
    IF p_partner_id IS NULL OR p_partner_papel NOT IN ('gestor', 'tecnico') THEN
      RAISE EXCEPTION 'invalid_partner_link' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.partner_accounts pa WHERE pa.id = p_partner_id) THEN
      RAISE EXCEPTION 'partner_not_found' USING ERRCODE = '23503';
    END IF;
  ELSIF p_partner_id IS NOT NULL OR p_partner_papel IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_partner_link' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_profile_count
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  IF v_profile_count <> 1
     OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.user_clientes uc WHERE uc.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_ready_for_provisioning' USING ERRCODE = '23514';
  END IF;

  UPDATE public.profiles
     SET nome = p_nome,
         email = p_email,
         telefone = NULLIF(p_telefone, ''),
         cargo = NULLIF(p_cargo, ''),
         cpf_cnpj = NULLIF(p_cpf_cnpj, ''),
         crea = NULLIF(p_crea, ''),
         especialidade = NULLIF(p_especialidade, '')
   WHERE user_id = p_user_id;

  IF v_cliente_count > 0 THEN
    INSERT INTO public.user_clientes (user_id, cliente_id, principal)
    SELECT p_user_id, c,
           c = COALESCE(p_principal_cliente_id, p_cliente_ids[1])
    FROM unnest(p_cliente_ids) AS c;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  SELECT p_user_id, r FROM unnest(p_roles) AS r;

  IF v_partner_role_count = 1 THEN
    INSERT INTO public.partner_users (user_id, partner_id, papel)
    VALUES (p_user_id, p_partner_id, p_partner_papel);
  END IF;
END;
$function$;

-- 4) Validacao final fail-closed.
DO $$
DECLARE
  v_has_enum boolean;
  v_trigger boolean;
  v_policy_ok boolean;
  v_edit_ok boolean;
  v_prov_ok boolean;
  v_superadmin_rows integer;
  v_erros text := '';
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'app_role' AND e.enumlabel = 'superadmin'
  ) INTO v_has_enum;
  IF NOT v_has_enum THEN v_erros := v_erros || 'enum sem superadmin; '; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_superadmin_role_assignment'
      AND tgrelid = 'public.user_roles'::regclass AND NOT tgisinternal
  ) INTO v_trigger;
  IF NOT v_trigger THEN v_erros := v_erros || 'trigger guard ausente; '; END IF;

  SELECT (qual LIKE '%superadmin%' AND with_check LIKE '%superadmin%')
    INTO v_policy_ok
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'user_roles' AND policyname = 'Admins can manage roles';
  IF v_policy_ok IS NOT TRUE THEN v_erros := v_erros || 'policy admin sem restricao de superadmin; '; END IF;

  SELECT pg_get_functiondef('public.admin_edit_user_profile_v1(uuid,timestamptz,jsonb,public.app_role[],uuid[],uuid,uuid)'::regprocedure)
         LIKE '%user_edit_superadmin_forbidden%' INTO v_edit_ok;
  IF NOT v_edit_ok THEN v_erros := v_erros || 'RPC de edicao sem guard; '; END IF;

  SELECT pg_get_functiondef('public.admin_provision_user_profile_v1'::regproc)
         LIKE '%superadmin_role_reserved%' INTO v_prov_ok;
  IF NOT v_prov_ok THEN v_erros := v_erros || 'RPC de provisionamento sem guard; '; END IF;

  SELECT count(*) INTO v_superadmin_rows
  FROM public.user_roles WHERE role = 'superadmin'::public.app_role;
  IF v_superadmin_rows <> 0 THEN
    v_erros := v_erros || 'esta rodada nao deve criar superadmin; ';
  END IF;

  IF v_erros <> '' THEN
    RAISE EXCEPTION 'SUPERADMIN_M2_VALIDACAO_FALHOU: %', v_erros;
  END IF;
END $$;

COMMIT;