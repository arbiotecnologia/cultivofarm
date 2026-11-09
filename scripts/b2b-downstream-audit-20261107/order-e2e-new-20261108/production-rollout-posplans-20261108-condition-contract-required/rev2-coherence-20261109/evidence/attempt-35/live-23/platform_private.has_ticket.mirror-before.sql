CREATE OR REPLACE FUNCTION platform_private.has_ticket(_scope text, _target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM platform_private.authz_tickets
                 WHERE txid = txid_current() AND scope = _scope AND target = _target);
$function$
