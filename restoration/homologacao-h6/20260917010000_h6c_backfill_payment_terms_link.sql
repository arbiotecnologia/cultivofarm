-- =====================================================================
-- H6c.2 — Reconciliação do vínculo canônico da condição de pagamento.
-- Motivo: pedidos legados possuem termo, mas partner_orders.payment_terms_id
-- é NULL. Com o fail-closed de H6C-001 isso bloqueia o faturamento.
-- Backfill APENAS quando o vínculo é inequívoco (exatamente 1 termo).
-- Pedidos ambíguos (2+ termos) permanecem bloqueados por decisão humana.
-- Staging ikaauvsflpmamgxmkhoq. Idempotente.
-- =====================================================================
BEGIN;

WITH unico AS (
  SELECT partner_order_id, (array_agg(id ORDER BY created_at, id))[1] AS terms_id
    FROM public.partner_order_payment_terms
   GROUP BY partner_order_id
  HAVING count(*) = 1
)
UPDATE public.partner_orders o
   SET payment_terms_id = u.terms_id
  FROM unico u
 WHERE o.id = u.partner_order_id
   AND o.payment_terms_id IS NULL;

-- Mantém o vínculo canônico automático para termos futuros:
-- o primeiro termo do pedido vira o canônico; substituições exigem
-- atualização explícita de partner_orders.payment_terms_id.
CREATE OR REPLACE FUNCTION public.fn_h6c_set_canonical_payment_terms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.partner_orders
     SET payment_terms_id = NEW.id
   WHERE id = NEW.partner_order_id
     AND payment_terms_id IS NULL;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_h6c_set_canonical_payment_terms ON public.partner_order_payment_terms;
CREATE TRIGGER trg_h6c_set_canonical_payment_terms
AFTER INSERT ON public.partner_order_payment_terms
FOR EACH ROW EXECUTE FUNCTION public.fn_h6c_set_canonical_payment_terms();

COMMIT;
