CREATE OR REPLACE FUNCTION public.fn_generate_receivable_installments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  i int;
  v_qtd int := NEW.installment_count;
  v_base numeric(14,2) := ROUND(NEW.total_amount / v_qtd, 2);
  v_acc numeric(14,2) := 0;
  v_amt numeric(14,2);
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  FOR i IN 1..v_qtd LOOP
    IF i < v_qtd THEN
      v_amt := v_base;
      v_acc := v_acc + v_amt;
    ELSE
      v_amt := NEW.total_amount - v_acc;
    END IF;
    INSERT INTO public.accounts_receivable_installments
      (receivable_id, installment_number, due_date, original_amount, net_amount, status, organization_id)
    VALUES
      (NEW.id, i, (NEW.first_due_date + ((i-1) || ' months')::interval)::date, v_amt, v_amt, 'OPEN', NEW.organization_id);
  END LOOP;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.fn_generate_receivable_installments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_generate_receivable_installments() TO service_role;