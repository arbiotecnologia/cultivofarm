-- CAPTURA VERBATIM (somente leitura) de swzpzcwiasxmjutrmvkm, 17/11/2026: leitores de escopo de cliente usados
-- nas fotos "financeiro/comercial negado". Políticas: ar_producer_read (accounts_receivable) e
-- campanhas_cliente_select (commercial_campaigns), expressões copiadas de pg_get_expr(polqual).
CREATE OR REPLACE FUNCTION public.fn_authz_uid_scope_ok(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NULL
      OR (_uid IS NOT NULL AND _uid = auth.uid())
      OR public.has_role(auth.uid(), 'administrador'::app_role);
$function$
;
CREATE OR REPLACE FUNCTION public.get_cliente_ids_for_user(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.fn_authz_uid_scope_ok(_user_id) THEN ARRAY(
    SELECT uc.cliente_id
      FROM public.user_clientes uc
     WHERE uc.user_id = _user_id
       AND uc.is_active = true
       AND uc.revoked_at IS NULL
       AND (uc.valid_from IS NULL OR uc.valid_from <= now())
       AND (uc.valid_until IS NULL OR uc.valid_until >= now())
    UNION
    SELECT pr.cliente_id
      FROM public.profiles pr
     WHERE pr.user_id = _user_id
       AND pr.cliente_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.user_clientes uc2
          WHERE uc2.user_id = pr.user_id
            AND uc2.cliente_id = pr.cliente_id
            AND uc2.is_active = true
            AND uc2.revoked_at IS NULL
            AND (uc2.valid_from IS NULL OR uc2.valid_from <= now())
            AND (uc2.valid_until IS NULL OR uc2.valid_until >= now())
       )
  ) ELSE ARRAY[]::uuid[] END;
$function$
;
CREATE OR REPLACE FUNCTION public.has_active_user_cliente_access(_user_id uuid, _cliente_id uuid, _levels text[] DEFAULT ARRAY['read'::text, 'execute'::text, 'manage'::text])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.fn_authz_uid_scope_ok(_user_id) THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'administrador'::public.app_role) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.user_clientes uc
     WHERE uc.user_id = _user_id
       AND uc.cliente_id = _cliente_id
       AND uc.is_active = true
       AND uc.revoked_at IS NULL
       AND (uc.valid_from IS NULL OR uc.valid_from <= now())
       AND (uc.valid_until IS NULL OR uc.valid_until >= now())
       AND uc.access_level::text = ANY(_levels)
  );
END
$function$
;
-- Tabelas consumidoras: SINTÉTICAS (só colunas usadas pelas políticas); políticas verbatim.
CREATE TABLE public.accounts_receivable (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_id uuid, partner_id uuid, origin_type text);
ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_producer_read ON public.accounts_receivable FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'cliente_produtor'::app_role) AND (customer_id = ANY (get_cliente_ids_for_user(( SELECT auth.uid() AS uid)))) AND (partner_id IS NULL) AND (origin_type IS DISTINCT FROM 'B2B_ORDER'::text)));
CREATE TABLE public.commercial_campaigns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ativa boolean, tipo_publico text);
CREATE TABLE public.commercial_campaign_clientes (campaign_id uuid, cliente_id uuid);
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$ SELECT organization_id FROM public.profiles WHERE user_id = auth.uid() $$; -- SINTÉTICO
CREATE OR REPLACE FUNCTION public.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ SELECT platform_private.h15_actor_organization(); $function$
;
ALTER TABLE public.commercial_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campanhas_cliente_select ON public.commercial_campaigns FOR SELECT TO authenticated USING ((ativa AND (tipo_publico = ANY (ARRAY['comercial'::text, 'ambos'::text])) AND (EXISTS ( SELECT 1
   FROM (commercial_campaign_clientes cc
     JOIN user_clientes uc ON ((uc.cliente_id = cc.cliente_id)))
  WHERE ((cc.campaign_id = commercial_campaigns.id) AND (uc.user_id = ( SELECT auth.uid() AS uid)) AND (uc.cliente_id = ANY (get_cliente_ids_for_user(( SELECT auth.uid() AS uid)))) AND (EXISTS ( SELECT 1
           FROM clientes c
          WHERE ((c.id = cc.cliente_id) AND (c.organization_id = h15_actor_organization())))))))));
GRANT SELECT ON public.accounts_receivable, public.commercial_campaigns, public.commercial_campaign_clientes TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.h15_actor_organization() TO authenticated;
