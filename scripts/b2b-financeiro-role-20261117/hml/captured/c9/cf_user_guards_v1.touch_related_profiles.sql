CREATE OR REPLACE FUNCTION cf_user_guards_v1.touch_related_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old_id uuid; new_id uuid; item uuid;
BEGIN
 IF TG_LEVEL<>'ROW' OR TG_RELID NOT IN ('public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF TG_OP<>'INSERT' THEN old_id:=OLD.user_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.user_id; END IF;
 FOR item IN SELECT DISTINCT x FROM unnest(ARRAY[old_id,new_id]) x WHERE x IS NOT NULL ORDER BY x LOOP UPDATE public.profiles SET updated_at=updated_at WHERE user_id=item; END LOOP;
 RETURN NULL;
END $function$
;
