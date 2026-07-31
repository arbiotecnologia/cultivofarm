ALTER TABLE public.fiscal_invoice_items DROP CONSTRAINT IF EXISTS fiscal_invoice_items_item_kind_check;
ALTER TABLE public.fiscal_invoice_items ADD CONSTRAINT fiscal_invoice_items_item_kind_check
  CHECK (item_kind = ANY (ARRAY['PRODUCT'::text, 'MICROORGANISM'::text, 'SERVICE'::text, 'OTHER'::text]));