CREATE OR REPLACE FUNCTION public.fn_run_recurring_generation()
 RETURNS TABLE(template_id uuid, status text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r RECORD; v_id UUID;
BEGIN
  FOR r IN
    SELECT id, next_generation_date
    FROM public.recurring_financial_templates
    WHERE active = true AND auto_generate = true
      AND next_generation_date IS NOT NULL
      AND next_generation_date <= CURRENT_DATE
      AND (end_date IS NULL OR next_generation_date <= end_date)
  LOOP
    BEGIN
      v_id := public.fn_generate_recurring_title(r.id, r.next_generation_date, false);
      template_id := r.id;
      status := CASE WHEN v_id IS NULL THEN 'SKIPPED' ELSE 'SUCCESS' END;
      message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.recurring_generation_log(template_id, reference_date, status, error_message)
      VALUES (r.id, r.next_generation_date, 'FAILED', SQLERRM);
      INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
      VALUES ('RECURRING_TEMPLATE', r.id, 'RECURRING_GENERATION_FAILED',
              jsonb_build_object('reference_date', r.next_generation_date), auth.uid(), SQLERRM);
      template_id := r.id; status := 'FAILED'; message := SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
END $function$

;
