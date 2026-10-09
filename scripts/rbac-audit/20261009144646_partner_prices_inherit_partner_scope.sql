-- P1: partner prices must inherit the existing partner row isolation.
-- Additive containment only; no new roles, grants, or privileged RPCs.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm')
 OR EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref<>'swzpzcwiasxmjutrmvkm')
 THEN RAISE EXCEPTION 'canonical_project_required'; END IF;
END $$;

CREATE POLICY partner_prices_partner_scope_guard
ON public.partner_product_prices AS RESTRICTIVE FOR ALL TO authenticated
USING (EXISTS (
 SELECT 1 FROM public.partner_accounts pa
 WHERE pa.id = partner_product_prices.partner_id
))
WITH CHECK (EXISTS (
 SELECT 1 FROM public.partner_accounts pa
 WHERE pa.id = partner_product_prices.partner_id
));

COMMENT ON POLICY partner_prices_partner_scope_guard ON public.partner_product_prices
IS 'Direct-table tenant/partner containment using partner_accounts RLS. Preserves existing role checks and B2B whole-row financial containment. Does not certify SECURITY DEFINER channels or activate provisioning.';