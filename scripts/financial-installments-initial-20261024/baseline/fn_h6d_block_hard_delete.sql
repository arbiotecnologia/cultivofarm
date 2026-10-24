CREATE OR REPLACE FUNCTION public.fn_h6d_block_hard_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.fn_h6d_hard_delete_allowed() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Registro financeiro (%) nao pode ser excluido: cancele pelo fluxo formal (rpc_cancel_accounts_receivable / rpc_cancel_accounts_payable).', TG_TABLE_NAME
    USING ERRCODE='check_violation';
END $function$
;
