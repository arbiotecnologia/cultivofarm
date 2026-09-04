CREATE OR REPLACE FUNCTION public.rpc_b2b_aging(p_partner_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(faixa text, qtd_titulos integer, valor numeric, parceiros integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select h7n_guarded.*
  from (
WITH base AS (
    SELECT ar.partner_id, ari.id,
           (ari.original_amount - ari.received_amount) AS saldo,
           GREATEST(0, (current_date - ari.due_date)) AS dias
    FROM public.accounts_receivable ar
    JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
    WHERE ar.origin_type = 'B2B_ORDER'
      AND ar.status <> 'CANCELED'
      AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
      AND (p_partner_id IS NULL OR ar.partner_id = p_partner_id)
  ), faixas AS (
    SELECT CASE
             WHEN dias <= 30 THEN '0-30'
             WHEN dias <= 60 THEN '31-60'
             WHEN dias <= 90 THEN '61-90'
             ELSE '90+'
           END AS faixa, partner_id, saldo
    FROM base
  )
  SELECT faixa, COUNT(*)::int, COALESCE(SUM(saldo),0), COUNT(DISTINCT partner_id)::int
  FROM faixas GROUP BY faixa
  ORDER BY CASE faixa WHEN '0-30' THEN 1 WHEN '31-60' THEN 2 WHEN '61-90' THEN 3 ELSE 4 END
  ) as h7n_guarded
  where public.has_role(auth.uid(), 'administrador'::public.app_role)
      or public.has_role(auth.uid(), 'gestor'::public.app_role)
      or public.has_role(auth.uid(), 'financeiro'::public.app_role)
      or public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
      or public.has_role(auth.uid(), 'administrativo'::public.app_role);
$function$

--ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--OWNER: postgres

