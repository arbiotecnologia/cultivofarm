-- Corpos exatos pg_get_functiondef read-only em produção 18/10/2026. NÃO EXECUTAR.
CREATE OR REPLACE FUNCTION public.get_user_partner_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid() LIMIT 1;
$function$

CREATE OR REPLACE FUNCTION public.get_partner_papel(_user_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT papel FROM public.partner_users WHERE user_id = _user_id LIMIT 1;
$function$

CREATE OR REPLACE FUNCTION public.get_b2b_user_role_for_partner(p_user_id uuid, p_partner_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(p_user_id, 'parceiro_b2b_tecnico'::app_role) THEN 'parceiro_b2b_tecnico'
    WHEN public.has_role(p_user_id, 'parceiro_b2b'::app_role) THEN 'parceiro_b2b'
    ELSE NULL
  END
  FROM public.partner_users pu
  WHERE pu.user_id = p_user_id AND pu.partner_id = p_partner_id
  LIMIT 1;
$function$

CREATE OR REPLACE FUNCTION public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id = pu.partner_id
    WHERE pu.user_id = p_user_id
      AND pu.partner_id = p_partner_id
      AND pa.ativo = true
      AND (
        public.has_role(p_user_id, 'parceiro_b2b'::app_role)
        OR public.has_role(p_user_id, 'parceiro_b2b_tecnico'::app_role)
      )
  );
$function$
