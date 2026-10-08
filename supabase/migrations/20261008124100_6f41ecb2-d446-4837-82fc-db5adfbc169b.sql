-- Canonical project: swzpzcwiasxmjutrmvkm. NOTIF-2/3 individual preferences only.
-- No data changes, global restoration, role changes or new grants.
CREATE OR REPLACE FUNCTION public.rpc_update_communication_preferences(
  p_canal public.comunicacao_canal, p_enabled boolean, p_whatsapp_opt_in boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_prev public.comunicacao_preferencias%rowtype;
BEGIN
  IF v_uid IS NULL OR NOT COALESCE(platform_private.platform_actor_access_ready(v_uid), false) THEN
    RAISE EXCEPTION 'COMMUNICATION_PREFERENCES_ACTOR_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  v_org := platform_private.h15_actor_organization();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'COMMUNICATION_PREFERENCES_ORGANIZATION_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_prev FROM public.comunicacao_preferencias WHERE user_id = v_uid AND canal = p_canal;
  INSERT INTO public.comunicacao_preferencias(user_id, canal, enabled,
      whatsapp_opt_in_at, whatsapp_opt_out_at, source)
  VALUES (v_uid, p_canal, COALESCE(p_enabled,true),
      CASE WHEN p_whatsapp_opt_in IS TRUE THEN now() END,
      CASE WHEN p_whatsapp_opt_in IS FALSE THEN now() END,
      'user')
  ON CONFLICT (user_id, canal) WHERE user_id IS NOT NULL DO UPDATE
    SET enabled = EXCLUDED.enabled,
        whatsapp_opt_in_at = CASE WHEN p_whatsapp_opt_in IS TRUE THEN now()
                                   ELSE public.comunicacao_preferencias.whatsapp_opt_in_at END,
        whatsapp_opt_out_at = CASE WHEN p_whatsapp_opt_in IS FALSE THEN now()
                                   ELSE public.comunicacao_preferencias.whatsapp_opt_out_at END,
        updated_at = now();
  IF p_whatsapp_opt_in IS FALSE THEN
    PERFORM public._comunicacao_write_consent(v_uid, NULL, p_canal, 'opt_out','user');
  ELSIF p_whatsapp_opt_in IS TRUE THEN
    PERFORM public._comunicacao_write_consent(v_uid, NULL, p_canal, 'opt_in','user');
  END IF;
  IF v_prev.id IS NULL OR v_prev.enabled IS DISTINCT FROM COALESCE(p_enabled,true) THEN
    PERFORM public._comunicacao_write_consent(v_uid, NULL, p_canal,
      CASE WHEN COALESCE(p_enabled,true) THEN 'enabled_on' ELSE 'enabled_off' END, 'user');
  END IF;
  RETURN jsonb_build_object('ok',true);
END $function$;
REVOKE ALL ON FUNCTION public.rpc_update_communication_preferences(public.comunicacao_canal,boolean,boolean) FROM PUBLIC, anon;
-- Preserve the authenticated/service_role ACL; do not regrant global RPCs.
DO $policy$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.comunicacao_preferencias'::regclass AND polname='notif3_preferences_active_individual') THEN
    CREATE POLICY notif3_preferences_active_individual ON public.comunicacao_preferencias
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (
        user_id = (SELECT auth.uid())
        AND (SELECT public.h15_actor_organization()) IS NOT NULL
        AND (cliente_id IS NULL OR EXISTS (
          SELECT 1 FROM public.clientes c
          WHERE c.id = comunicacao_preferencias.cliente_id
            AND c.organization_id = (SELECT public.h15_actor_organization())
            AND c.id = ANY(public.get_cliente_ids_for_user((SELECT auth.uid())))
        ))
      )
      WITH CHECK (
        user_id = (SELECT auth.uid())
        AND (SELECT public.h15_actor_organization()) IS NOT NULL
        AND (cliente_id IS NULL OR EXISTS (
          SELECT 1 FROM public.clientes c
          WHERE c.id = comunicacao_preferencias.cliente_id
            AND c.organization_id = (SELECT public.h15_actor_organization())
            AND c.id = ANY(public.get_cliente_ids_for_user((SELECT auth.uid())))
        ))
      );
  END IF;
END $policy$;