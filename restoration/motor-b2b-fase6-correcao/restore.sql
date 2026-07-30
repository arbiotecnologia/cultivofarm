-- ==========================================================
-- FASE 6 — CORREÇÃO CONSOLIDADA · ROLLBACK (staging ikaauvsflpmamgxmkhoq)
-- NÃO DESTRUTIVO: restaura apenas ACLs/policies e remove os objetos
-- criados pela migration corretiva. Nenhum dado, coluna de versionamento,
-- pedido, snapshot ou auditoria é apagado.
-- Execute em transação única: psql --single-transaction -f restore.sql
-- ==========================================================
DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public._fiscal_staging_marker
    WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq'
  ) THEN
    RAISE EXCEPTION 'ABORT: ambiente nao e o staging autorizado';
  END IF;
END
$guard$;

-- 1) Guard declarativo de vigência (substitui o antigo patch textual)
DROP TRIGGER IF EXISTS trg_b2b_plan_selectable_orders ON public.partner_orders;
DROP TRIGGER IF EXISTS trg_b2b_plan_selectable_terms ON public.partner_order_payment_terms;
DROP FUNCTION IF EXISTS public.tg_b2b_enforce_plan_selectable();

-- 2) RPC operacional de leitura de planos selecionáveis
DROP FUNCTION IF EXISTS public.rpc_b2b_list_selectable_payment_plans();

-- 3) Helpers internos — reabre EXECUTE ao estado anterior à correção
GRANT EXECUTE ON FUNCTION public.fn_b2b_can_admin_plans(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_selectable(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_b2b_plan_referenced(uuid) TO authenticated;

-- 4) Leitura bruta da tabela e policies do estado anterior à correção
GRANT SELECT ON public.commercial_payment_plans TO authenticated;
GRANT ALL ON public.commercial_payment_plans TO service_role;

CREATE POLICY cpp_select ON public.commercial_payment_plans
  FOR SELECT TO authenticated
  USING (active = true
     OR has_role(auth.uid(), 'administrador'::app_role)
     OR has_role(auth.uid(), 'financeiro'::app_role)
     OR has_role(auth.uid(), 'gestor_comercial'::app_role));

CREATE POLICY cpp_insert ON public.commercial_payment_plans
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY cpp_update ON public.commercial_payment_plans
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role)
     OR has_role(auth.uid(), 'financeiro'::app_role)
     OR has_role(auth.uid(), 'gestor_comercial'::app_role));

CREATE POLICY cpp_delete ON public.commercial_payment_plans
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role)
     OR has_role(auth.uid(), 'financeiro'::app_role)
     OR has_role(auth.uid(), 'gestor_comercial'::app_role));

-- NOTA: as 4 RPCs operacionais NÃO são tocadas por este rollback.
-- Checksums esperados (inalterados antes/depois da correção e após o restore):
--   simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)                       0bbd1c83652c1dd529192cf731708c02
--   create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text) f4f0da921facdcc3ce34d648b0af483c
--   convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean) b05e18a376861d60e7633fd1d21f2a06
--   respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)                  f8dee624c0b9cf12520b383f1a31f59a
