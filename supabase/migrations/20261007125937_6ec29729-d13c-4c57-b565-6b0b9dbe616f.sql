-- Reutiliza integralmente o corpo vigente, locks, snapshots, ticket e auditoria.
DO $m$
DECLARE body text;
BEGIN
 body:=pg_get_functiondef('public.platform_transition_subscription(uuid,text,text,uuid,uuid)'::regprocedure);
 body:=replace(body,'FUNCTION public.platform_transition_subscription(', 'FUNCTION platform_private.transition_subscription_core(');
 body:=replace(body,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER');
 EXECUTE body;
END $m$;
REVOKE ALL ON FUNCTION platform_private.transition_subscription_core(uuid,text,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.transition_subscription_core(uuid,text,text,uuid,uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.platform_transition_subscription(_organization_id uuid, _action text, _reason text, _correlation_id uuid, _plan_version_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT platform_private.transition_subscription_core(_organization_id,_action,_reason,_correlation_id,_plan_version_id);
$f$;
REVOKE ALL ON FUNCTION public.platform_transition_subscription(uuid,text,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_transition_subscription(uuid,text,text,uuid,uuid) TO authenticated, service_role;
REVOKE UPDATE ON public.organization_subscriptions FROM authenticated;
-- Trial só é inicializado ao criar assinatura; change_plan preserva seu prazo.
CREATE OR REPLACE FUNCTION public.saas_subscription_require_published_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE v_status text; v_trial_days integer;
BEGIN
 IF NEW.plan_version_id IS NULL THEN RETURN NEW; END IF;
 SELECT status,trial_days INTO v_status,v_trial_days FROM public.saas_plan_versions WHERE id=NEW.plan_version_id;
 IF v_status IS DISTINCT FROM 'PUBLISHED' THEN RAISE EXCEPTION 'platform_invalid: assinatura exige versão publicada' USING ERRCODE='22023'; END IF;
 IF NEW.status='TRIAL' AND TG_OP='INSERT' THEN
  IF v_trial_days IS NULL THEN RAISE EXCEPTION 'platform_invalid: versão sem período de teste'; END IF;
  NEW.trial_ends_at:=coalesce(NEW.started_at,now())+make_interval(days=>v_trial_days);
 END IF;
 RETURN NEW;
END;
$f$;
REVOKE ALL ON FUNCTION public.saas_subscription_require_published_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saas_subscription_require_published_version() TO service_role;
-- Reversão controlada: reconstruir a entrada pública a partir de pg_get_functiondef do core,
-- substituir seu nome e retirar SECURITY DEFINER; restaurar o predicado original do trigger.
-- Isso reinstala os bloqueios anteriores e não deve ser usado como rollback operacional.