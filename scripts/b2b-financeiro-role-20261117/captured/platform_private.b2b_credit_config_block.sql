CREATE OR REPLACE FUNCTION platform_private.b2b_credit_config_block(p_partner uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.partner_financial_settings s WHERE s.partner_id = p_partner AND s.active IS TRUE) THEN 'configuracao_financeira_inativa'
    WHEN NOT EXISTS (SELECT 1 FROM public.partner_financial_settings s WHERE s.partner_id = p_partner AND s.active IS TRUE AND s.credit_limit IS NOT NULL AND s.credit_limit >= 0 AND s.credit_limit::text NOT IN ('NaN','Infinity','-Infinity')) THEN 'limite_nao_definido'
    WHEN NOT EXISTS (SELECT 1 FROM public.partner_financial_settings s WHERE s.partner_id = p_partner AND s.active IS TRUE
      AND s.overdue_tolerance_days IS NOT NULL AND s.overdue_tolerance_days >= 0
      AND s.block_if_overdue IS NOT NULL AND s.credit_limit_action IN ('block','approval_required')) THEN 'configuracao_financeira_incompleta'
  END $function$
