CREATE TABLE IF NOT EXISTS public.financial_inconsistency_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  total_count integer NOT NULL DEFAULT 0,
  by_severity jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack')),
  acked_by uuid,
  acked_at timestamptz,
  notes text
);

GRANT SELECT, UPDATE ON public.financial_inconsistency_alerts TO authenticated;
GRANT ALL ON public.financial_inconsistency_alerts TO service_role;

ALTER TABLE public.financial_inconsistency_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fia_select_finance" ON public.financial_inconsistency_alerts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
  );

CREATE POLICY "fia_update_ack" ON public.financial_inconsistency_alerts
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::public.app_role)
    OR public.has_role(auth.uid(), 'financeiro'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS idx_fia_status_runat ON public.financial_inconsistency_alerts (status, run_at DESC);

CREATE OR REPLACE FUNCTION public.fn_run_financial_inconsistency_check()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_count integer;
  v_by_severity jsonb;
  v_sample jsonb;
  v_alert_id uuid;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    INTO v_rows
    FROM public.fn_financial_inconsistencies() r;

  v_count := jsonb_array_length(v_rows);

  IF v_count = 0 THEN
    INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
    VALUES ('system', gen_random_uuid(), 'inconsistency_check',
            jsonb_build_object('count', 0, 'run_at', now()), NULL);
    RETURN NULL;
  END IF;

  SELECT jsonb_object_agg(severity, qtd)
    INTO v_by_severity
    FROM (
      SELECT (elem->>'severity') AS severity, count(*)::int AS qtd
        FROM jsonb_array_elements(v_rows) elem
       GROUP BY 1
    ) s;

  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    INTO v_sample
    FROM (
      SELECT elem FROM jsonb_array_elements(v_rows) elem LIMIT 10
    ) t;

  INSERT INTO public.financial_inconsistency_alerts (total_count, by_severity, sample)
  VALUES (v_count, COALESCE(v_by_severity, '{}'::jsonb), v_sample)
  RETURNING id INTO v_alert_id;

  INSERT INTO public.financial_audit_log (entity_type, entity_id, action, new_data, performed_by)
  VALUES ('financial_inconsistency_alerts', v_alert_id, 'inconsistency_check',
          jsonb_build_object('count', v_count, 'by_severity', v_by_severity), NULL);

  RETURN v_alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_run_financial_inconsistency_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_run_financial_inconsistency_check() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_run_financial_inconsistency_check() TO authenticated;