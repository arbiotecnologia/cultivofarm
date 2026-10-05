BEGIN;
ALTER FUNCTION public.get_my_entitlement_context() SECURITY INVOKER;
COMMIT;