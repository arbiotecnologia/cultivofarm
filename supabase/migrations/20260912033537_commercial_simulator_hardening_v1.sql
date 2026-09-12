-- PENDENTE: aplicar somente no destino autorizado após preflight manual.
-- Chamador de runtime removido: useCommercialSimulator / SimuladorComercial.
-- Substituto: simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date).
-- Não altera dados, históricos ou a implementação da função legada.
BEGIN;
DO $guard$
DECLARE legacy regprocedure := to_regprocedure('public.rpc_commercial_simulator(uuid,uuid,numeric,numeric)');
BEGIN
  IF legacy IS NULL THEN
    RAISE EXCEPTION 'legacy_signature_missing: revisar preflight';
  END IF;
  IF to_regprocedure('public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)') IS NULL THEN
    RAISE EXCEPTION 'canonical_simulator_missing: abortar hardening';
  END IF;
  -- Dependências SQL registradas ou referências textuais em funções: fail-closed.
  IF EXISTS (SELECT 1 FROM pg_depend WHERE refclassid = 'pg_proc'::regclass AND refobjid = legacy)
     OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid <> legacy AND p.prosrc ILIKE '%rpc_commercial_simulator%') THEN
    RAISE EXCEPTION 'legacy_dependencies_present: revisar antes de revogar';
  END IF;
END $guard$;
ALTER FUNCTION public.rpc_commercial_simulator(uuid,uuid,numeric,numeric) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.rpc_commercial_simulator(uuid,uuid,numeric,numeric) FROM PUBLIC, anon, authenticated, service_role;
-- Sem GRANT: nenhum consumidor técnico necessário identificado no repositório.
-- Sem DROP: preserva implementação e permite recuperação controlada.
-- Rollback: restaurar proconfig/ACL do backup de preflight, nunca GRANT amplo automático.
COMMIT;
