
DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='generate_b2b_receivable_secure' LIMIT 1;
  IF v_src IS NOT NULL AND position('financial_approval_rejected' in v_src) = 0 THEN
    v_new := replace(
      v_src,
      'RAISE EXCEPTION ''financial_approval_pending'';',
      'RAISE EXCEPTION ''financial_approval_pending'';
   END IF;
   IF COALESCE(v_order.financial_approval_status,''not_required'') = ''rejected'' THEN
     RAISE EXCEPTION ''financial_approval_rejected'';'
    );
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.generate_b2b_receivable_secure(p_partner_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
      v_new
    );
  END IF;
END
$mig$;
