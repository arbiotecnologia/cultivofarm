
ALTER TABLE public.partner_product_prices
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_ppp_updated_at
  BEFORE UPDATE ON public.partner_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
