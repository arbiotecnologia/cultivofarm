CREATE OR REPLACE FUNCTION platform_private.b2b_resolve_condition(p_partner uuid, p_plan uuid, p_choice jsonb, p_lock boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE org uuid; c platform_private.b2b_condition_versions; choice jsonb; pm record; pl record; ok boolean;
BEGIN
 org:=platform_private.b2b_condition_seller(p_partner); choice:=platform_private.b2b_choice(p_choice);
 IF p_lock THEN
  -- Ordem: versão -> atribuição -> plano -> atribuição comercial publicada -> meio -> categoria (FOR SHARE).
  -- Escritores (publish/retire/assign) travam a versão FOR UPDATE: revogação concorrente espera ou é vista abaixo.
  PERFORM 1 FROM platform_private.b2b_condition_versions v WHERE v.organization_id=org AND v.plan_id=p_plan
    AND v.version=(choice->>'payment_condition_version')::int AND v.method=choice->>'payment_method' FOR SHARE;
  PERFORM 1 FROM platform_private.b2b_condition_assignments a WHERE a.organization_id=org AND a.partner_id=p_partner AND a.plan_id=p_plan
    AND a.version=(choice->>'payment_condition_version')::int AND a.method=choice->>'payment_method' FOR SHARE;
  PERFORM 1 FROM public.commercial_payment_plans p WHERE p.id=p_plan FOR SHARE;
  PERFORM 1 FROM public.commercial_payment_plan_assignments x WHERE x.plan_id=p_plan AND x.partner_id=p_partner AND x.buyer_scope='partner' AND x.status='published' FOR SHARE;
  PERFORM 1 FROM public.payment_methods m JOIN platform_private.b2b_condition_versions v ON v.payment_method_id=m.id WHERE v.organization_id=org AND v.plan_id=p_plan
    AND v.version=(choice->>'payment_condition_version')::int AND v.method=choice->>'payment_method' FOR SHARE OF m;
  PERFORM 1 FROM public.financial_categories k JOIN platform_private.b2b_condition_versions v ON v.category_id=k.id WHERE v.organization_id=org AND v.plan_id=p_plan
    AND v.version=(choice->>'payment_condition_version')::int AND v.method=choice->>'payment_method' FOR SHARE OF k;
  -- Reler a autoridade do ator DEPOIS das esperas (papel/perfil/vínculo podem ter mudado).
  IF platform_private.b2b_condition_seller(p_partner) IS DISTINCT FROM org THEN RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT v.* INTO c FROM platform_private.b2b_condition_versions v
 JOIN platform_private.b2b_condition_assignments a USING(organization_id,plan_id,version,method)
 JOIN public.commercial_payment_plans p ON p.id=v.plan_id AND p.active IS TRUE
 WHERE a.partner_id=p_partner AND v.organization_id=org AND v.plan_id=p_plan
 AND v.version=(choice->>'payment_condition_version')::int AND v.method=choice->>'payment_method'
 AND v.deadline_days=(choice->>'payment_deadline_days')::int AND v.configuration_approved IS TRUE
 AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_condition_assignment_revocations x WHERE (x.organization_id,x.partner_id,x.plan_id,x.version,x.method)=(a.organization_id,a.partner_id,a.plan_id,a.version,a.method))
 AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_condition_retirements r WHERE (r.organization_id,r.plan_id,r.version,r.method)=(v.organization_id,v.plan_id,v.version,v.method));
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM platform_private.b2b_condition_versions n WHERE n.organization_id=org AND n.plan_id=p_plan AND n.method=choice->>'payment_method'
            AND n.version>(choice->>'payment_condition_version')::int) THEN RAISE EXCEPTION 'payment_condition_stale' USING ERRCODE='PT409'; END IF;
  RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409';
 END IF;
 SELECT m.id,m.name,m.active INTO pm FROM public.payment_methods m WHERE m.id=c.payment_method_id;
 IF pm.id IS NULL OR pm.active IS NOT TRUE THEN RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.financial_categories k WHERE k.id=c.category_id AND k.active IS TRUE AND upper(btrim(k.type))='RECEITA') THEN
  RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;
 SELECT p.max_days,p.monthly_interest_percent,p.superseded_by_id INTO pl FROM public.commercial_payment_plans p WHERE p.id=p_plan;
 IF pl.superseded_by_id IS NOT NULL THEN RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;
 IF COALESCE(pl.monthly_interest_percent,0)<>0 THEN RAISE EXCEPTION 'payment_condition_plan_interest_conflict' USING ERRCODE='PT409'; END IF;
 IF c.deadline_days>COALESCE(pl.max_days,0) THEN RAISE EXCEPTION 'payment_condition_deadline_exceeds_plan' USING ERRCODE='PT409'; END IF;
 ok:=EXISTS(SELECT 1 FROM public.commercial_payment_plan_assignments x WHERE x.plan_id=p_plan AND x.partner_id=p_partner AND x.buyer_scope='partner'
   AND x.status='published' AND x.valid_from<=CURRENT_DATE AND (x.valid_until IS NULL OR x.valid_until>=CURRENT_DATE));
 IF NOT ok THEN RAISE EXCEPTION 'payment_condition_unavailable' USING ERRCODE='PT409'; END IF;
 PERFORM platform_private.c2_owner_order_guard(auth.uid(),p_partner,p_plan);
 RETURN to_jsonb(c)-'approved_by'-'approved_at'-'created_at'-'configuration_approved'-'calendar_version' || jsonb_build_object('payment_method_name',pm.name);
END $function$
