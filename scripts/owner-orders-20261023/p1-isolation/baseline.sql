CREATE OR REPLACE FUNCTION public.tg_governance_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_partner uuid;
BEGIN
  v_partner := CASE WHEN TG_TABLE_NAME='partner_financial_settings' THEN COALESCE(NEW.partner_id, OLD.partner_id) ELSE NULL END;
  INSERT INTO financial_governance_audit_log(usuario_id, partner_id, acao, dados_anteriores, dados_novos)
  VALUES (auth.uid(), v_partner,
    TG_TABLE_NAME || '_' || lower(TG_OP),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.has_role(_user_id,_role); $function$
;

CREATE OR REPLACE FUNCTION public.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.h15_actor_organization(); $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_archive_assignment(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) = 0 THEN RAISE EXCEPTION 'motivo_required'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='archived', archived_by=auth.uid(), archived_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status <> 'archived';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'archive',NULL,NULL,p_motivo);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_list_assignments(p_status text DEFAULT NULL::text)
 RETURNS SETOF commercial_payment_plan_assignments
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY SELECT * FROM public.commercial_payment_plan_assignments a
    WHERE (p_status IS NULL OR a.status = p_status)
    ORDER BY a.created_at DESC;
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_publish_assignment(p_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_publish(auth.uid()) THEN RAISE EXCEPTION 'not_authorized_publish'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='published', published_by=auth.uid(), published_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status IN ('draft','pending_approval');
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'publish',NULL,NULL,p_motivo);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_submit_assignment(p_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.commercial_payment_plan_assignments
     SET status='pending_approval', submitted_by=auth.uid(), submitted_at=now(), updated_by=auth.uid()
   WHERE id=p_id AND status='draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  PERFORM public.fn_cc_audit('assignment',p_id,'submit',NULL,NULL,p_motivo);
END $function$
;

CREATE OR REPLACE FUNCTION public.rpc_cc_upsert_assignment(p_id uuid, p_plan_id uuid, p_buyer_scope text, p_partner_id uuid, p_customer_id uuid, p_valid_from date, p_valid_until date, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_before jsonb;
BEGIN
  IF NOT public.fn_cc_can_prepare(auth.uid()) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.commercial_payment_plan_assignments
      (plan_id,buyer_scope,partner_id,customer_id,valid_from,valid_until,motivo,created_by,updated_by)
    VALUES (p_plan_id,p_buyer_scope,p_partner_id,p_customer_id,
            COALESCE(p_valid_from,CURRENT_DATE),p_valid_until,p_motivo,auth.uid(),auth.uid())
    RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('assignment',v_id,'create',NULL,
      to_jsonb((SELECT a FROM public.commercial_payment_plan_assignments a WHERE a.id=v_id)),p_motivo);
  ELSE
    SELECT to_jsonb(a) INTO v_before FROM public.commercial_payment_plan_assignments a WHERE a.id=p_id;
    IF v_before IS NULL THEN RAISE EXCEPTION 'assignment_not_found'; END IF;
    IF (v_before->>'status') <> 'draft' THEN RAISE EXCEPTION 'assignment_not_editable'; END IF;
    UPDATE public.commercial_payment_plan_assignments
       SET plan_id=p_plan_id, buyer_scope=p_buyer_scope, partner_id=p_partner_id, customer_id=p_customer_id,
           valid_from=COALESCE(p_valid_from,valid_from), valid_until=p_valid_until,
           motivo=p_motivo, updated_by=auth.uid()
     WHERE id=p_id RETURNING id INTO v_id;
    PERFORM public.fn_cc_audit('assignment',v_id,'update',v_before,
      to_jsonb((SELECT a FROM public.commercial_payment_plan_assignments a WHERE a.id=v_id)),p_motivo);
  END IF;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.is_platform_superadmin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id AND r.role = 'superadmin'::public.app_role
  )
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cc_audit(p_entity text, p_entity_id uuid, p_action text, p_before jsonb, p_after jsonb, p_motivo text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.commercial_condition_audit_log(entity, entity_id, action, actor_id, before_data, after_data, motivo)
  VALUES (p_entity, p_entity_id, p_action, auth.uid(), p_before, p_after, p_motivo);
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cc_can_prepare(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_uid IS NOT NULL AND (
    public.has_role(p_uid,'administrador'::app_role) OR
    public.has_role(p_uid,'financeiro'::app_role) OR
    public.has_role(p_uid,'gestor_comercial'::app_role));
$function$
;

CREATE OR REPLACE FUNCTION public.fn_cc_can_publish(p_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_uid IS NOT NULL AND (
    public.has_role(p_uid,'administrador'::app_role) OR
    public.has_role(p_uid,'financeiro'::app_role));
$function$
;

CREATE OR REPLACE FUNCTION public.tg_commercial_conditions_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_pfs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$
;

CREATE OR REPLACE FUNCTION platform_private.platform_actor_access_ready(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE)
 AND NOT EXISTS(SELECT 1 FROM public.platform_org_admin_invites i WHERE i.user_id=p_user AND (i.access_operation_status='processing' OR (i.access_valid_after IS NOT NULL AND auth.uid()=p_user AND to_timestamp(COALESCE((auth.jwt()->>'iat')::bigint,0))<=i.access_valid_after)));
$function$
;

CREATE OR REPLACE FUNCTION platform_private.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id);
$function$
;
