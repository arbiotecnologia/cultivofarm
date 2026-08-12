-- Rollback da reconciliação 20260829000000 (staging ikaauvsflpmamgxmkhoq).
-- Remove o motor único e restaura o cockpit ao comportamento imediatamente
-- anterior (lógica inline). NÃO reverte os search_path endurecidos nem os
-- REVOKE de PUBLIC/anon — endurecimento é intencionalmente irreversível aqui.
DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ENV_ABORT: rollback permitido apenas no staging autorizado';
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.rpc_entrega_confirmar_v1(uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fn_entrega_confirmar_engine_v1(uuid, uuid, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fn_entrega_assert_confirmador(text);
-- Reaplique restoration/os-e2e/ (rodada 20260828000000) para restaurar
-- rpc_cockpit_confirmar_entrega_v1 e _rpc_avancar_esteira_laboratorio_internal.
