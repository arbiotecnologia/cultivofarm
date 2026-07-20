-- FASE 15 — Salvaguarda contra overloads antigos das RPCs do Motor B2B.
--
-- Estado auditado no banco (07/07/2026):
--   * create_partner_order_secure — 1 assinatura (a oficial).
--   * simulate_b2b_payment_plan_secure — 1 assinatura (a oficial).
--   * convert_partner_simulation_to_order_secure — 1 assinatura (a oficial).
--
-- Não há overloads legados para remover (nenhuma variante 3/4/5 args existe).
-- Esta migration apenas garante que o estado consolidado seja mantido:
-- falha o deploy se uma nova assinatura conflitante aparecer no futuro.

DO $chk$
DECLARE
  v_count int;
  r record;
  v_msg text;
BEGIN
  FOR r IN
    SELECT p.proname, COUNT(*) AS n,
           string_agg(pg_get_function_identity_arguments(p.oid), ' | ') AS sigs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_partner_order_secure',
        'simulate_b2b_payment_plan_secure',
        'convert_partner_simulation_to_order_secure'
      )
    GROUP BY p.proname
  LOOP
    IF r.n > 1 THEN
      RAISE EXCEPTION 'FASE 15: overload detectado em %() — % assinaturas: %',
        r.proname, r.n, r.sigs;
    END IF;
  END LOOP;

  -- Blindagem preventiva: se um dia surgirem, remover explicitamente.
  DROP FUNCTION IF EXISTS public.create_partner_order_secure(uuid, text, jsonb);
  DROP FUNCTION IF EXISTS public.create_partner_order_secure(uuid, text, jsonb, date);
  DROP FUNCTION IF EXISTS public.create_partner_order_secure(uuid, text, jsonb, date, text);

  RAISE NOTICE 'FASE 15 OK: sem overloads legados das RPCs do Motor B2B.';
END $chk$;