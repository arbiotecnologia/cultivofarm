-- FASE SUPERADMIN — Correcao 3/3: o guard de alvo superadmin na RPC de edicao
-- usava EXISTS direto em public.user_roles. Como a RPC e SECURITY INVOKER, a
-- policy esconde a linha 'superadmin' do administrador e o guard nunca disparava
-- (comprovado pela sonda Q4). Passa a usar public.has_role, que e SECURITY
-- DEFINER e enxerga o vinculo independentemente de RLS.
BEGIN;

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
IF public.has_role(p_user_id,'superadmin'::public.app_role) THEN RAISE EXCEPTION 'user_edit_superadmin_target' USING ERRCODE='42501'; END IF;
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

DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.admin_edit_user_profile_v1(uuid,timestamptz,jsonb,public.app_role[],uuid[],uuid,uuid)'::regprocedure);
  IF v_def NOT LIKE '%public.has_role(p_user_id,''superadmin''%' THEN
    RAISE EXCEPTION 'SUPERADMIN_M3_VALIDACAO_FALHOU: guard de alvo nao usa has_role';
  END IF;
  IF v_def NOT LIKE '%user_edit_superadmin_forbidden%' THEN
    RAISE EXCEPTION 'SUPERADMIN_M3_VALIDACAO_FALHOU: guard de payload ausente';
  END IF;
END $$;

COMMIT;