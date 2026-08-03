
CREATE OR REPLACE FUNCTION public.rpc_harness_purge_entregas_v1(p_entrega_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ref text;
  v_bad int;
  v_out jsonb;
BEGIN
  -- Guarda de ambiente: proibido fora do staging identificado.
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'harness_guard: ambiente nao identificado';
  END IF;
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker = 'STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'harness_guard: somente staging';
  END IF;

  IF p_entrega_ids IS NULL OR array_length(p_entrega_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('purgadas', 0);
  END IF;

  -- Somente fixtures marcadas: a própria entrega ou sua origem de reentrega.
  SELECT count(*)::int INTO v_bad
    FROM public.entregas e
   WHERE e.id = ANY(p_entrega_ids)
     AND coalesce(e.observacoes_confirmacao,'') NOT LIKE 'TESTE_ENTREGA_E2E_%'
     AND coalesce((SELECT o.observacoes_confirmacao FROM public.entregas o WHERE o.id = e.reentrega_origem_id),'')
         NOT LIKE 'TESTE_ENTREGA_E2E_%';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'harness_guard: % entrega(s) fora do prefixo de fixture', v_bad;
  END IF;

  ALTER TABLE public.entrega_reconciliacoes DISABLE TRIGGER trg_entrega_reconc_immutability;
  ALTER TABLE public.entrega_termos DISABLE TRIGGER USER;

  DELETE FROM public.entrega_reconciliacoes WHERE entrega_id = ANY(p_entrega_ids);
  DELETE FROM public.entrega_conferencia_itens WHERE entrega_id = ANY(p_entrega_ids);
  DELETE FROM public.entrega_termos WHERE entrega_id = ANY(p_entrega_ids);
  DELETE FROM public.entrega_etiquetas WHERE entrega_id = ANY(p_entrega_ids);
  DELETE FROM public.entrega_checklist WHERE entrega_id = ANY(p_entrega_ids);
  DELETE FROM public.entrega_ocorrencias WHERE entrega_id = ANY(p_entrega_ids);
  DELETE FROM public.entrega_documentos WHERE entrega_id = ANY(p_entrega_ids);
  DELETE FROM public.entrega_comprovantes WHERE entrega_id = ANY(p_entrega_ids);
  UPDATE public.entregas SET reentrega_origem_id = NULL WHERE id = ANY(p_entrega_ids);
  DELETE FROM public.entregas WHERE id = ANY(p_entrega_ids);

  ALTER TABLE public.entrega_termos ENABLE TRIGGER USER;
  ALTER TABLE public.entrega_reconciliacoes ENABLE TRIGGER trg_entrega_reconc_immutability;

  SELECT jsonb_build_object('restantes',
    (SELECT count(*) FROM public.entregas WHERE id = ANY(p_entrega_ids))) INTO v_out;
  RETURN v_out;
END $fn$;

REVOKE ALL ON FUNCTION public.rpc_harness_purge_entregas_v1(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_harness_purge_entregas_v1(uuid[]) TO service_role;
