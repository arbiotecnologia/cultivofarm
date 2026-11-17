-- "Minhas campanhas" do portal do produtor — ADITIVO, roda APÓS campanhas-produtor-vigentes.sql.
-- Projeção somente leitura: devolve EXCLUSIVAMENTE campanhas vigentes atribuídas ao titular (auth.uid()),
-- mesmo quando perfis cumulativos (ex.: administrador/gestor_comercial) ampliam o SELECT de commercial_campaigns.
-- SECURITY INVOKER: a RLS do chamador continua aplicada; o filtro de titular usa o helper DEFINER booleano.
-- Campos: id, nome, descricao, data_inicio, data_fim. Nunca destinatários, autoria ou flags administrativas.
-- Somente revisão: o auditor aplica. Rollback: campanhas-produtor-minhas-rpc.rollback.sql (antes do rollback do vigentes).
BEGIN;
DO $pre$ BEGIN
  IF to_regprocedure('platform_private.campaign_visible_to_own_producer_v1(uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRE: aplique campanhas-produtor-vigentes.sql antes';
  END IF;
END $pre$;
CREATE OR REPLACE FUNCTION public.producer_my_campaigns_v1(p_offset integer DEFAULT 0, p_limit integer DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; v_total bigint; v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'invalid_page' USING ERRCODE = '22023';
  END IF;
  WITH mine AS (
    SELECT c.id, c.nome, c.descricao, c.data_inicio, c.data_fim
      FROM public.commercial_campaigns c
     WHERE c.ativa AND c.tipo_publico IN ('comercial','ambos')
       AND c.data_inicio <= v_today AND c.data_fim >= v_today
       AND platform_private.campaign_visible_to_own_producer_v1(c.id))
  SELECT (SELECT count(*) FROM mine),
         COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome, 'descricao', m.descricao,
                     'data_inicio', m.data_inicio, 'data_fim', m.data_fim) ORDER BY m.data_fim, m.nome, m.id)
                     FROM (SELECT * FROM mine ORDER BY data_fim, nome, id OFFSET p_offset LIMIT p_limit) m), '[]'::jsonb)
    INTO v_total, v_items;
  RETURN jsonb_build_object('total', v_total, 'offset', p_offset, 'limit', p_limit, 'items', v_items);
END $fn$;
REVOKE ALL ON FUNCTION public.producer_my_campaigns_v1(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.producer_my_campaigns_v1(integer, integer) TO authenticated;
COMMIT;
