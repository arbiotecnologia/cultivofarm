-- PACOTE DE PROMOCAO MOTOR B2B — passo 130
-- Grants de partner_order_idempotency
-- Origem (historico, NAO modificado): supabase/migrations/20260729034935_76ce073e-6c11-4012-9560-b2b61c91b97d.sql
-- sha256(origem) = b75411be6af422f08d5a30c836ff62322e19067118f578f2e806eb6a6230ce38
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

REVOKE ALL ON public.partner_order_idempotency FROM anon;
REVOKE ALL ON public.partner_order_idempotency FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.partner_order_idempotency FROM authenticated;
GRANT SELECT ON public.partner_order_idempotency TO authenticated;
GRANT ALL ON public.partner_order_idempotency TO service_role;
