
WITH dup AS (
  SELECT i.id, i.receivable_id, i.installment_number,
         row_number() OVER (
           PARTITION BY i.receivable_id, i.installment_number
           ORDER BY
             CASE WHEN i.status IN ('PAID','PARTIAL') OR COALESCE(i.received_amount,0) > 0 THEN 0 ELSE 1 END,
             i.created_at
         ) AS rn
  FROM public.accounts_receivable_installments i
  JOIN public.accounts_receivable ar ON ar.id = i.receivable_id
  WHERE ar.origin_type = 'B2B_ORDER'
),
to_delete AS (
  SELECT id FROM dup WHERE rn > 1
)
DELETE FROM public.accounts_receivable_installments
WHERE id IN (SELECT id FROM to_delete)
  AND NOT EXISTS (
    SELECT 1 FROM public.receivable_payments rp WHERE rp.installment_id = accounts_receivable_installments.id
  );
