CREATE OR REPLACE FUNCTION public.tenant_admin_user_links(p_user_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_org uuid; v_items jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'administrador'::public.app_role) OR public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'tenant_users_forbidden' USING ERRCODE='42501'; END IF;
 SELECT organization_id INTO v_org FROM public.profiles WHERE user_id=auth.uid() AND ativo=true;
 IF v_org IS NULL THEN RAISE EXCEPTION 'tenant_users_forbidden' USING ERRCODE='42501'; END IF;
 IF p_user_ids IS NULL OR cardinality(p_user_ids) NOT BETWEEN 1 AND 100 OR array_position(p_user_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'tenant_users_invalid_input' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'user_id',p.user_id,
   'clientes',COALESCE((SELECT jsonb_agg(jsonb_build_object('cliente_id',c.id,'nome',c.nome,'principal',uc.principal,'status_cliente',c.status_cliente,
       'vigente',(uc.is_active AND uc.revoked_at IS NULL AND (uc.valid_from IS NULL OR uc.valid_from<=now()) AND (uc.valid_until IS NULL OR uc.valid_until>now())))
       ORDER BY uc.principal DESC,c.nome,c.id)
     FROM public.user_clientes uc JOIN public.clientes c ON c.id=uc.cliente_id AND c.organization_id=v_org WHERE uc.user_id=p.user_id),'[]'::jsonb),
   'parceiro',(SELECT jsonb_build_object('partner_id',pa.id,'razao_social',pa.razao_social,'papel',pu.papel,'ativo',(pa.ativo AND pa.deleted_at IS NULL))
     FROM public.partner_users pu JOIN public.partner_accounts pa ON pa.id=pu.partner_id AND pa.commercial_owner_organization_id=v_org WHERE pu.user_id=p.user_id ORDER BY pu.created_at,pu.id LIMIT 1),
   'parceiros_total',(SELECT count(*) FROM public.partner_users pu JOIN public.partner_accounts pa ON pa.id=pu.partner_id AND pa.commercial_owner_organization_id=v_org WHERE pu.user_id=p.user_id),
   'fora_do_alcance',(SELECT count(*) FROM public.user_clientes uc LEFT JOIN public.clientes c ON c.id=uc.cliente_id WHERE uc.user_id=p.user_id AND c.organization_id IS DISTINCT FROM v_org)
     +(SELECT count(*) FROM public.partner_users pu LEFT JOIN public.partner_accounts pa ON pa.id=pu.partner_id WHERE pu.user_id=p.user_id AND pa.commercial_owner_organization_id IS DISTINCT FROM v_org)
 ) ORDER BY p.user_id),'[]'::jsonb) INTO v_items
 FROM public.profiles p WHERE p.user_id=ANY(p_user_ids) AND p.organization_id=v_org AND NOT public.is_platform_superadmin(p.user_id);
 RETURN jsonb_build_object('items',v_items);
END $f$;
REVOKE ALL ON FUNCTION public.tenant_admin_user_links(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_admin_user_links(uuid[]) TO authenticated, service_role;