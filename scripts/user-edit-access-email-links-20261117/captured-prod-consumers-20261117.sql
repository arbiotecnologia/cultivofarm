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
-- Estrutura capturada 17/11/2026: data_inicio/data_fim date NOT NULL (defaults SÓ do harness, para fixtures antigas).
CREATE TABLE public.commercial_campaigns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ativa boolean, tipo_publico text, nome text NOT NULL DEFAULT 'campanha', descricao text, created_by uuid,
  data_inicio date NOT NULL DEFAULT (current_date - 1), data_fim date NOT NULL DEFAULT (current_date + 30));
CREATE TABLE public.commercial_campaign_clientes (campaign_id uuid, cliente_id uuid, created_at timestamptz DEFAULT now());
-- Capturado 17/11/2026 (pg_policies): única policy de destinatários — reproduz o defeito de HML (produtor vê zero).
ALTER TABLE public.commercial_campaign_clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY camp_clientes_admin_all ON public.commercial_campaign_clientes FOR ALL TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS status_cliente text NOT NULL DEFAULT 'ativo'; -- enum cliente_status em produção
-- Capturado verbatim 17/11/2026 (rev.6; antes era sintético):
CREATE OR REPLACE FUNCTION platform_private.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id);
$function$
;
CREATE FUNCTION public.get_user_partner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$ SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid() AND revoked_at IS NULL LIMIT 1 $$; -- SINTÉTICO
CREATE TABLE public.commercial_campaign_partners (campaign_id uuid, partner_id uuid); -- SINTÉTICA
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
-- rev.6: as outras duas policies de commercial_campaigns, verbatim (produção tem exatamente 3).
CREATE POLICY campanhas_admin_all ON public.commercial_campaigns FOR ALL TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role))) WITH CHECK ((platform_private.has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR platform_private.has_role(( SELECT auth.uid() AS uid), 'gestor_comercial'::app_role)));
CREATE POLICY campanhas_partner_select ON public.commercial_campaigns FOR SELECT TO authenticated USING ((platform_private.has_role(( SELECT auth.uid() AS uid), 'parceiro_b2b'::app_role) AND ativa AND (tipo_publico = ANY (ARRAY['b2b'::text, 'ambos'::text])) AND (EXISTS ( SELECT 1
   FROM commercial_campaign_partners cp
  WHERE ((cp.campaign_id = commercial_campaigns.id) AND (cp.partner_id = get_user_partner_id()))))));
GRANT SELECT ON public.accounts_receivable, public.commercial_campaigns, public.commercial_campaign_clientes, public.commercial_campaign_partners TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_partner_id() TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.h15_actor_organization() TO authenticated;
