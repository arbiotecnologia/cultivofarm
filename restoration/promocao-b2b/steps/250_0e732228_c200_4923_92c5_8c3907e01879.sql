-- PACOTE DE PROMOCAO MOTOR B2B — passo 250
-- Guarda de delete de vinculo financeiro
-- Origem (historico, NAO modificado): supabase/migrations/20260730034130_0e732228-c200-4923-92c5-8c3907e01879.sql
-- sha256(origem) = 11e91c0c210948f1bf1b45269540205b3b9fa8344d529af657737bb23b9990f2
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

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
END $function$;
