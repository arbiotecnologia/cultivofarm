-- =====================================================================
-- FASE H7b (complemento) — achados da auditoria complementar LIVE.
--   H7B-006  P1  rpc_fiscal_xml_record_v1 gravava resultado de XML sem
--                passar pelo gate de ambiente de homologação.
--   H7B-007  P2  fiscal_environment_marker tinha GRANT de escrita para
--                anon/authenticated (bloqueado só por RLS). Menor privilégio.
-- Somente staging: guard pelo marcador antes de qualquer alteração.
-- =====================================================================

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker
                  WHERE project_ref='ikaauvsflpmamgxmkhoq'
                    AND environment_label='STAGING'
                    AND production_emission_allowed=false) THEN
    RAISE EXCEPTION 'H7b COMPLEMENTO GUARD: ambiente nao autorizado — abortado.';
  END IF;
END
$guard$;

-- H7B-007 — menor privilégio no marcador de ambiente (leitura via policy).
REVOKE ALL ON TABLE public.fiscal_environment_marker FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.fiscal_environment_marker TO authenticated;
GRANT ALL    ON TABLE public.fiscal_environment_marker TO service_role;

-- H7B-006 — gate de ambiente na gravação do resultado de XML.
DO $gate$
DECLARE v_src text; v_args text; v_ident text; v_ret text;
BEGIN
  SELECT prosrc,
         pg_get_function_arguments(oid),
         pg_get_function_identity_arguments(oid),
         pg_get_function_result(oid)
    INTO v_src, v_args, v_ident, v_ret
    FROM pg_proc WHERE proname='rpc_fiscal_xml_record_v1';

  IF v_src IS NULL THEN
    RAISE NOTICE 'H7B-006: rpc_fiscal_xml_record_v1 ausente — nada a fazer.';
    RETURN;
  END IF;

  IF position('fn_fiscal_environment_gate_v1' in v_src) > 0
     OR position('assert_environment_homologation' in v_src) > 0 THEN
    RAISE NOTICE 'H7B-006: gate ja presente — nada a fazer.';
    RETURN;
  END IF;

  -- Injeta a chamada ao gate como primeira instrução executável do corpo,
  -- preservando integralmente a lógica existente.
  -- Primeiro BEGIN do corpo (após o bloco DECLARE): substituição única.
  v_src := regexp_replace(v_src, '\mBEGIN\M',
    E'BEGIN\n  PERFORM public.fn_fiscal_environment_gate_v1();');
  IF position('fn_fiscal_environment_gate_v1' in v_src) = 0 THEN
    RAISE EXCEPTION 'H7B-006: nao foi possivel injetar o gate — revisao manual necessaria.';
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.rpc_fiscal_xml_record_v1(%s) RETURNS %s '
    'LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'', ''pg_temp'' AS %L',
    v_args, v_ret, v_src);

  EXECUTE format('REVOKE ALL ON FUNCTION public.rpc_fiscal_xml_record_v1(%s) FROM PUBLIC, anon', v_ident);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.rpc_fiscal_xml_record_v1(%s) TO authenticated, service_role', v_ident);

  RAISE NOTICE 'H7B-006: gate de ambiente aplicado a rpc_fiscal_xml_record_v1.';
END
$gate$;

COMMIT;
