CREATE OR REPLACE FUNCTION public.fn_h6_guard_ar_installment_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.receivable_id IS DISTINCT FROM OLD.receivable_id
     OR NEW.installment_number IS DISTINCT FROM OLD.installment_number
     OR NEW.original_amount IS DISTINCT FROM OLD.original_amount
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Parcela imutavel: titulo, numero, valor original, vencimento, valor liquido e data de criacao nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $function$
;
