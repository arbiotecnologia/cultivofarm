-- Rollback de campanhas-produtor-vigentes.sql: restaura EXATAMENTE a política segura do 9d3e83af (rev.6)
-- e depois remove o helper. Nunca restaura a expressão pré-rev.6 (leitura comercial por vínculo de consultor).
-- Efeito conhecido: volta o defeito de HML (produtor vê zero campanhas) — negação segura, sem vazamento.
BEGIN;
ALTER POLICY campanhas_cliente_select ON public.commercial_campaigns USING (
  (ativa AND (tipo_publico = ANY (ARRAY['comercial'::text, 'ambos'::text])) AND (EXISTS ( SELECT 1
   FROM (public.commercial_campaign_clientes cc
     JOIN public.user_clientes uc ON ((uc.cliente_id = cc.cliente_id)))
  WHERE ((cc.campaign_id = commercial_campaigns.id) AND (uc.user_id = ( SELECT auth.uid() AS uid)) AND (uc.cliente_id = ANY (public.get_cliente_ids_for_user(( SELECT auth.uid() AS uid)))) AND (EXISTS ( SELECT 1
           FROM public.clientes c
          WHERE ((c.id = cc.cliente_id) AND (c.organization_id = public.h15_actor_organization()))))))))
  AND platform_private.has_role(( SELECT auth.uid() AS uid), 'cliente_produtor'::public.app_role)
  AND NOT platform_private.has_role(( SELECT auth.uid() AS uid), 'consultor_tecnico'::public.app_role)
  AND NOT platform_private.has_role(( SELECT auth.uid() AS uid), 'tecnico_agronomo'::public.app_role)
);
DO $post$ BEGIN
  PERFORM set_config('search_path', '"$user", public', true);
  IF (SELECT md5(pg_get_expr(polqual, polrelid)) FROM pg_policy WHERE polrelid = 'public.commercial_campaigns'::regclass AND polname = 'campanhas_cliente_select') <> 'f1de982fb663a9759dd03ec9445057b4' THEN
    RAISE EXCEPTION 'rollback: política não coincide com a rev.6 segura';
  END IF;
END $post$;
DROP FUNCTION IF EXISTS platform_private.campaign_visible_to_own_producer_v1(uuid);
COMMIT;
