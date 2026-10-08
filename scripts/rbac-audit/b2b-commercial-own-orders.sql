-- Minimal own-order read. No amounts, internal notes, clients, files or writes.
CREATE OR REPLACE FUNCTION platform_private.b2b_commercial_own_orders()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $f$
DECLARE c jsonb; result jsonb;
BEGIN
 c:=platform_private.b2b_commercial_context();
 IF c IS NULL OR c->>'role'<>'parceiro_b2b' THEN
  RAISE EXCEPTION 'b2b_own_orders_forbidden' USING ERRCODE='42501';
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',q.id,'numero',q.numero,
  'status',q.status,'created_at',q.created_at) ORDER BY q.created_at DESC,q.id),'[]'::jsonb)
 INTO result FROM (
  SELECT o.id,o.numero,o.status,o.created_at FROM public.partner_orders o
  JOIN public.partner_accounts pa ON pa.id=o.partner_id
  WHERE o.partner_id=(c->>'partner_id')::uuid
   AND pa.commercial_owner_organization_id=(c->>'commercial_owner_organization_id')::uuid
   AND pa.ativo IS TRUE AND pa.deleted_at IS NULL
  ORDER BY o.created_at DESC,o.id LIMIT 100
 ) q;
 RETURN jsonb_build_object('partner_id',c->>'partner_id','orders',result);
END $f$;
REVOKE ALL ON FUNCTION platform_private.b2b_commercial_own_orders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.b2b_commercial_own_orders() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_my_commercial_orders_projection()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT platform_private.b2b_commercial_own_orders();
$f$;
REVOKE ALL ON FUNCTION public.get_my_commercial_orders_projection() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_commercial_orders_projection() TO authenticated,service_role;