CREATE OR REPLACE FUNCTION public.tg_block_pofl_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Rollback controlado: somente administrador e somente apos cancelamento
  -- canonico do recebivel (cancel_b2b_receivable_secure).
  IF COALESCE(OLD.financial_status, '') = 'cancelado'
     AND auth.uid() IS NOT NULL
     AND public.has_role(auth.uid(), 'administrador'::app_role) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Vínculo financeiro não pode ser excluído';
END $function$
