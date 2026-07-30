-- PACOTE DE PROMOCAO MOTOR B2B — passo 240
-- Revogacao de EXECUTE publico em trigger de auditoria
-- Origem (historico, NAO modificado): supabase/migrations/20260730031821_7fec38f4-af41-43c6-86f9-1765cd508292.sql
-- sha256(origem) = 1e959647395da0d73ec1c0e7022e3906b345f17e27bec8eb1ed4a96e22dee76e
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

-- Hardening pontual: a função de gatilho de auditoria não deve ter EXECUTE público.
-- Migration promocional (sem dependência de marker/fixture/staging).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname = 'audit_partner_order_payment_terms'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
  END LOOP;
END $$;
