-- =====================================================================
-- Fase H2 — Hardening de privilégios em public.fiscal_certificates
-- Nome canônico alvo: 20260803000000_fiscal_certificates_revoke_anon_and_structural.sql
--
-- Artefato entregue em restoration/ para promoção autorizada a
-- supabase/migrations/. NÃO aplicar no banco nesta rodada.
--
-- Contexto (staging ikaauvsflpmamgxmkhoq, produção intocada):
-- a auditoria pós-20260801000000 detectou drift residual em
-- `fiscal_certificates` — a tabela NÃO estava no array das 10 tabelas
-- fiscais varridas pela migration anterior. O runtime do staging
-- bloqueou o drift antes da reconciliação de histórico (documentado
-- em §20 de docs/fiscal-h2-certificacao-staging.md).
--
-- Esta migration é ADITIVA e idempotente. Não altera policies, RLS,
-- funções, triggers, DML nem regras de negócio.
--
-- Efeitos:
--   1. `anon` perde TODOS os privilégios de tabela (SELECT/INSERT/
--      UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) em fiscal_certificates.
--   2. `authenticated` perde explicitamente TRUNCATE/REFERENCES/TRIGGER
--      e qualquer INSERT/UPDATE/DELETE herdado — mantém apenas SELECT,
--      já concedido em 20260724000000 e filtrado por RLS
--      `fc_read_metadata`. Upload/revogação legítimos continuam via
--      edge functions com `service_role`.
--   3. `service_role` permanece intacto.
-- =====================================================================

REVOKE ALL PRIVILEGES ON TABLE public.fiscal_certificates FROM anon;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.fiscal_certificates FROM authenticated;
