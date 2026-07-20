
-- FASE 1: Reduzir disk I/O — refresh MVs de 5min para 30min + RPC manual

-- Task 1: Reagendar jobs de refresh
DO $$ BEGIN PERFORM cron.unschedule('refresh-mv-esteira-laboratorio'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('refresh-mv-fluxo-visita-tecnica'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'refresh-mv-esteira-laboratorio',
  '*/30 * * * *',
  $$REFRESH MATERIALIZED VIEW public.mv_esteira_laboratorio;$$
);

SELECT cron.schedule(
  'refresh-mv-fluxo-visita-tecnica',
  '*/30 * * * *',
  $$REFRESH MATERIALIZED VIEW public.mv_fluxo_visita_tecnica;$$
);

-- Task 2: RPC manual para admin/gestor
CREATE TABLE IF NOT EXISTS public.bi_refresh_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  executed_by uuid NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  target text NOT NULL,
  duration_ms integer,
  success boolean NOT NULL DEFAULT true,
  error_message text
);

GRANT SELECT ON public.bi_refresh_audit TO authenticated;
GRANT ALL ON public.bi_refresh_audit TO service_role;
ALTER TABLE public.bi_refresh_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins e gestores visualizam auditoria de refresh BI" ON public.bi_refresh_audit;
CREATE POLICY "Admins e gestores visualizam auditoria de refresh BI"
  ON public.bi_refresh_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor'));

CREATE OR REPLACE FUNCTION public.rpc_refresh_bi_operacional()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_start timestamptz;
  v_dur integer;
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF NOT (public.has_role(v_uid, 'administrador') OR public.has_role(v_uid, 'gestor')) THEN
    RAISE EXCEPTION 'Acesso negado: somente administrador ou gestor';
  END IF;

  v_start := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW public.mv_esteira_laboratorio;
    v_dur := EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int;
    INSERT INTO public.bi_refresh_audit(executed_by, target, duration_ms, success)
      VALUES (v_uid, 'mv_esteira_laboratorio', v_dur, true);
    v_result := v_result || jsonb_build_object('mv_esteira_laboratorio', jsonb_build_object('ok', true, 'duration_ms', v_dur));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.bi_refresh_audit(executed_by, target, success, error_message)
      VALUES (v_uid, 'mv_esteira_laboratorio', false, SQLERRM);
    v_result := v_result || jsonb_build_object('mv_esteira_laboratorio', jsonb_build_object('ok', false, 'error', SQLERRM));
  END;

  v_start := clock_timestamp();
  BEGIN
    REFRESH MATERIALIZED VIEW public.mv_fluxo_visita_tecnica;
    v_dur := EXTRACT(MILLISECOND FROM (clock_timestamp() - v_start))::int;
    INSERT INTO public.bi_refresh_audit(executed_by, target, duration_ms, success)
      VALUES (v_uid, 'mv_fluxo_visita_tecnica', v_dur, true);
    v_result := v_result || jsonb_build_object('mv_fluxo_visita_tecnica', jsonb_build_object('ok', true, 'duration_ms', v_dur));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.bi_refresh_audit(executed_by, target, success, error_message)
      VALUES (v_uid, 'mv_fluxo_visita_tecnica', false, SQLERRM);
    v_result := v_result || jsonb_build_object('mv_fluxo_visita_tecnica', jsonb_build_object('ok', false, 'error', SQLERRM));
  END;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_refresh_bi_operacional() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_refresh_bi_operacional() TO authenticated;

-- Task 3: Blindar permissões das MVs (anon sem acesso; authenticated OK via wrapper vw_*)
REVOKE ALL ON public.mv_esteira_laboratorio FROM PUBLIC, anon;
REVOKE ALL ON public.mv_fluxo_visita_tecnica FROM PUBLIC, anon;
GRANT SELECT ON public.mv_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.mv_fluxo_visita_tecnica TO authenticated;

REVOKE ALL ON public.vw_esteira_laboratorio FROM PUBLIC, anon;
REVOKE ALL ON public.vw_fluxo_visita_tecnica FROM PUBLIC, anon;
GRANT SELECT ON public.vw_esteira_laboratorio TO authenticated;
GRANT SELECT ON public.vw_fluxo_visita_tecnica TO authenticated;
