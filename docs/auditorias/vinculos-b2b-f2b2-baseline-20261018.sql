-- Baseline produção swzpzcwiasxmjutrmvkm, SELECT em 18/10/2026. NÃO INSTALAR.
-- MD5 pg_get_functiondef: 4dc955897950bf70ee8e1072bbae1ff2; postgres, DEFINER, search_path public.
-- ACL: postgres/service_role EXECUTE; anon/authenticated não.
CREATE OR REPLACE FUNCTION public.sync_puc_to_ptc_fn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.assignment_type = 'tecnico'
     AND (NEW.user_role = 'parceiro_b2b_tecnico' OR public.has_role(NEW.user_id, 'parceiro_b2b_tecnico'::app_role))
  THEN
    INSERT INTO public.partner_technician_clients (partner_id, technician_user_id, cliente_id, assigned_by, active, notes)
    VALUES (NEW.partner_id, NEW.user_id, NEW.cliente_id, NEW.assigned_by, NEW.active, NEW.notes)
    ON CONFLICT (partner_id, technician_user_id, cliente_id)
    DO UPDATE SET active = EXCLUDED.active, updated_at = now(), notes = EXCLUDED.notes;
  END IF;
  RETURN NEW;
END;
$function$;
