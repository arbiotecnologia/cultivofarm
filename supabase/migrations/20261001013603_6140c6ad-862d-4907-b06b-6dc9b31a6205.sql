CREATE OR REPLACE FUNCTION public.saas_subscription_audit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old jsonb; v_new jsonb; v_reason text;
BEGIN
  v_new := to_jsonb(NEW);
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    IF v_old = v_new THEN RETURN NEW; END IF;
  END IF;
  v_reason := nullif(current_setting('app.saas_change_reason', true), '');
  INSERT INTO public.organization_subscription_history
    (subscription_id, organization_id, actor_user_id, source, reason, old_values, new_values)
  VALUES
    (NEW.id, NEW.organization_id, auth.uid(),
     CASE WHEN v_reason IS NULL THEN 'trigger' ELSE 'rpc' END,
     COALESCE(v_reason, CASE WHEN TG_OP = 'INSERT' THEN 'subscription_created' ELSE 'subscription_updated' END),
     v_old, v_new);
  RETURN NEW;
END;
$function$;