-- Campanhas vigentes do próprio produtor — ADITIVO, roda APÓS candidate.sql.review (prod) / hml/candidate-hml.sql.review (HML).
-- Causa (HML, JWT real, c6052055): commercial_campaign_clientes só tem camp_clientes_admin_all (admin/gestor_comercial);
-- o EXISTS de campanhas_cliente_select roda como o produtor e vê zero destinatários ⇒ zero campanhas.
-- Correção: helper privado SECURITY DEFINER booleano (identidade só por auth.uid(), devolve só true/false da campanha
-- consultada, nunca destinatários) + campanhas_cliente_select com vigência (data civil America/Sao_Paulo, inclusiva).
-- NÃO altera camp_clientes_admin_all, campanhas_admin_all, campanhas_partner_select nem concede SELECT em destinatários.
-- Somente revisão: o auditor aplica após preflight do ref. Rollback: campanhas-produtor-vigentes.rollback.sql.
BEGIN;
DO $pre$
DECLARE v_md5 text;
BEGIN
  PERFORM set_config('search_path', '"$user", public', true);
  SELECT md5(pg_get_expr(polqual, polrelid)) INTO v_md5 FROM pg_policy
   WHERE polrelid = 'public.commercial_campaigns'::regclass AND polname = 'campanhas_cliente_select';
  -- aceita: política segura do 9d3e83af (rev.6) ou esta mesma versão (reexecução idempotente)
  IF v_md5 IS NULL OR v_md5 NOT IN ('f1de982fb663a9759dd03ec9445057b4', '01f77b975427c8ddca65f31362b801e6') THEN
    RAISE EXCEPTION 'PRE drift: campanhas_cliente_select difere da rev.6 (9d3e83af) — aplique candidate primeiro (md5=%)', v_md5;
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.commercial_campaigns'::regclass) <> 3
     OR (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.commercial_campaign_clientes'::regclass) <> 1
     OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.commercial_campaign_clientes'::regclass AND polname = 'camp_clientes_admin_all')
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.commercial_campaign_clientes'::regclass) THEN
    RAISE EXCEPTION 'PRE drift: policies/RLS de campanhas ou destinatários diferem da captura de 17/11/2026';
  END IF;
  IF to_regprocedure('platform_private.h15_actor_organization()') IS NULL
     OR to_regprocedure('platform_private.has_role(uuid,public.app_role)') IS NULL
     OR to_regprocedure('public.get_cliente_ids_for_user(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRE: dependências ausentes';
  END IF;
END $pre$;

CREATE OR REPLACE FUNCTION platform_private.campaign_visible_to_own_producer_v1(p_campaign_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT auth.uid() IS NOT NULL
     AND platform_private.has_role(auth.uid(), 'cliente_produtor'::public.app_role)
     AND NOT platform_private.has_role(auth.uid(), 'consultor_tecnico'::public.app_role)
     AND NOT platform_private.has_role(auth.uid(), 'tecnico_agronomo'::public.app_role)
     AND EXISTS (
       SELECT 1
         FROM public.commercial_campaign_clientes cc
         JOIN public.clientes c      ON c.id = cc.cliente_id
         JOIN public.user_clientes uc ON uc.cliente_id = cc.cliente_id AND uc.user_id = auth.uid()
         JOIN public.profiles p      ON p.user_id = auth.uid()
        WHERE cc.campaign_id = p_campaign_id
          AND c.status_cliente::text = 'ativo'
          AND p.ativo IS TRUE
          AND p.organization_id = c.organization_id
          AND c.organization_id = platform_private.h15_actor_organization()   -- perfil/empresa ativos, acesso pronto
          AND uc.is_active IS TRUE AND uc.revoked_at IS NULL
          AND (uc.valid_from IS NULL OR uc.valid_from <= now())
          AND (uc.valid_until IS NULL OR uc.valid_until > now())
          AND uc.cliente_id = ANY (public.get_cliente_ids_for_user(auth.uid())));
$fn$;
REVOKE ALL ON FUNCTION platform_private.campaign_visible_to_own_producer_v1(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION platform_private.campaign_visible_to_own_producer_v1(uuid) TO authenticated;

ALTER POLICY campanhas_cliente_select ON public.commercial_campaigns USING (
  ativa
  AND (tipo_publico = ANY (ARRAY['comercial'::text, 'ambos'::text]))
  AND data_inicio <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND data_fim >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  AND platform_private.has_role(( SELECT auth.uid() AS uid), 'cliente_produtor'::public.app_role)
  AND platform_private.campaign_visible_to_own_producer_v1(id)
);

DO $post$ BEGIN
  PERFORM set_config('search_path', '"$user", public', true);
  IF (SELECT md5(pg_get_expr(polqual, polrelid)) FROM pg_policy WHERE polrelid = 'public.commercial_campaigns'::regclass AND polname = 'campanhas_cliente_select') <> '01f77b975427c8ddca65f31362b801e6'
     OR (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.commercial_campaign_clientes'::regclass) <> 1 THEN
    RAISE EXCEPTION 'POST: policy final divergente';
  END IF;
  IF has_function_privilege('anon', 'platform_private.campaign_visible_to_own_producer_v1(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'POST: anon com EXECUTE no helper';
  END IF;
END $post$;
COMMIT;
