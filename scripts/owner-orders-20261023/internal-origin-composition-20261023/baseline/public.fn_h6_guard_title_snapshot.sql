CREATE OR REPLACE FUNCTION public.fn_h6_guard_title_snapshot()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.installment_count IS DISTINCT FROM OLD.installment_count
     OR NEW.origin_type IS DISTINCT FROM OLD.origin_type
     OR NEW.origin_id IS DISTINCT FROM OLD.origin_id
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.first_due_date IS DISTINCT FROM OLD.first_due_date
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Snapshot financeiro imutavel: valor, parcelas, origem e datas de emissao nao podem ser alterados.'
      USING ERRCODE='check_violation';
  END IF;

  IF TG_TABLE_NAME = 'accounts_receivable'
     AND (to_jsonb(NEW)->>'payment_method_id') IS DISTINCT FROM (to_jsonb(OLD)->>'payment_method_id') THEN
    RAISE EXCEPTION 'Condicao/metodo do titulo e imutavel apos a criacao: use o metodo na baixa (receivable_payments).'
      USING ERRCODE='check_violation';
  END IF;

  RETURN NEW;
END $function$
