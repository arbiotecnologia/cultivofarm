-- Containment rollback ONLY after installing candidate; no vulnerable helper/grant restoration.
BEGIN;
ALTER POLICY ar_partner_select_own_b2b ON public.accounts_receivable USING (false);
ALTER POLICY ari_partner_select_own_b2b ON public.accounts_receivable_installments USING (false);
-- Producer/internal read branches and tenant guards remain. No data removed.
COMMIT;