CREATE OR REPLACE FUNCTION public.b2b_payment_condition_config_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE='42501'; END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL OR public.is_platform_superadmin(v_uid) IS NOT FALSE
     OR NOT (public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE
             OR public.has_role(v_uid,'gestor_comercial'::public.app_role) IS TRUE)
     OR public.has_role(v_uid,'parceiro_b2b'::public.app_role) IS NOT FALSE OR public.has_role(v_uid,'parceiro_b2b_tecnico'::public.app_role) IS NOT FALSE THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('contract','B2B_PAYMENT_CONDITION_V1','organization_id', v_org,
    'can_edit', public.has_role(v_uid,'administrador'::public.app_role) IS TRUE OR public.has_role(v_uid,'financeiro'::public.app_role) IS TRUE,
    'can_activate', public.has_role(v_uid,'administrador'::public.app_role) IS TRUE,
    'default_deadline_days', 30,
    'activation', COALESCE((SELECT to_jsonb(g) - 'updated_by' FROM platform_private.b2b_condition_activation g WHERE g.organization_id = v_org),
                           jsonb_build_object('mode','off','pilot_partner_ids','[]'::jsonb,'version',0)),
    'conditions', COALESCE((SELECT jsonb_agg(jsonb_build_object('plan_id',v.plan_id,'method',v.method,'version',v.version,'deadline_days',v.deadline_days,
        'installment_count',v.installment_count,'monthly_rate',v.monthly_rate,'payment_method_id',v.payment_method_id,'category_id',v.category_id,
        'approved_at',v.approved_at,
        'retired',EXISTS (SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(v.organization_id,v.plan_id,v.version,v.method)),
        'partner_ids',COALESCE((SELECT jsonb_agg(a.partner_id ORDER BY a.partner_id) FROM platform_private.b2b_condition_assignments a
            WHERE (a.organization_id,a.plan_id,a.version,a.method)=(v.organization_id,v.plan_id,v.version,v.method)
              AND NOT EXISTS (SELECT 1 FROM platform_private.b2b_condition_assignment_revocations x WHERE (x.organization_id,x.partner_id,x.plan_id,x.version,x.method)=(a.organization_id,a.partner_id,a.plan_id,a.version,a.method))),'[]'::jsonb))
        ORDER BY v.plan_id, v.method)
      FROM platform_private.b2b_condition_versions v
     WHERE v.organization_id = v_org AND v.version = (SELECT max(w.version) FROM platform_private.b2b_condition_versions w WHERE w.organization_id=v.organization_id AND w.plan_id=v.plan_id AND w.method=v.method)), '[]'::jsonb),
    'catalog', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pm.id, 'name', pm.name) ORDER BY pm.name) FROM public.payment_methods pm WHERE pm.active IS TRUE), '[]'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name) ORDER BY k.name) FROM public.financial_categories k WHERE k.active IS TRUE AND upper(btrim(k.type))='RECEITA'), '[]'::jsonb),
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code, 'max_days', p.max_days, 'monthly_interest_percent', p.monthly_interest_percent) ORDER BY p.name)
               FROM public.commercial_payment_plans p WHERE p.active IS TRUE AND p.superseded_by_id IS NULL), '[]'::jsonb),
    'partners', COALESCE((SELECT jsonb_agg(a.id ORDER BY a.id) FROM public.partner_accounts a WHERE a.commercial_owner_organization_id = v_org AND a.ativo IS TRUE), '[]'::jsonb));
END $function$
