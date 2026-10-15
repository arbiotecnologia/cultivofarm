DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.laboratorio_esteira_eventos'::regclass AND relrowsecurity) OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.cockpit_operacao_idempotencia'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'EXPECTED_RLS'; END IF;
 IF NOT has_table_privilege('service_role','public.laboratorio_esteira_eventos','SELECT,INSERT,UPDATE,DELETE') OR NOT has_table_privilege('service_role','public.cockpit_operacao_idempotencia','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'EXPECTED_SERVICE_ACCESS'; END IF;
END $guard$;
REVOKE ALL ON TABLE public.laboratorio_esteira_eventos, public.cockpit_operacao_idempotencia FROM PUBLIC, anon, authenticated;
DO $check$
DECLARE t text; r text;
BEGIN
 FOREACH t IN ARRAY ARRAY['public.laboratorio_esteira_eventos','public.cockpit_operacao_idempotencia'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN RAISE EXCEPTION 'PUBLIC_ACCESS_REMAINS'; END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role',t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'SERVICE_ACCESS_CHANGED'; END IF;
 END LOOP;
END $check$;