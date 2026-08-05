CREATE OR REPLACE FUNCTION public.rpc_certificacao_catalogo(
  p_functions text[] DEFAULT '{}'::text[],
  p_tables text[] DEFAULT '{}'::text[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'functions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', p.proname,
        'identity_args', pg_get_function_identity_arguments(p.oid),
        'owner', pg_get_userbyid(p.proowner),
        'security_definer', p.prosecdef,
        'config', COALESCE(array_to_string(p.proconfig, ','), ''),
        'acl', COALESCE(array_to_string(p.proacl::text[], ' | '), 'DEFAULT'),
        'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'public_execute', p.proacl IS NULL OR EXISTS (
          SELECT 1 FROM unnest(p.proacl::text[]) a WHERE a LIKE '=%'
        ),
        'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        'md5', md5(pg_get_functiondef(p.oid))
      ))
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY(p_functions)
    ), '[]'::jsonb),
    'triggers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'table', c.relname,
        'trigger', t.tgname,
        'enabled', t.tgenabled
      ))
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT t.tgisinternal AND c.relname = ANY(p_tables)
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.rpc_certificacao_catalogo(text[], text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_certificacao_catalogo(text[], text[]) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_certificacao_catalogo(text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_certificacao_catalogo(text[], text[]) TO service_role;