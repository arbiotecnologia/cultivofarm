CREATE OR REPLACE FUNCTION public.fn_financial_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb; v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN v_old := to_jsonb(OLD);
  END IF;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES (TG_TABLE_NAME, COALESCE((NEW).id, (OLD).id), TG_OP, v_old, v_new, auth.uid());

  RETURN COALESCE(NEW, OLD);
END $function$
