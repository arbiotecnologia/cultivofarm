CREATE OR REPLACE FUNCTION public.fn_cockpit_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$ SELECT encode(extensions.digest(p_payload::text, 'sha256'), 'hex') $$;

REVOKE ALL ON FUNCTION public.fn_cockpit_payload_hash(jsonb) FROM PUBLIC, anon, authenticated;