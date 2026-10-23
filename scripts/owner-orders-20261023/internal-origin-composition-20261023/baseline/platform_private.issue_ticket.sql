CREATE OR REPLACE FUNCTION platform_private.issue_ticket(_scope text, _target uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  INSERT INTO platform_private.authz_tickets(txid, scope, target)
  VALUES (txid_current(), _scope, _target) ON CONFLICT DO NOTHING;
$function$
