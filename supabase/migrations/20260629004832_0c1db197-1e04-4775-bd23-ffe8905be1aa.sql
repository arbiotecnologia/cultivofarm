-- 1) Normaliza linhas existentes ao desconto padrão do parceiro
UPDATE public.partner_product_prices ppp
   SET desconto_percentual = pa.desconto_padrao,
       preco_final = ROUND(ppp.preco_tabela * (1 - pa.desconto_padrao/100.0), 2),
       updated_at = now()
  FROM public.partner_accounts pa
 WHERE ppp.partner_id = pa.id
   AND ppp.ativo = true
   AND ppp.desconto_percentual IS DISTINCT FROM pa.desconto_padrao;

-- 2) Função: reset por parceiro (admin / gestor_comercial)
CREATE OR REPLACE FUNCTION public.partner_reset_prices_to_default(p_partner_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_d numeric(5,2);
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT (has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT desconto_padrao INTO v_d FROM public.partner_accounts WHERE id = p_partner_id AND ativo = true;
  IF v_d IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  UPDATE public.partner_product_prices
     SET desconto_percentual = v_d,
         preco_final = ROUND(preco_tabela * (1 - v_d/100.0), 2),
         updated_at = now()
   WHERE partner_id = p_partner_id
     AND ativo = true
     AND desconto_percentual IS DISTINCT FROM v_d;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_reset_prices_to_default(uuid) TO authenticated;

-- 3) Trigger: ao alterar desconto_padrao do parceiro, recalcular linhas não-exceção
CREATE OR REPLACE FUNCTION public.recalc_partner_prices_on_default_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.desconto_padrao IS DISTINCT FROM OLD.desconto_padrao THEN
    UPDATE public.partner_product_prices
       SET desconto_percentual = NEW.desconto_padrao,
           preco_final = ROUND(preco_tabela * (1 - NEW.desconto_padrao/100.0), 2),
           updated_at = now()
     WHERE partner_id = NEW.id
       AND ativo = true
       AND desconto_percentual IS NOT DISTINCT FROM OLD.desconto_padrao;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_partner_prices_on_default_change ON public.partner_accounts;
CREATE TRIGGER trg_recalc_partner_prices_on_default_change
AFTER UPDATE OF desconto_padrao ON public.partner_accounts
FOR EACH ROW EXECUTE FUNCTION public.recalc_partner_prices_on_default_change();