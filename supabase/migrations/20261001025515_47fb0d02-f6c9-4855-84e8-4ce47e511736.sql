CREATE OR REPLACE FUNCTION public.platform_conclude_provisional_password()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $fn$
BEGIN
  UPDATE public.profiles
     SET senha_provisoria = false,
         updated_at = now()
   WHERE user_id = auth.uid()
     AND senha_provisoria = true;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.platform_conclude_provisional_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_conclude_provisional_password() TO authenticated;
