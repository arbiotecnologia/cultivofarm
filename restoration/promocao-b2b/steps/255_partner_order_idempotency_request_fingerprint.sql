-- PACOTE DE PROMOCAO MOTOR B2B — passo 255
-- Coluna de fingerprint canônico do payload de checkout (reqfp_v2).
-- Origem semântica: supabase/migrations/20260730032921_4834c360-9df6-4c14-9e78-51ae42c038a8.sql
-- Aquela migration histórica aplicava a coluna E substituía a função por patch
-- textual (pg_get_functiondef + replace), padrão NÃO determinístico e portanto
-- PROIBIDO neste pacote. Aqui é promovida apenas a parte estrutural; a definição
-- da função vem, de forma explícita e completa, no passo 260.
-- Forward-only e idempotente.

ALTER TABLE public.partner_order_idempotency
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'partner_order_idempotency'
       AND column_name = 'request_fingerprint'
  ) THEN
    RAISE EXCEPTION 'PROMO_STEP_255_FAIL: coluna request_fingerprint ausente';
  END IF;
END
$assert$;
