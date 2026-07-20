REVOKE ALL ON FUNCTION public.refresh_esteira_laboratorio() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_esteira_laboratorio() TO service_role;