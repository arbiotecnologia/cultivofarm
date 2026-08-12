-- =====================================================================
-- FASE 5 — idempotência server-side do replay de `finalizar_os`.
-- Evidência: o wrapper rpc_avancar_esteira_laboratorio recusava QUALQUER
-- etapa em OS terminal, inclusive o replay de finalizar_os (duplo clique),
-- devolvendo erro ao operador. Passa a devolver replay idempotente apenas
-- para finalizar_os sobre OS já 'finalizada' — sem novo evento de auditoria
-- e sem qualquer efeito colateral. Demais etapas seguem bloqueadas.
-- Guard fail-closed: staging ikaauvsflpmamgxmkhoq. Produção RECUSADA.
-- =====================================================================
DO $guard$
BEGIN
  IF current_database() = 'navfzbwgwzruipouyfnk'
     OR coalesce(current_setting('lovable.project_ref', true), '') = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO: migration proibida em navfzbwgwzruipouyfnk';
  END IF;
  IF to_regclass('public._fiscal_staging_marker') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker
                     WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq') THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: alvo nao e o staging ikaauvsflpmamgxmkhoq';
  END IF;
END
$guard$;

DO $patch$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_avancar_esteira_laboratorio';
  IF v_def IS NULL THEN RAISE EXCEPTION 'ABORT: wrapper da esteira ausente'; END IF;

  v_new := replace(v_def,
$old$    IF v_status_os IN ('finalizada', 'cancelada') THEN$old$,
$new$    -- Replay idempotente do encerramento (duplo clique): nao gera evento novo.
    IF p_etapa_destino = 'finalizar_os' AND v_status_os = 'finalizada' THEN
        RETURN jsonb_build_object('success', true, 'replay', true,
                                  'message', 'OS já finalizada anteriormente.');
    END IF;

    IF v_status_os IN ('finalizada', 'cancelada') THEN$new$);

  IF v_new = v_def THEN RAISE EXCEPTION 'ABORT: ancora do bloqueio terminal nao localizada'; END IF;
  EXECUTE v_new;
END
$patch$;

REVOKE ALL ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_avancar_esteira_laboratorio(uuid, text, text, uuid) TO service_role;
