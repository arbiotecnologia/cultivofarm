-- Rollback logico da H13 (executar somente no projeto canonico swzpzcwiasxmjutrmvkm).
-- Observacao: o rollback restaura a ACL anterior de leitura do catalogo RTC.
-- NAO restaura privilegios inseguros de escrita tecnica.

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker
                  WHERE project_ref = 'swzpzcwiasxmjutrmvkm') THEN
    RAISE EXCEPTION 'FISCAL_CANONICAL_TARGET_REQUIRED';
  END IF;
END $guard$;

-- 1. ACL: reconcede EXECUTE a anon apenas se for necessario reverter.
GRANT EXECUTE ON FUNCTION public.fn_fiscal_rtc_layout_supported_v1(text,text,date) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_service_withholding_valid_v1(jsonb) TO anon;

-- 2. Comportamento do registro de retorno: para voltar ao fechamento sem
-- captura de excecao, reaplicar a definicao da migration
-- 20261035000000_h12_fiscal_totals_certificate_authorization_services.sql
-- (secao 6), que propaga a falha e reverte a transacao inteira.
