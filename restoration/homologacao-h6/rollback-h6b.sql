-- H6b — ROLLBACK CONTROLADO (staging ikaauvsflpmamgxmkhoq).
-- Reverte apenas o endurecimento H6b, preservando H6 e dados históricos.
-- NÃO remove colunas (`request_fingerprint`, `valor_faturavel_origem`,
-- `valor_faturavel_metodo`): elas são aditivas, guardam trilha e podem
-- permanecer sem efeito colateral. O rollback é lógico, não destrutivo.
--
-- Passo 1 — restaurar as definições anteriores das funções:
--   psql "$STAGING_DSN" -v ON_ERROR_STOP=1 \
--     -f supabase/migrations/20260915010000_h6_baixa_idempotente_v1.sql
--   (recria rpc_register_receivable_payment / rpc_register_payable_payment
--    na versão H6, com idempotency_key opcional)
--
-- Passo 2 — desativar o teto econômico derivado, se necessário:
BEGIN;
DROP TRIGGER IF EXISTS trg_h6b_reconciliacao_valor_faturavel ON public.entrega_reconciliacoes;
COMMIT;
--
-- Passo 3 — postcheck deve voltar a acusar FAIL em H6B-S07/S10/S11,
-- indicando que o ambiente está na baseline H6.
