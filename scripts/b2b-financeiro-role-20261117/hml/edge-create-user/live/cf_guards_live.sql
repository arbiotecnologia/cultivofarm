CREATE OR REPLACE FUNCTION cf_user_guards_v1.advance_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond'); RETURN NEW; END $function$
;
CREATE OR REPLACE FUNCTION cf_user_guards_v1.require_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_LEVEL<>'STATEMENT' OR TG_RELID NOT IN ('public.profiles'::regclass,'public.user_roles'::regclass) THEN RAISE EXCEPTION 'invalid_user_guard_context' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r USING(user_id) WHERE p.ativo IS TRUE AND r.role='administrador') THEN RAISE EXCEPTION 'user_last_active_admin' USING ERRCODE='PT409'; END IF;
 RETURN NULL;
END $function$
;
