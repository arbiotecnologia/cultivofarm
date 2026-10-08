DO $canonical$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
END $canonical$;
-- BF02: no deterministic A/P contract is provisioned. Preserve every row;
-- restrictive containment composes with existing permissive policies.
DROP POLICY IF EXISTS bf02_assignment_contract_containment ON public.partner_clients;
CREATE POLICY bf02_assignment_contract_containment ON public.partner_clients AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS bf02_assignment_contract_containment ON public.partner_user_clients;
CREATE POLICY bf02_assignment_contract_containment ON public.partner_user_clients AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
-- Stable signatures, no resource reads/replay or effects before denial.
CREATE OR REPLACE FUNCTION public.assign_b2b_user_client_secure(p_user_id uuid,p_cliente_id uuid,p_assignment_type text DEFAULT 'monitoramento',p_can_create_simulation boolean DEFAULT true,p_can_monitor boolean DEFAULT true,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $body$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 IF public.h15_actor_organization() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACTIVE_TENANT_REQUIRED'; END IF;
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE';
END $body$;
CREATE OR REPLACE FUNCTION public.unassign_b2b_user_client_secure(p_user_id uuid,p_cliente_id uuid,p_reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $body$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 IF public.h15_actor_organization() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACTIVE_TENANT_REQUIRED'; END IF;
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE';
END $body$;
CREATE OR REPLACE FUNCTION public.get_b2b_partner_clients_for_assignment_secure(p_search text DEFAULT NULL)
RETURNS TABLE(cliente_id uuid,nome text,razao_social text,nome_fantasia text,cidade text,estado text,documento_mascarado text,active boolean,ja_vinculado_ao_parceiro boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $body$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 IF public.h15_actor_organization() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACTIVE_TENANT_REQUIRED'; END IF;
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE';
END $body$;
-- BF03: financial ownership cannot be inferred from an arbitrary order id.
CREATE OR REPLACE FUNCTION public.cancel_b2b_receivable_secure(p_partner_order_id uuid,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $body$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
 IF public.h15_actor_organization() IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ACTIVE_TENANT_REQUIRED'; END IF;
 RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='B2B_FINANCIAL_CONTRACT_UNAVAILABLE';
END $body$;
REVOKE ALL ON FUNCTION public.assign_b2b_user_client_secure(uuid,uuid,text,boolean,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.unassign_b2b_user_client_secure(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_b2b_partner_clients_for_assignment_secure(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cancel_b2b_receivable_secure(uuid,text) FROM PUBLIC,anon,authenticated;
-- Existing service_role ACL is intentionally not widened; bodies also deny it.
-- Rollback: only a reviewed successor with explicit A/P and creditor ownership
-- may reopen these surfaces. Do not restore the vulnerable bodies or grants.