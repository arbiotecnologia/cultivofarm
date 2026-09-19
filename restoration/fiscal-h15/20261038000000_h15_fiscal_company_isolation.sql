-- H15 canonical company isolation. Transaction owned by migration runner.
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public.organizations, public.profiles, public.company_fiscal_settings, public.fiscal_invoices IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm' AND environment_label='STAGING' AND production_emission_allowed IS FALSE) THEN
 RAISE EXCEPTION 'H15_CANONICAL_GATE'; END IF;
 IF (SELECT count(*) FROM public.organizations) <> 1 OR (SELECT count(*) FROM public.organizations WHERE ativo IS TRUE) <> 1
 OR (SELECT count(*) FROM public.company_fiscal_settings) <> 1
 OR (SELECT count(*) FROM public.company_fiscal_settings WHERE is_active AND fiscal_environment='HOMOLOGATION' AND production_enabled IS FALSE) <> 1
 OR EXISTS (SELECT 1 FROM public.fiscal_invoices) OR EXISTS (SELECT 1 FROM public.fiscal_certificates) OR EXISTS (SELECT 1 FROM public.fiscal_document_series)
 THEN RAISE EXCEPTION 'H15_BASELINE_CHANGED'; END IF;
END $guard$;
DO $drift$ BEGIN
 IF md5(pg_get_functiondef('public.fn_comprovante_entrega_montar_v1(uuid)'::regprocedure)) <> '7ba5c42c46d41c293b21a3e1d8c5ac9f' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_comprovante_entrega_montar_v1(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.fn_financial_inconsistencies()'::regprocedure)) <> 'bb0561e38d202cad1dc79ab0539fed4c' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_financial_inconsistencies()'; END IF;
 IF md5(pg_get_functiondef('public.fn_fiscal_assert_debtor_recipient(uuid)'::regprocedure)) <> 'dc6129167f9668a6e4b617824ce3c971' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_fiscal_assert_debtor_recipient(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.fn_fiscal_audit_base_reduction()'::regprocedure)) <> '75a9e528c09d434a6c2807908542f2cd' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_fiscal_audit_base_reduction()'; END IF;
 IF md5(pg_get_functiondef('public.fn_fiscal_company_crt()'::regprocedure)) <> 'ecc3a7cb8f5ba5435ee813960fc1f3bc' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_fiscal_company_crt()'; END IF;
 IF md5(pg_get_functiondef('public.fn_fiscal_emitter_pendencies(uuid)'::regprocedure)) <> 'a8d2d89d06574bb6bdc60a0030b0046b' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_fiscal_emitter_pendencies(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.fn_fiscal_emitter_pendencies_row(company_fiscal_settings)'::regprocedure)) <> 'eafb0bbe0af9be113f5e780971a54111' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_fiscal_emitter_pendencies_row(company_fiscal_settings)'; END IF;
 IF md5(pg_get_functiondef('public.fn_fiscal_environment_gate_v1(text)'::regprocedure)) <> 'fbde4f3e65439f85dcb57eae6bafa54f' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_fiscal_environment_gate_v1(text)'; END IF;
 IF md5(pg_get_functiondef('public.fn_fiscal_invoice_eligibility(text,uuid)'::regprocedure)) <> '8a5a0bdc807adedf4692a2de687da199' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_fiscal_invoice_eligibility(text,uuid)'; END IF;
 IF md5(pg_get_functiondef('public.fn_fiscal_invoice_eligibility(text,uuid,uuid)'::regprocedure)) <> '079dba02241c54d03759ada71399217d' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_fiscal_invoice_eligibility(text,uuid,uuid)'; END IF;
 IF md5(pg_get_functiondef('public.fn_fiscal_scenario_coverage()'::regprocedure)) <> 'ffe68f12ea584bf53c56bc85a2ed4fa8' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:fn_fiscal_scenario_coverage()'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_calculate_invoice_v1(uuid,text)'::regprocedure)) <> 'de6494a3b418e4c2dcd590656d27c70b' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_calculate_invoice_v1(uuid,text)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_calculate_service_invoice_v1(uuid,text,boolean)'::regprocedure)) <> '9b2f8da105cf9c43d2a3651938c1b19f' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_calculate_service_invoice_v1(uuid,text,boolean)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_certificate_register_a1(uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text[],text,text,integer,text,text)'::regprocedure)) <> '5ed6823c5e3ceec316ba84d1019513fe' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_certificate_register_a1(uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text[],text,text,integer,text,text)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_certificate_register_os(uuid,jsonb)'::regprocedure)) <> 'd5254296c1c458b92768f0258a8c0cc3' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_certificate_register_os(uuid,jsonb)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_certificate_revoke(uuid,text)'::regprocedure)) <> '395b55b502aea1ecdc2d1ef0794f3e74' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_certificate_revoke(uuid,text)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_company_rtc_get()'::regprocedure)) <> '810126476e2251f6580808737fac9dfb' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_company_rtc_get()'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_company_rtc_save(jsonb,text)'::regprocedure)) <> 'f07c2b710d07f350d3ae0f4fff87debb' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_company_rtc_save(jsonb,text)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_company_settings_init()'::regprocedure)) <> 'dbc0a6c31514ee22208d7119a5b666b1' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_company_settings_init()'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_draft_save(uuid,jsonb,jsonb,integer)'::regprocedure)) <> '71d96ef75040412cc406048ce6574871' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_draft_save(uuid,jsonb,jsonb,integer)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_draft_validate_homologation(uuid)'::regprocedure)) <> 'a55a7e5bafef8ebd790c56f1f922cb1a' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_draft_validate_homologation(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_emitter_accounting_validate(text)'::regprocedure)) <> '72272651548c73a27b9783d5a51278a0' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_emitter_accounting_validate(text)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_emitter_request_accounting_review(text)'::regprocedure)) <> '3fb243804678de643ee7666b3744ad23' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_emitter_request_accounting_review(text)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_event_manual(uuid,text,text,text)'::regprocedure)) <> '71b6e629352cf2bf1beeb75da7eb1ae3' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_event_manual(uuid,text,text,text)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_event_sefaz_mark_signed_v1(uuid,text,text,uuid)'::regprocedure)) <> '6dfef7e3dc71254746bb86da6e925024' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_event_sefaz_mark_signed_v1(uuid,text,text,uuid)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)'::regprocedure)) <> '426e7c667785a48a5ec6db870de6d469' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_event_sefaz_reconcile_v1(uuid,uuid,text,text,text,timestamp with time zone)'::regprocedure)) <> '474c1e8cb40a15bc9fcb2544fef1c4b6' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_event_sefaz_reconcile_v1(uuid,uuid,text,text,text,timestamp with time zone)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_homologation_readiness()'::regprocedure)) <> 'e65d55b798c950dc566bb04226f8dead' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_homologation_readiness()'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_homologation_readiness_rtc_check()'::regprocedure)) <> 'd2925334e9c4efbbfa3ea44f3f1ef2bf' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_homologation_readiness_rtc_check()'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_homologation_readiness_v2()'::regprocedure)) <> '97fdaef110fbe18f9930ba4540265165' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_homologation_readiness_v2()'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_nfe_readiness_v1()'::regprocedure)) <> '8e7a1815e6a2d38249cdd2554f512f20' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_nfe_readiness_v1()'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_preflight_v1(uuid)'::regprocedure)) <> 'dbaf89287d1fca2277cadb2ceed294ac' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_preflight_v1(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_reserve_nfe_number_v1(uuid,text)'::regprocedure)) <> '7fcf2dcab61fc7f3351633e91d44ec9b' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_reserve_nfe_number_v1(uuid,text)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_sefaz_transmission_status_v1(uuid)'::regprocedure)) <> '65f4d8b3deb42ae5277f43925239058a' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_sefaz_transmission_status_v1(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_tax_preview_v1(uuid,jsonb)'::regprocedure)) <> '34eb3894101eaf0edde224e67db6f363' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_tax_preview_v1(uuid,jsonb)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_xml_prepare_v1(uuid,text)'::regprocedure)) <> '4ca487f33703a3687c62308b7729ff72' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_xml_prepare_v1(uuid,text)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_xml_record_v1(uuid,text,jsonb)'::regprocedure)) <> 'f4c9030df4c2239a6560ac98693d1388' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_xml_record_v1(uuid,text,jsonb)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_fiscal_xml_status_v1(uuid)'::regprocedure)) <> 'b271aff3a74bc76a7baa07cba6a9c0d3' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_fiscal_xml_status_v1(uuid)'; END IF;
 IF md5(pg_get_functiondef('public.rpc_upsert_fiscal_invoice_manual(uuid,jsonb)'::regprocedure)) <> 'f0c1b15c3f5bc4e44eb7ca130656edad' THEN RAISE EXCEPTION 'H15_FUNCTION_DRIFT:rpc_upsert_fiscal_invoice_manual(uuid,jsonb)'; END IF;
END $drift$;
ALTER TABLE public.company_fiscal_settings ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;
UPDATE public.company_fiscal_settings SET organization_id=(SELECT id FROM public.organizations WHERE ativo IS TRUE) WHERE organization_id IS NULL;
ALTER TABLE public.company_fiscal_settings ALTER COLUMN organization_id SET NOT NULL;
DROP INDEX public.ux_company_fiscal_settings_active_singleton;
CREATE UNIQUE INDEX ux_company_fiscal_settings_active_organization ON public.company_fiscal_settings(organization_id) WHERE is_active IS TRUE;
CREATE INDEX ix_company_fiscal_settings_organization ON public.company_fiscal_settings(organization_id);
ALTER TABLE public.fiscal_invoices ADD COLUMN company_settings_id uuid NOT NULL REFERENCES public.company_fiscal_settings(id) ON DELETE RESTRICT;
CREATE INDEX ix_fiscal_invoices_company_settings ON public.fiscal_invoices(company_settings_id);
CREATE OR REPLACE FUNCTION public.h15_actor_organization() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE
 WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND
 (public.has_role(auth.uid(),'administrador'::public.app_role) OR public.has_role(auth.uid(),'gestor'::public.app_role) OR public.has_role(auth.uid(),'financeiro'::public.app_role));
$h15$;
CREATE OR REPLACE FUNCTION public.h15_company_access(p_company uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
 SELECT EXISTS(SELECT 1 FROM public.company_fiscal_settings c WHERE c.id=p_company AND c.organization_id=public.h15_actor_organization());
$h15$;
CREATE OR REPLACE FUNCTION public.h15_invoice_access(p_invoice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
 SELECT EXISTS(SELECT 1 FROM public.fiscal_invoices i WHERE i.id=p_invoice AND public.h15_company_access(i.company_settings_id));
$h15$;
CREATE OR REPLACE FUNCTION public.h15_require_staff() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
BEGIN IF public.h15_actor_organization() IS NULL THEN RAISE EXCEPTION 'H15_ORGANIZATION_FORBIDDEN' USING ERRCODE='42501'; END IF; END $h15$;
CREATE OR REPLACE FUNCTION public.h15_require_invoice(p_invoice uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
BEGIN IF NOT public.h15_invoice_access(p_invoice) THEN RAISE EXCEPTION 'H15_INVOICE_FORBIDDEN' USING ERRCODE='42501'; END IF; END $h15$;
CREATE OR REPLACE FUNCTION public.h15_require_company(p_company uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
BEGIN IF NOT public.h15_company_access(p_company) THEN RAISE EXCEPTION 'H15_COMPANY_FORBIDDEN' USING ERRCODE='42501'; END IF; END $h15$;
CREATE OR REPLACE FUNCTION public.h15_active_company() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
DECLARE r uuid; n integer;
BEGIN
 PERFORM public.h15_require_staff();
 SELECT count(*),min(id::text)::uuid INTO n,r FROM public.company_fiscal_settings WHERE organization_id=public.h15_actor_organization() AND is_active;
 IF n<>1 THEN RAISE EXCEPTION 'H15_ACTIVE_COMPANY_AMBIGUOUS' USING ERRCODE='42501'; END IF;
 RETURN r;
END $h15$;
REVOKE ALL ON FUNCTION public.h15_actor_organization() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.h15_actor_organization() TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.h15_company_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.h15_company_access(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.h15_invoice_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.h15_invoice_access(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.h15_require_staff() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.h15_require_staff() TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.h15_require_invoice(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.h15_require_invoice(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.h15_require_company(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.h15_require_company(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.h15_active_company() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.h15_active_company() TO authenticated,service_role;
ALTER POLICY "company_fiscal_settings_delete" ON public.company_fiscal_settings USING ((false) AND (organization_id = public.h15_actor_organization()));
ALTER POLICY "company_fiscal_settings_insert" ON public.company_fiscal_settings WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role)) AND (organization_id = public.h15_actor_organization()));
ALTER POLICY "company_fiscal_settings_read" ON public.company_fiscal_settings USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (organization_id = public.h15_actor_organization()));
ALTER POLICY "company_fiscal_settings_update" ON public.company_fiscal_settings USING ((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role)) AND (organization_id = public.h15_actor_organization())) WITH CHECK ((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role)) AND (organization_id = public.h15_actor_organization()));
ALTER POLICY "fiscal_protocoled_documents_read" ON public.fiscal_protocoled_documents USING ((fn_fiscal_can_operate(auth.uid())) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fi_staff_delete" ON public.fiscal_invoices USING ((false) AND (public.h15_company_access(company_settings_id)));
ALTER POLICY "fi_staff_insert" ON public.fiscal_invoices WITH CHECK (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_company_access(company_settings_id)));
ALTER POLICY "fi_staff_select" ON public.fiscal_invoices USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_company_access(company_settings_id)));
ALTER POLICY "fi_staff_update" ON public.fiscal_invoices USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_company_access(company_settings_id))) WITH CHECK (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_company_access(company_settings_id)));
ALTER POLICY "f3_internal_read_fiscal_number_reservations" ON public.fiscal_number_reservations USING ((fn_fiscal_can_read_internal()) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_stock_loss_contexts_insert" ON public.fiscal_stock_loss_contexts WITH CHECK (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_stock_loss_contexts_read" ON public.fiscal_stock_loss_contexts USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'administrativo'::app_role))) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_xml_runs_select_internal" ON public.fiscal_xml_runs USING ((fn_fiscal_can_read_internal(( SELECT auth.uid() AS uid))) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "f3_internal_read_fiscal_calculation_runs" ON public.fiscal_calculation_runs USING ((fn_fiscal_can_read_internal()) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fc_read_metadata" ON public.fiscal_certificates USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role))) AND (public.h15_company_access(company_settings_id)));
ALTER POLICY "f3_internal_read_fiscal_document_series" ON public.fiscal_document_series USING ((fn_fiscal_can_read_internal()) AND (public.h15_company_access(company_id)));
ALTER POLICY "fiscal_events_no_delete" ON public.fiscal_events USING ((false) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_events_no_update" ON public.fiscal_events USING ((false) AND (public.h15_invoice_access(fiscal_invoice_id))) WITH CHECK ((false) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_events_read" ON public.fiscal_events USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_idempotency_read" ON public.fiscal_idempotency_keys USING ((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role)) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_invoice_item_references_insert" ON public.fiscal_invoice_item_references WITH CHECK (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (EXISTS (SELECT 1 FROM public.fiscal_invoice_items i WHERE i.id=fiscal_invoice_item_id AND public.h15_invoice_access(i.fiscal_invoice_id))));
ALTER POLICY "fiscal_invoice_item_references_read" ON public.fiscal_invoice_item_references USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'administrativo'::app_role))) AND (EXISTS (SELECT 1 FROM public.fiscal_invoice_items i WHERE i.id=fiscal_invoice_item_id AND public.h15_invoice_access(i.fiscal_invoice_id))));
ALTER POLICY "fiscal_invoice_items_read" ON public.fiscal_invoice_items USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_invoice_items_write" ON public.fiscal_invoice_items USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_invoice_access(fiscal_invoice_id))) WITH CHECK (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_invoice_references_insert" ON public.fiscal_invoice_references WITH CHECK (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role))) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_invoice_references_read" ON public.fiscal_invoice_references USING (((has_role(( SELECT auth.uid() AS uid), 'administrador'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'gestor'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'financeiro'::app_role) OR has_role(( SELECT auth.uid() AS uid), 'administrativo'::app_role))) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_sefaz_tx_no_delete" ON public.fiscal_sefaz_transmissions USING ((false) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_sefaz_tx_no_insert" ON public.fiscal_sefaz_transmissions WITH CHECK ((false) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_sefaz_tx_no_update" ON public.fiscal_sefaz_transmissions USING ((false) AND (public.h15_invoice_access(fiscal_invoice_id)));
ALTER POLICY "fiscal_sefaz_tx_read" ON public.fiscal_sefaz_transmissions USING ((fn_fiscal_can_read_internal(( SELECT auth.uid() AS uid))) AND (public.h15_invoice_access(fiscal_invoice_id)));
CREATE OR REPLACE FUNCTION public.h15_invoice_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
DECLARE c public.company_fiscal_settings; creator_org uuid; k text; expected text; actual text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.company_settings_id IS DISTINCT FROM OLD.company_settings_id OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
 RAISE EXCEPTION 'H15_INVOICE_OWNERSHIP_IMMUTABLE' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM public.company_fiscal_settings WHERE id=NEW.company_settings_id;
 SELECT organization_id INTO creator_org FROM public.profiles WHERE user_id=NEW.created_by;
 IF c.id IS NULL OR creator_org IS DISTINCT FROM c.organization_id THEN RAISE EXCEPTION 'H15_CREATOR_ORGANIZATION_MISMATCH' USING ERRCODE='23514'; END IF;
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
 PERFORM public.h15_require_company(c.id);
 IF TG_OP='INSERT' AND NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'H15_CREATOR_FORGED' USING ERRCODE='42501'; END IF;
 END IF;
 IF NEW.company_cnpj IS NOT NULL AND regexp_replace(NEW.company_cnpj,'[^0-9]','','g') IS DISTINCT FROM regexp_replace(c.cnpj,'[^0-9]','','g') THEN
 RAISE EXCEPTION 'H15_CNPJ_MISMATCH' USING ERRCODE='23514'; END IF;
 IF NEW.company_snapshot IS NOT NULL AND NEW.company_snapshot <> '{}'::jsonb THEN
 IF NOT (NEW.company_snapshot ? 'cnpj') OR NULLIF(NEW.company_snapshot->>'cnpj','') IS NULL THEN RAISE EXCEPTION 'H15_SNAPSHOT_CNPJ_REQUIRED' USING ERRCODE='23514'; END IF;
 IF jsonb_typeof(NEW.company_snapshot)<>'object' THEN RAISE EXCEPTION 'H15_SNAPSHOT_INVALID' USING ERRCODE='23514'; END IF;
 -- All identity fields supplied must agree; absent fields remain draft pendencies.
 FOR k IN SELECT jsonb_object_keys(NEW.company_snapshot) LOOP
 actual:=NEW.company_snapshot->>k;
 expected:=CASE k WHEN 'cnpj' THEN c.cnpj WHEN 'legalName' THEN c.legal_name WHEN 'ie' THEN c.state_registration WHEN 'uf' THEN c.state WHEN 'municipalityIbge' THEN c.municipality_ibge_code WHEN 'series' THEN c.nfe_series_number::text WHEN 'environment' THEN c.nfe_environment_code WHEN 'legal_name' THEN c.legal_name WHEN 'crt' THEN c.crt WHEN 'state_registration' THEN c.state_registration WHEN 'state' THEN c.state WHEN 'municipality_ibge_code' THEN c.municipality_ibge_code WHEN 'nfe_series' THEN c.nfe_series::text WHEN 'nfse_series' THEN c.nfse_series::text WHEN 'fiscal_environment' THEN c.fiscal_environment ELSE NULL END;
 IF k IN ('legalName','ie','uf','municipalityIbge','series','environment','cnpj','legal_name','crt','state_registration','state','municipality_ibge_code','nfe_series','nfse_series','fiscal_environment') AND actual IS DISTINCT FROM expected THEN
 RAISE EXCEPTION 'H15_SNAPSHOT_MISMATCH:%',k USING ERRCODE='23514'; END IF;
 END LOOP;
 END IF;
 RETURN NEW;
END $h15$;
REVOKE ALL ON FUNCTION public.h15_invoice_integrity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER h15_invoice_integrity BEFORE INSERT OR UPDATE ON public.fiscal_invoices FOR EACH ROW EXECUTE FUNCTION public.h15_invoice_integrity();
CREATE OR REPLACE FUNCTION public.h15_company_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
BEGIN
 IF TG_OP='UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN RAISE EXCEPTION 'H15_COMPANY_ORGANIZATION_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' AND NEW.organization_id IS DISTINCT FROM public.h15_actor_organization() THEN RAISE EXCEPTION 'H15_COMPANY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $h15$;
REVOKE ALL ON FUNCTION public.h15_company_integrity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER h15_company_integrity BEFORE INSERT OR UPDATE ON public.company_fiscal_settings FOR EACH ROW EXECUTE FUNCTION public.h15_company_integrity();
-- Cross-links must refer to the same issuer, including service writes.
CREATE OR REPLACE FUNCTION public.h15_related_company(p_table text,p_id uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
DECLARE c uuid;
BEGIN
 CASE p_table
 WHEN 'company_fiscal_settings' THEN SELECT id INTO c FROM public.company_fiscal_settings WHERE id=p_id;
 WHEN 'fiscal_invoices' THEN SELECT company_settings_id INTO c FROM public.fiscal_invoices WHERE id=p_id;
 WHEN 'fiscal_certificates' THEN SELECT company_settings_id INTO c FROM public.fiscal_certificates WHERE id=p_id;
 WHEN 'fiscal_document_series' THEN SELECT company_id INTO c FROM public.fiscal_document_series WHERE id=p_id;
 WHEN 'fiscal_invoice_items' THEN SELECT i.company_settings_id INTO c FROM public.fiscal_invoice_items r JOIN public.fiscal_invoices i ON i.id=r.fiscal_invoice_id WHERE r.id=p_id;
 WHEN 'fiscal_events' THEN SELECT i.company_settings_id INTO c FROM public.fiscal_events r JOIN public.fiscal_invoices i ON i.id=r.fiscal_invoice_id WHERE r.id=p_id;
 WHEN 'fiscal_xml_runs' THEN SELECT i.company_settings_id INTO c FROM public.fiscal_xml_runs r JOIN public.fiscal_invoices i ON i.id=r.fiscal_invoice_id WHERE r.id=p_id;
 WHEN 'fiscal_number_reservations' THEN SELECT i.company_settings_id INTO c FROM public.fiscal_number_reservations r JOIN public.fiscal_invoices i ON i.id=r.fiscal_invoice_id WHERE r.id=p_id;
 WHEN 'fiscal_sefaz_transmissions' THEN SELECT i.company_settings_id INTO c FROM public.fiscal_sefaz_transmissions r JOIN public.fiscal_invoices i ON i.id=r.fiscal_invoice_id WHERE r.id=p_id;
 ELSE RAISE EXCEPTION 'H15_UNKNOWN_RELATION' USING ERRCODE='23514';
 END CASE;
 RETURN c;
END $h15$;
REVOKE ALL ON FUNCTION public.h15_related_company(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.h15_related_integrity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $h15$
DECLARE data jsonb:=to_jsonb(NEW); old_data jsonb; owner_company uuid; linked uuid; n integer; target uuid;
BEGIN
 IF TG_OP='UPDATE' THEN old_data:=to_jsonb(OLD);
 IF data->TG_ARGV[0] IS DISTINCT FROM old_data->TG_ARGV[0] THEN RAISE EXCEPTION 'H15_PARENT_IMMUTABLE' USING ERRCODE='23514'; END IF;
 END IF;
 target:=nullif(data->>TG_ARGV[0],'')::uuid;
 owner_company:=public.h15_related_company(TG_ARGV[1],target);
 IF owner_company IS NULL THEN RAISE EXCEPTION 'H15_PARENT_REQUIRED' USING ERRCODE='23514'; END IF;
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN PERFORM public.h15_require_company(owner_company); END IF;
 n:=2;
 WHILE n<TG_NARGS LOOP
 target:=nullif(data->>TG_ARGV[n],'')::uuid;
 IF target IS NOT NULL THEN
 linked:=public.h15_related_company(TG_ARGV[n+1],target);
 IF linked IS DISTINCT FROM owner_company THEN RAISE EXCEPTION 'H15_CROSS_COMPANY_REFERENCE:%',TG_ARGV[n] USING ERRCODE='23514'; END IF;
 END IF;
 n:=n+2;
 END LOOP;
 RETURN NEW;
END $h15$;
REVOKE ALL ON FUNCTION public.h15_related_integrity() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_invoices FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('company_settings_id','company_fiscal_settings','parent_invoice_id','fiscal_invoices','substitution_invoice_id','fiscal_invoices');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_invoice_items FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_invoice_references FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices','referenced_invoice_id','fiscal_invoices');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_invoice_item_references FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_item_id','fiscal_invoice_items','referenced_item_id','fiscal_invoice_items');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_certificates FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('company_settings_id','company_fiscal_settings');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_document_series FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('company_id','company_fiscal_settings');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_events FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices','related_event_id','fiscal_events','sefaz_transmission_id','fiscal_sefaz_transmissions');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_xml_runs FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices','reservation_id','fiscal_number_reservations','previous_run_id','fiscal_xml_runs','certificate_id','fiscal_certificates');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_number_reservations FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices','series_id','fiscal_document_series');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_sefaz_transmissions FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices','xml_run_id','fiscal_xml_runs','fiscal_event_id','fiscal_events');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_protocoled_documents FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices','transmission_id','fiscal_sefaz_transmissions','xml_run_id','fiscal_xml_runs');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_calculation_runs FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_idempotency_keys FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices');
CREATE TRIGGER h15_related_integrity BEFORE INSERT OR UPDATE ON public.fiscal_stock_loss_contexts FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity('fiscal_invoice_id','fiscal_invoices');
CREATE OR REPLACE FUNCTION public.fn_comprovante_entrega_montar_v1(p_entrega_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  e            public.entregas%ROWTYPE;
  v_emitente   jsonb;
  v_destino    jsonb;
  v_os         jsonb;
  v_itens      jsonb;
  v_transporte jsonb;
  v_receb      jsonb;
BEGIN
  PERFORM public.h15_require_staff();

  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'COMPROVANTE_UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT coalesce(public.is_delivery_staff(auth.uid()),false) THEN RAISE EXCEPTION 'COMPROVANTE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO e FROM public.entregas WHERE id = p_entrega_id;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'COMPROVANTE_ENTREGA_NAO_ENCONTRADA';
  END IF;

  SELECT jsonb_build_object(
           'razao_social', cs.legal_name,
           'nome_fantasia', cs.trade_name,
           'cnpj', cs.cnpj,
           'inscricao_estadual', cs.state_registration,
           'email', cs.fiscal_email,
           'telefone', cs.phone,
           'logradouro', cs.street,
           'numero', cs.number,
           'complemento', cs.complement,
           'bairro', cs.neighborhood,
           'cidade', cs.city,
           'uf', cs.state,
           'cep', cs.postal_code
         )
    INTO v_emitente
    FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) cs
   WHERE cs.is_active
   ORDER BY cs.updated_at DESC NULLS LAST
   LIMIT 1;

  SELECT jsonb_build_object(
           'cliente_id', c.id,
           'nome', coalesce(nullif(btrim(c.razao_social), ''), c.nome),
           'nome_fantasia', c.nome_fantasia,
           'cpf_cnpj', c.cpf_cnpj,
           'telefone', coalesce(nullif(btrim(c.telefone), ''), e.destinatario_telefone),
           'email', c.email,
           'cidade', coalesce(nullif(btrim(e.endereco_cidade), ''), c.endereco_municipio),
           'uf', coalesce(nullif(btrim(e.endereco_uf), ''), c.endereco_estado)
         )
    INTO v_destino
    FROM public.clientes c
   WHERE c.id = e.cliente_id;

  v_destino := coalesce(v_destino, '{}'::jsonb) || jsonb_build_object(
    'destinatario_nome', e.destinatario_nome,
    'local_entrega', nullif(btrim(concat_ws(', ',
        nullif(btrim(coalesce(e.endereco_logradouro, '')), ''),
        nullif(btrim(coalesce(e.endereco_numero, '')), ''),
        nullif(btrim(coalesce(e.endereco_bairro, '')), ''),
        nullif(btrim(coalesce(e.endereco_cidade, '')), ''),
        nullif(btrim(coalesce(e.endereco_uf, '')), ''))), '')
  );

  -- OS canonica: fluxo padrao (ordens_servico) ou fluxo On-Farm legitimo.
  SELECT jsonb_build_object(
           'os_id', o.id,
           'numero_os', o.numero_os,
           'origem', coalesce(o.origem, 'manual'),
           'tipo', 'ordem_servico'
         )
    INTO v_os
    FROM public.ordens_servico o
   WHERE o.id = e.ordem_servico_id;

  IF v_os IS NULL AND e.ordem_servico_onfarm_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'os_id', onf.id,
             'numero_os', onf.numero_os,
             'origem', 'on_farm',
             'tipo', 'ordem_servico_onfarm'
           )
      INTO v_os
      FROM public.ordens_servico_onfarm onf
     WHERE onf.id = e.ordem_servico_onfarm_id;
  END IF;

  -- Origem legitima adicional mapeada no dominio: entrega vinculada a pedido
  -- de parceiro (B2B) sem OS de laboratorio. Documentado em
  -- docs/auditorias/comprovante-entrega-fase2.md.
  IF v_os IS NULL AND e.partner_order_id IS NOT NULL THEN
    SELECT jsonb_build_object(
             'os_id', po.id,
             'numero_os', po.numero,
             'origem', 'pedido_parceiro',
             'tipo', 'partner_order'
           )
      INTO v_os
      FROM public.partner_orders po
     WHERE po.id = e.partner_order_id;
  END IF;

  -- Itens: caminho canonico por etiqueta
  SELECT jsonb_agg(item ORDER BY item->>'lote')
    INTO v_itens
    FROM (
      SELECT jsonb_build_object(
               'produto', coalesce(pe.produto_nome, pr.nome),
               'microrganismo', coalesce(array_to_string(pe.cepas, ', '), m.nome_cientifico, m.nome),
               'lote', coalesce(pe.lote_codigo, l.codigo_lote),
               'fabricacao', coalesce(pe.fabricado_em::date, l.data_producao),
               'validade', pe.validade_em::date,
               'embalagem', coalesce(eb.tipo_embalagem, pe.unidade),
               'quantidade', coalesce(pe.quantidade_embalagens, 1),
               'volume_unitario_ml', pe.volume,
               'volume_total_ml', coalesce(pe.volume, 0) * coalesce(pe.quantidade_embalagens, 1)
             ) AS item
        FROM public.entrega_etiquetas ee
        JOIN public.produto_etiquetas pe ON pe.id = ee.etiqueta_id
        LEFT JOIN public.produtos pr ON pr.id = pe.produto_id
        LEFT JOIN public.lotes l ON l.id = pe.lote_id
        LEFT JOIN public.microrganismos m ON m.id = l.microrganismo_id
        LEFT JOIN public.estoque_embalagens eb ON eb.id = pe.embalagem_id
       WHERE ee.entrega_id = p_entrega_id AND ee.ativo
    ) s;

  -- Fallback: vinculo direto da entrega (fluxo classico produto_id/lote_id).
  -- Referencias sempre por e2 (linha atual), sem depender da variavel PL/pgSQL.
  IF v_itens IS NULL OR jsonb_array_length(v_itens) = 0 THEN
    SELECT jsonb_build_array(jsonb_build_object(
             'produto', pr.nome,
             'microrganismo', coalesce(m.nome_cientifico, m.nome),
             'lote', l.codigo_lote,
             'fabricacao', l.data_producao,
             'validade', ep.validade,
             'embalagem', env.tipo_embalagem,
             'quantidade', e2.quantidade_entregue,
             'volume_unitario_ml', coalesce(
               env.volume_por_unidade,
               CASE WHEN coalesce(e2.quantidade_entregue, 0) > 0
                    THEN round(e2.volume_entregue_ml / e2.quantidade_entregue, 2) END),
             'volume_total_ml', coalesce(
               e2.volume_entregue_ml,
               env.volume_por_unidade * e2.quantidade_entregue)
           ))
      INTO v_itens
      FROM public.entregas e2
      LEFT JOIN public.produtos pr
             ON pr.id = coalesce(e2.produto_id,
                                 (SELECT l2.produto_id FROM public.lotes l2 WHERE l2.id = e2.lote_id))
      LEFT JOIN public.lotes l ON l.id = e2.lote_id
      LEFT JOIN public.microrganismos m ON m.id = l.microrganismo_id
      LEFT JOIN public.estoque_produto ep ON ep.id = e2.estoque_produto_id
      LEFT JOIN LATERAL (
        SELECT en.tipo_embalagem, en.volume_por_unidade
          FROM public.envase en
         WHERE en.lote_id = e2.lote_id
         ORDER BY en.data_envase DESC NULLS LAST
         LIMIT 1
      ) env ON true
     WHERE e2.id = p_entrega_id;
  END IF;

  v_transporte := jsonb_build_object(
    'modalidade', e.tipo_entrega,
    'motorista', e.motorista,
    'motorista_telefone', e.motorista_telefone,
    'veiculo', e.veiculo,
    'placa', e.veiculo_placa,
    'veiculo_tipo', e.veiculo_tipo,
    'data_saida', e.data_saida,
    'hora_saida_prevista', e.hora_saida_prevista
  );

  v_receb := jsonb_build_object(
    'recebido_por_nome', coalesce(nullif(btrim(coalesce(e.recebido_por_nome, '')), ''),
                                  nullif(btrim(coalesce(e.recebedor_nome, '')), '')),
    'documento', coalesce(e.recebido_por_documento, e.recebedor_documento),
    'cargo', coalesce(e.recebido_por_cargo, e.recebedor_cargo),
    'observacoes', e.observacoes_confirmacao,
    'confirmado_em', coalesce(e.confirmada_em, e.entregue_em, e.recebimento_confirmado_em),
    'confirmado_por', coalesce(e.confirmado_por, e.confirmada_por, e.recebimento_confirmado_por),
    'assinatura_tipo', e.assinatura_tipo
  );

  RETURN jsonb_build_object(
    'template_versao', 'comprovante-entrega-v1',
    'entrega_id', e.id,
    'entrega_status', e.status::text,
    'emitente', coalesce(v_emitente, '{}'::jsonb),
    'destinatario', coalesce(v_destino, '{}'::jsonb),
    'ordem_servico', v_os,
    'itens', coalesce(v_itens, '[]'::jsonb),
    'transporte', v_transporte,
    'recebimento', v_receb
  );
END
$function$
;
REVOKE EXECUTE ON FUNCTION public.fn_comprovante_entrega_montar_v1(uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.fn_financial_inconsistencies()
 RETURNS TABLE(code text, severity text, entity_type text, entity_id uuid, description text, recommended_action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.h15_require_staff();

  IF NOT public.is_financial_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE='insufficient_privilege';
  END IF;

  RETURN QUERY
  -- 1. Entrega BILLED sem receivable_id
  SELECT 'DELIVERY_BILLED_NO_AR'::text, 'alta'::text, 'entregas'::text, e.id,
         'Entrega marcada como faturada sem título financeiro vinculado.'::text,
         'Reprocessar faturamento ou reverter status para PENDING_BILLING.'::text
    FROM public.entregas e
   WHERE e.financial_status = 'BILLED' AND e.receivable_id IS NULL

  UNION ALL
  -- 2. Entrega NOT_BILLABLE com receivable_id
  SELECT 'DELIVERY_NOT_BILLABLE_WITH_AR', 'alta', 'entregas', e.id,
         'Entrega marcada como sem cobrança porém possui título financeiro.',
         'Revisar status financeiro da entrega ou cancelar o título.'
    FROM public.entregas e
   WHERE e.financial_status = 'NOT_BILLABLE' AND e.receivable_id IS NOT NULL

  UNION ALL
  -- 3. Entrega com receivable_id apontando para AR inexistente
  SELECT 'DELIVERY_AR_BROKEN_FK', 'critica', 'entregas', e.id,
         'Entrega referencia um título que não existe mais.',
         'Limpar receivable_id ou recriar o título via faturamento.'
    FROM public.entregas e
    LEFT JOIN public.accounts_receivable ar ON ar.id = e.receivable_id
   WHERE e.receivable_id IS NOT NULL AND ar.id IS NULL

  UNION ALL
  -- 4. AR sem parcelas
  SELECT 'AR_NO_INSTALLMENTS', 'alta', 'accounts_receivable', ar.id,
         'Conta a receber sem parcelas geradas.',
         'Gerar parcelas manualmente ou cancelar o título.'
    FROM public.accounts_receivable ar
    LEFT JOIN public.accounts_receivable_installments ari ON ari.receivable_id = ar.id
   WHERE ar.status <> 'CANCELED'
   GROUP BY ar.id
  HAVING count(ari.id) = 0

  UNION ALL
  -- 5. AP sem parcelas
  SELECT 'AP_NO_INSTALLMENTS', 'alta', 'accounts_payable', ap.id,
         'Conta a pagar sem parcelas geradas.',
         'Gerar parcelas manualmente ou cancelar o título.'
    FROM public.accounts_payable ap
    LEFT JOIN public.accounts_payable_installments api ON api.payable_id = ap.id
   WHERE ap.status <> 'CANCELED'
   GROUP BY ap.id
  HAVING count(api.id) = 0

  UNION ALL
  -- 6. AR PAID com parcela ainda em aberto
  SELECT 'AR_PAID_OPEN_INSTALLMENT', 'critica', 'accounts_receivable', ar.id,
         'Título marcado como PAGO mas possui parcela em aberto/parcial/vencida.',
         'Reprocessar status do título.'
    FROM public.accounts_receivable ar
   WHERE ar.status = 'PAID'
     AND EXISTS (
       SELECT 1 FROM public.accounts_receivable_installments ari
        WHERE ari.receivable_id = ar.id AND ari.status IN ('OPEN','PARTIAL','OVERDUE')
     )

  UNION ALL
  -- 7. AP PAID com parcela ainda em aberto
  SELECT 'AP_PAID_OPEN_INSTALLMENT', 'critica', 'accounts_payable', ap.id,
         'Título marcado como PAGO mas possui parcela em aberto/parcial/vencida.',
         'Reprocessar status do título.'
    FROM public.accounts_payable ap
   WHERE ap.status = 'PAID'
     AND EXISTS (
       SELECT 1 FROM public.accounts_payable_installments api
        WHERE api.payable_id = ap.id AND api.status IN ('OPEN','PARTIAL','OVERDUE')
     )

  UNION ALL
  -- 8. Conta CANCELED com pagamento ativo (não estorno)
  SELECT 'AR_CANCELED_WITH_PAYMENT', 'alta', 'accounts_receivable', ar.id,
         'Título cancelado possui baixas ativas não estornadas.',
         'Estornar pagamentos antes de manter o cancelamento.'
    FROM public.accounts_receivable ar
   WHERE ar.status = 'CANCELED'
     AND EXISTS (
       SELECT 1 FROM public.accounts_receivable_installments ari
        JOIN public.receivable_payments rp ON rp.installment_id = ari.id
       WHERE ari.receivable_id = ar.id AND COALESCE(rp.is_reversal,false) = false
         AND NOT EXISTS (SELECT 1 FROM public.receivable_payments rp2 WHERE rp2.reversed_payment_id = rp.id)
     )

  UNION ALL
  -- 9. Recibo emitido para pagamento de estorno
  SELECT 'RECEIPT_FOR_REVERSAL', 'alta', 'financial_receipts', fr.id,
         'Recibo emitido sobre um lançamento de estorno.',
         'Cancelar o recibo.'
    FROM public.financial_receipts fr
    JOIN public.receivable_payments rp ON rp.id = fr.payment_id
   WHERE fr.status = 'ISSUED' AND rp.is_reversal = true

  UNION ALL
  -- 10. Recibo emitido para pagamento inexistente
  SELECT 'RECEIPT_PAYMENT_BROKEN_FK', 'critica', 'financial_receipts', fr.id,
         'Recibo aponta para pagamento inexistente.',
         'Cancelar o recibo ou restaurar o pagamento.'
    FROM public.financial_receipts fr
    LEFT JOIN public.receivable_payments rp ON rp.id = fr.payment_id
   WHERE fr.status = 'ISSUED' AND fr.payment_id IS NOT NULL AND rp.id IS NULL

  UNION ALL
  -- 11. NF vinculada a AR inexistente
  SELECT 'FISCAL_INVOICE_AR_BROKEN_FK', 'critica', 'fiscal_invoices', fi.id,
         'Nota fiscal vinculada a um título que não existe.',
         'Religar a NF a um título válido ou cancelá-la.'
    FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi
    LEFT JOIN public.accounts_receivable ar ON ar.id = fi.receivable_id
   WHERE fi.receivable_id IS NOT NULL AND ar.id IS NULL

  UNION ALL
  -- 12. Documento financeiro órfão (owner_id sem registro)
  SELECT 'FINANCIAL_DOC_ORPHAN', 'media', 'financial_documents', fd.id,
         'Documento financeiro vinculado a um registro inexistente ('||fd.owner_type||').',
         'Excluir logicamente ou religar a entidade correta.'
    FROM public.financial_documents fd
   WHERE fd.deleted_at IS NULL
     AND (
       (fd.owner_type = 'RECEIVABLE' AND NOT EXISTS (SELECT 1 FROM public.accounts_receivable WHERE id = fd.owner_id))
       OR (fd.owner_type = 'PAYABLE' AND NOT EXISTS (SELECT 1 FROM public.accounts_payable WHERE id = fd.owner_id))
       OR (fd.owner_type = 'FISCAL_INVOICE' AND public.h15_invoice_access(fd.owner_id) AND NOT EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = fd.owner_id))
       OR (fd.owner_type IN ('PAYMENT_RECEIVABLE') AND NOT EXISTS (SELECT 1 FROM public.receivable_payments WHERE id = fd.owner_id))
       OR (fd.owner_type IN ('PAYMENT_PAYABLE') AND NOT EXISTS (SELECT 1 FROM public.payable_payments WHERE id = fd.owner_id))
       OR (fd.owner_type = 'FINANCIAL_RECEIPT' AND NOT EXISTS (SELECT 1 FROM public.financial_receipts WHERE id = fd.owner_id))
     )

  UNION ALL
  -- 13. Entrega faturada duplicada (mesma entrega com >1 AR)
  SELECT 'DELIVERY_DUPLICATED_AR', 'critica', 'accounts_receivable', ar.id,
         'Mais de um título financeiro foi gerado para a mesma entrega.',
         'Cancelar os títulos extras.'
    FROM public.accounts_receivable ar
   WHERE ar.origin_type = 'DELIVERY'
     AND ar.origin_id IN (
       SELECT origin_id FROM public.accounts_receivable
        WHERE origin_type = 'DELIVERY' AND origin_id IS NOT NULL AND status <> 'CANCELED'
        GROUP BY origin_id HAVING count(*) > 1
     )

  ORDER BY 2, 1, 4;
END $function$
;
REVOKE EXECUTE ON FUNCTION public.fn_financial_inconsistencies() FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.fn_fiscal_assert_debtor_recipient(_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  elig jsonb; v_debtor uuid; v_expected uuid;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(_invoice_id);

  SELECT * INTO inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = _invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', _invoice_id;
  END IF;

  IF coalesce(inv.source_type,'') NOT IN ('PARTNER_ORDER','ENTREGA') THEN
    RAISE EXCEPTION 'FISCAL_SOURCE_TYPE_UNSUPPORTED: escopo % nao suportado nesta fase.', coalesce(inv.source_type,'-');
  END IF;

  elig := public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id);
  v_debtor := nullif(elig->>'debtorPartnerId','')::uuid;

  IF v_debtor IS NULL THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: parceiro devedor nao resolvido para a origem % .', inv.source_type
      USING HINT = 'Somente o parceiro B2B devedor pode figurar como destinatario; produtor final vinculado nunca e devedor.';
  END IF;

  v_expected := public.fn_fiscal_partner_fiscal_customer(v_debtor);

  IF v_expected IS NULL THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: parceiro devedor sem cliente fiscal (partner_accounts.client_id) cadastrado.'
      USING HINT = 'Vincule a conta do parceiro ao cliente fiscal antes de faturar.';
  END IF;

  IF inv.customer_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: documento sem destinatario (customer_id) definido.';
  END IF;

  IF inv.customer_id <> v_expected THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: destinatario do documento nao corresponde ao cliente fiscal do parceiro devedor.'
      USING HINT = 'Emissao bloqueada sem qualquer efeito colateral. Corrija o destinatario ou o devedor.';
  END IF;

  IF inv.debtor_partner_id IS NOT NULL AND inv.debtor_partner_id <> v_debtor THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: debtor_partner_id do documento diverge do devedor da origem.';
  END IF;

  IF inv.debtor_customer_id IS NOT NULL AND inv.debtor_customer_id <> v_expected THEN
    RAISE EXCEPTION 'FISCAL_DEBTOR_RECIPIENT_MISMATCH: debtor_customer_id do documento diverge do cliente fiscal do parceiro devedor.';
  END IF;

  RETURN jsonb_build_object(
    'debtorPartnerId', v_debtor,
    'recipientCustomerId', v_expected,
    'sourceType', inv.source_type,
    'orderId', elig->>'orderId');
END $function$
;
REVOKE EXECUTE ON FUNCTION public.fn_fiscal_assert_debtor_recipient(uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.fn_fiscal_audit_base_reduction() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_fiscal_audit_base_reduction() TO service_role;
CREATE OR REPLACE FUNCTION public.fn_fiscal_company_crt()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN NOT (
      auth.uid() IS NULL
      OR public.fn_fiscal_can_read_internal(auth.uid())
      OR public.can_view_catalog_internal(auth.uid())
    ) THEN NULL::text ELSE (
    SELECT nullif(btrim(coalesce(c.crt,'')),'')
      FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) c
     WHERE c.is_active = true
     ORDER BY c.updated_at DESC NULLS LAST
     LIMIT 1
  ) END
$function$
;
REVOKE EXECUTE ON FUNCTION public.fn_fiscal_company_crt() FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.fn_fiscal_emitter_pendencies(_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE r public.company_fiscal_settings%ROWTYPE;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_company(_id);

  SELECT * INTO r FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings WHERE id = _id;
  IF NOT FOUND THEN
    RETURN jsonb_build_array(jsonb_build_object('code','EMITTER_NOT_FOUND','field','id','severity','BLOCK'));
  END IF;
  RETURN public.fn_fiscal_emitter_pendencies_row(r);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.fn_fiscal_emitter_pendencies(uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.fn_fiscal_emitter_pendencies_row(r company_fiscal_settings)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE out jsonb := '[]'::jsonb; ie_state text;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_company(r.id);

  IF NOT public.fn_fiscal_cnpj_is_valid(r.cnpj) THEN
    out := out || jsonb_build_object('code','EMITTER_CNPJ_INVALID','field','cnpj','severity','BLOCK','message','CNPJ ausente ou com digito verificador invalido.');
  END IF;
  IF nullif(btrim(coalesce(r.legal_name,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_LEGAL_NAME_MISSING','field','legal_name','severity','BLOCK','message','Razao social obrigatoria.');
  END IF;
  IF r.crt IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_CRT_MISSING','field','crt','severity','BLOCK','message','CRT (1,2,3,4) obrigatorio.');
  END IF;
  IF nullif(btrim(coalesce(r.primary_cnae,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_CNAE_MISSING','field','primary_cnae','severity','BLOCK','message','CNAE principal obrigatorio.');
  END IF;
  IF r.pis_cofins_regime IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_PIS_COFINS_REGIME_MISSING','field','pis_cofins_regime','severity','BLOCK','message','Regime de PIS/COFINS obrigatorio para calculo.');
  END IF;
  IF NOT public.fn_fiscal_cep_is_valid(r.postal_code) THEN
    out := out || jsonb_build_object('code','EMITTER_CEP_INVALID','field','postal_code','severity','BLOCK','message','CEP deve ter 8 digitos.');
  END IF;
  IF public.fn_fiscal_uf_ibge_code(r.state) IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_UF_INVALID','field','state','severity','BLOCK','message','UF invalida.');
  ELSIF NOT public.fn_fiscal_ibge_municipio_coerente(r.municipality_ibge_code, r.state) THEN
    out := out || jsonb_build_object('code','EMITTER_IBGE_INCOHERENT','field','municipality_ibge_code','severity','BLOCK','message','Codigo IBGE do municipio ausente ou incoerente com a UF.');
  END IF;
  IF nullif(btrim(coalesce(r.street,'')),'') IS NULL
     OR nullif(btrim(coalesce(r.number,'')),'') IS NULL
     OR nullif(btrim(coalesce(r.neighborhood,'')),'') IS NULL
     OR nullif(btrim(coalesce(r.city,'')),'') IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_ADDRESS_INCOMPLETE','field','address','severity','BLOCK','message','Endereco completo obrigatorio (logradouro, numero, bairro, municipio).');
  END IF;
  IF coalesce(r.country_code,'') NOT IN ('1058','BR') THEN
    out := out || jsonb_build_object('code','EMITTER_COUNTRY_MISSING','field','country_code','severity','BLOCK','message','Pais obrigatorio (1058 - Brasil).');
  END IF;
  ie_state := public.fn_fiscal_ie_check(r.state, r.state_registration);
  IF ie_state IN ('MISSING','INVALID_LENGTH','INVALID_DV','INVALID_FORMAT','INVALID_UF') THEN
    out := out || jsonb_build_object('code','EMITTER_IE_INVALID','field','state_registration','severity','BLOCK','message','Inscricao estadual invalida para a UF: '||ie_state);
  ELSIF ie_state = 'VALID_LENGTH_DV_NOT_IMPLEMENTED' THEN
    out := out || jsonb_build_object('code','EMITTER_IE_DV_NOT_IMPLEMENTED','field','state_registration','severity','WARN','message','IE com formato compativel; digito verificador desta UF nao e verificado automaticamente.');
  END IF;
  IF r.nfe_series_number IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_SERIES_MISSING','field','nfe_series_number','severity','BLOCK','message','Serie da NF-e (1-999) obrigatoria.');
  END IF;
  IF r.nfe_environment_code IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_ENVIRONMENT_MISSING','field','nfe_environment_code','severity','BLOCK','message','Ambiente tpAmb (2 homologacao / 1 producao) obrigatorio.');
  END IF;
  IF jsonb_array_length(r.uf_accreditations) = 0 THEN
    out := out || jsonb_build_object('code','EMITTER_ACCREDITATION_MISSING','field','uf_accreditations','severity','BLOCK','message','Credenciamento por UF nao registrado.');
  END IF;
  IF r.certificate_ref IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_CERTIFICATE_MISSING','field','certificate_ref','severity','BLOCK','message','Certificado digital nao vinculado (fluxo privado de certificados).');
  END IF;
  IF r.accounting_validated_at IS NULL THEN
    out := out || jsonb_build_object('code','EMITTER_ACCOUNTING_NOT_VALIDATED','field','accounting_validated_at','severity','BLOCK','message','Validacao contabil pendente.');
  END IF;

  -- F3.1: ambiente de PRODUCAO (tpAmb=1) permanece BLOQUEADO nesta fase.
  IF coalesce(r.nfe_environment_code,'2') = '1' THEN
    out := out || jsonb_build_object('code','EMITTER_PRODUCTION_BLOCKED_F3','field','nfe_environment_code','severity','BLOCK',
      'message','Ambiente de producao (tpAmb=1) bloqueado na fase F3: teto e READY_HOMOLOGATION ate fluxo controlado de homologacao SEFAZ.');
  END IF;

  RETURN out;
END $function$
;
REVOKE EXECUTE ON FUNCTION public.fn_fiscal_emitter_pendencies_row(company_fiscal_settings) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.fn_fiscal_environment_gate_v1(p_operation text DEFAULT 'GENERIC'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
  v_env   text;
BEGIN
  IF current_setting('role',true) = 'service_role' THEN IF (SELECT count(*) FROM public.company_fiscal_settings WHERE is_active) <> 1 THEN RAISE EXCEPTION 'H15_SERVICE_EMITTER_AMBIGUOUS' USING ERRCODE='42501'; END IF; ELSE PERFORM public.h15_require_staff(); END IF;

  PERFORM public.fn_fiscal_assert_staging_marker(p_operation);

  SELECT count(*) INTO v_count FROM (SELECT * FROM public.company_fiscal_settings WHERE (organization_id = public.h15_actor_organization() OR current_setting('role',true) = 'service_role')) company_fiscal_settings WHERE is_active;
  IF v_count = 0 THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_EMITTER_NOT_CONFIGURED — nenhum emitente fiscal ativo (operacao=%).', p_operation;
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_EMITTER_AMBIGUOUS — % emitentes ativos (operacao=%).', v_count, p_operation;
  END IF;

  SELECT btrim(coalesce(nfe_environment_code, '')) INTO v_env
    FROM (SELECT * FROM public.company_fiscal_settings WHERE (organization_id = public.h15_actor_organization() OR current_setting('role',true) = 'service_role')) company_fiscal_settings WHERE is_active LIMIT 1;

  IF v_env IS NULL OR v_env NOT IN ('1', '2') THEN
    RAISE EXCEPTION
      'FISCAL_ENV_NOT_READY: FISCAL_ENVIRONMENT_INVALID — tpAmb ausente/invalido (operacao=%).', p_operation;
  END IF;
  IF v_env = '1' THEN
    RAISE EXCEPTION
      'FISCAL_PRODUCTION_DISABLED: FISCAL_PRODUCTION_BLOCKED — emissao em producao desabilitada (operacao=%).', p_operation;
  END IF;

  RETURN v_env;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.fn_fiscal_environment_gate_v1(text) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.fn_fiscal_invoice_eligibility(_source_type text, _source_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  reasons jsonb := '[]'::jsonb;
  po public.partner_orders%ROWTYPE;
  ent public.entregas%ROWTYPE;
  st text;
  v_order_id uuid;
  v_debtor uuid;
  n_items int := 0; n_quote int := 0; n_no_snapshot int := 0;
  canceled boolean := false;
  allowed text[];
BEGIN
  PERFORM public.h15_require_staff();

  IF _source_type IS NULL OR _source_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reasons',
      jsonb_build_array(jsonb_build_object('code','FISCAL_SOURCE_MISSING','severity','BLOCK',
        'message','Origem fiscal (pedido/entrega) obrigatoria.')));
  END IF;

  IF _source_type = 'PARTNER_ORDER' THEN
    SELECT * INTO po FROM public.partner_orders WHERE id = _source_id;
    IF NOT FOUND THEN
      reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_NOT_FOUND','severity','BLOCK','message','Pedido inexistente.');
    ELSE
      v_order_id := po.id;
      st := po.status::text;
      allowed := public.fn_fiscal_billing_allowed_order_status();

      IF st = 'cancelado' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_CANCELED','severity','BLOCK','message','Pedido cancelado; emissao bloqueada.');
      ELSIF st IN ('reprovado','reprovado_sem_itens') THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_REJECTED','severity','BLOCK','message','Pedido reprovado; emissao bloqueada.');
      ELSIF st = 'aguardando_cotacao' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_QUOTE_PENDING','severity','BLOCK','message','Pedido aguardando cotacao; emissao bloqueada.');
      ELSIF st = 'faturado' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_ALREADY_INVOICED','severity','BLOCK','message','Pedido ja faturado.');
      ELSIF NOT (st = ANY (allowed)) THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_STATUS_NOT_BILLABLE','severity','BLOCK',
          'message','Status do pedido nao habilitado para faturamento: '||st);
      END IF;

      -- Aprovacao comercial obrigatoria.
      IF po.approved_at IS NULL OR po.approved_by IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_COMMERCIAL_APPROVAL_MISSING','severity','BLOCK',
          'message','Pedido sem aprovacao comercial registrada.');
      END IF;

      -- Aprovacao financeira quando exigida.
      IF coalesce(po.requires_financial_approval,false)
         AND coalesce(po.financial_approval_status,'pending') <> 'approved' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_FINANCIAL_APPROVAL_MISSING','severity','BLOCK',
          'message','Pedido exige aprovacao financeira e ela nao foi concedida.');
      END IF;

      -- Condicao de pagamento aceita/definida.
      IF coalesce(po.payment_condition_status,'') NOT IN ('defined','accepted','aceita') THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_PAYMENT_CONDITION_NOT_ACCEPTED','severity','BLOCK',
          'message','Condicao de pagamento nao aceita/definida.');
      END IF;

      -- Devedor correto: parceiro B2B, nunca o produtor final vinculado.
      IF po.partner_id IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DEBTOR_UNRESOLVED','severity','BLOCK',
          'message','Parceiro devedor do pedido nao identificado.');
      ELSE
        v_debtor := po.partner_id;
      END IF;

      -- Snapshot de preco/condicao e ausencia de itens sob consulta.
      SELECT count(*),
             count(*) FILTER (WHERE coalesce(pricing_mode_snapshot,'') = 'quote_only'),
             count(*) FILTER (WHERE preco_unitario_final_snapshot IS NULL
                                 OR price_source_snapshot IS NULL)
        INTO n_items, n_quote, n_no_snapshot
        FROM public.partner_order_items WHERE order_id = _source_id;

      IF n_items = 0 THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_NO_ITEMS','severity','BLOCK','message','Pedido sem itens.');
      END IF;
      IF n_quote > 0 THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_QUOTE_ONLY_BLOCKED','severity','BLOCK',
          'message','Pedido possui itens sob consulta (quote_only); emissao bloqueada sem efeito colateral.');
      END IF;
      IF n_no_snapshot > 0 THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_PRICE_SNAPSHOT_MISSING','severity','BLOCK',
          'message','Itens sem snapshot de preco/condicao comercial.');
      END IF;
    END IF;

  ELSIF _source_type = 'ENTREGA' THEN
    SELECT * INTO ent FROM public.entregas WHERE id = _source_id;
    IF NOT FOUND THEN
      reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_NOT_FOUND','severity','BLOCK','message','Entrega inexistente.');
    ELSE
      IF ent.cancelada_em IS NOT NULL OR coalesce(ent.status,'') = 'cancelada'
         OR coalesce(ent.financial_status,'') = 'CANCELED' THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_CANCELED','severity','BLOCK','message','Entrega cancelada.');
      END IF;
      IF NOT (coalesce(ent.status,'') = ANY (public.fn_fiscal_billing_allowed_delivery_status())) THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_NOT_COMPLETED','severity','BLOCK',
          'message','Entrega nao concluida/aceita. Status atual: '||coalesce(ent.status,'-'));
      END IF;
      IF ent.recebimento_confirmado_em IS NULL AND ent.confirmada_em IS NULL AND ent.entregue_em IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_RECEIPT_MISSING','severity','BLOCK',
          'message','Entrega sem aceite/recebimento registrado.');
      END IF;
      IF ent.partner_order_id IS NULL THEN
        reasons := reasons || jsonb_build_object('code','FISCAL_DELIVERY_ORDER_LINK_MISSING','severity','BLOCK',
          'message','Entrega sem vinculo inequivoco a pedido B2B.');
      ELSE
        v_order_id := ent.partner_order_id;
        SELECT partner_id, status::text INTO v_debtor, st FROM public.partner_orders WHERE id = ent.partner_order_id;
        IF v_debtor IS NULL THEN
          reasons := reasons || jsonb_build_object('code','FISCAL_DEBTOR_UNRESOLVED','severity','BLOCK',
            'message','Parceiro devedor da entrega nao identificado.');
        END IF;
        IF st IS NULL OR NOT (st = ANY (public.fn_fiscal_billing_allowed_order_status())) THEN
          reasons := reasons || jsonb_build_object('code','FISCAL_ORDER_STATUS_NOT_BILLABLE','severity','BLOCK',
            'message','Pedido vinculado a entrega nao esta habilitado para faturamento: '||coalesce(st,'-'));
        END IF;
      END IF;
    END IF;

  ELSE
    reasons := reasons || jsonb_build_object('code','FISCAL_SOURCE_TYPE_UNSUPPORTED','severity','BLOCK',
      'message','Escopo fiscal nao suportado nesta fase: '||_source_type);
  END IF;

  -- Duplicidade fiscal: documento vivo para a mesma origem.
  IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi
             WHERE fi.source_type = _source_type AND fi.source_id = _source_id
               AND fi.document_model = 'NFE'
               AND fi.status NOT IN ('CANCELED','REJECTED')
               AND fi.access_key IS NOT NULL) THEN
    reasons := reasons || jsonb_build_object('code','FISCAL_DUPLICATE_DOCUMENT','severity','BLOCK',
      'message','Ja existe documento fiscal vigente para esta origem.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi
    WHERE fi.source_type = _source_type AND fi.source_id = _source_id
      AND fi.document_model = 'NFE' AND fi.status = 'CANCELED') INTO canceled;

  RETURN jsonb_build_object(
    'eligible', jsonb_array_length(reasons) = 0,
    'reasons', reasons,
    'sourceType', _source_type,
    'orderId', v_order_id,
    'debtorPartnerId', v_debtor,
    'has_canceled_history', canceled);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.fn_fiscal_invoice_eligibility(text,uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.fn_fiscal_invoice_eligibility(_source_type text, _source_id uuid, _current_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$ declare v_result jsonb;v_reasons jsonb; begin
  PERFORM public.h15_require_staff();
  IF _current_invoice_id IS NOT NULL THEN PERFORM public.h15_require_invoice(_current_invoice_id); END IF;
 v_result:=public.fn_fiscal_invoice_eligibility(_source_type,_source_id); if _current_invoice_id is not null and exists(select 1 from (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi where fi.id=_current_invoice_id and fi.source_type=_source_type and fi.source_id=_source_id and fi.document_model='NFE' and fi.status not in ('CANCELED','REJECTED') and fi.access_key is not null) and not exists(select 1 from (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi where fi.source_type=_source_type and fi.source_id=_source_id and fi.id<>_current_invoice_id and fi.document_model='NFE' and fi.status not in ('CANCELED','REJECTED') and fi.access_key is not null) then select coalesce(jsonb_agg(reason),'[]'::jsonb) into v_reasons from jsonb_array_elements(coalesce(v_result->'reasons','[]'::jsonb)) reason where reason->>'code'<>'FISCAL_DUPLICATE_DOCUMENT'; v_result:=jsonb_set(v_result,'{reasons}',v_reasons,true); v_result:=jsonb_set(v_result,'{eligible}',to_jsonb(jsonb_array_length(v_reasons)=0),true); end if; return v_result; end $function$
;
REVOKE EXECUTE ON FUNCTION public.fn_fiscal_invoice_eligibility(text,uuid,uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.fn_fiscal_scenario_coverage()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  sc record; total int := 0; covered int := 0;
  gaps jsonb := '[]'::jsonb; ref_date date := current_date;
  ok boolean; k text; kinds text[]; code text; msg text;
  rule public.fiscal_tax_rules%ROWTYPE;
  ctx jsonb; res jsonb;
  v_icms numeric; v_ipi numeric; v_st numeric; v_base_st numeric;
  n_micro_active int; n_micro_ready int; n_micro_draft int;
  n_micro_blocked int; n_micro_inactive int;
  n_ncm int; n_recip int; n_channel int;
BEGIN
  PERFORM public.h15_require_staff();

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('total',0,'covered',0,'gaps',
      jsonb_build_array(jsonb_build_object('code','EMITTER_NOT_CONFIGURED','scope','EMITENTE')));
  END IF;

  -- Inventário de microrganismos: ativos, prontos, rascunhos, bloqueados, inativos.
  SELECT count(*) FILTER (WHERE coalesce(m.ativo,true)),
         count(*) FILTER (WHERE NOT coalesce(m.ativo,true))
    INTO n_micro_active, n_micro_inactive
    FROM public.microrganismos m;

  SELECT
    count(*) FILTER (WHERE coalesce(p.profile_status,'DRAFT') = 'VALIDATED'
                       AND p.accounting_validated_at IS NOT NULL
                       AND coalesce(p.is_active,false)),
    count(*) FILTER (WHERE coalesce(p.profile_status,'DRAFT') = 'BLOCKED')
    INTO n_micro_ready, n_micro_blocked
    FROM public.microorganism_fiscal_profiles p
    JOIN public.microrganismos m ON m.id = p.microorganism_id
   WHERE coalesce(m.ativo,true);

  n_micro_ready   := coalesce(n_micro_ready,0);
  n_micro_blocked := coalesce(n_micro_blocked,0);
  n_micro_draft   := greatest(coalesce(n_micro_active,0) - n_micro_ready - n_micro_blocked, 0);

  -- Cenários reais: destinatário pronto × canal realmente usado × NCM oficial vigente.
  -- Nenhum cenário artificial com NCM NULL; nenhum produto cartesiano irrelevante.
  FOR sc IN
    WITH recipients AS (
      SELECT DISTINCT
             p.customer_id,
             upper(coalesce(p.fiscal_state, emit.state)) AS dest_uf,
             coalesce(p.final_consumer,true) AS final_consumer,
             coalesce(p.taxpayer_indicator,'9') AS ind
        FROM public.customer_fiscal_profiles p
       WHERE p.nfe_readiness_status = 'READY'
    ),
    channels AS (
      SELECT DISTINCT coalesce(fi.sales_channel,'B2B_PARTNER') AS channel
        FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi
       WHERE fi.document_model = 'NFE'
      UNION
      SELECT 'B2B_PARTNER'
    ),
    ncms AS (
      SELECT DISTINCT public.fn_fiscal_digits(mp.ncm) AS ncm
        FROM public.microorganism_fiscal_profiles mp
        JOIN public.microrganismos m ON m.id = mp.microorganism_id
       WHERE coalesce(m.ativo,true)
         AND coalesce(mp.is_active,false)
         AND coalesce(mp.profile_status,'DRAFT') = 'VALIDATED'
         AND mp.accounting_validated_at IS NOT NULL
         AND nullif(btrim(coalesce(mp.ncm,'')),'') IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.microorganism_regulatory_dossiers d
            WHERE d.microorganism_id = m.id
              AND d.deleted_at IS NULL
              AND d.status = 'VALIDATED'
              AND coalesce(d.effective_from, current_date) <= current_date
              AND (d.effective_to IS NULL OR d.effective_to >= current_date)
              AND nullif(btrim(coalesce(d.published_ncm,'')),'') IS NOT NULL)
    )
    SELECT r.dest_uf, r.final_consumer, r.ind, c.channel, n.ncm
      FROM recipients r CROSS JOIN channels c CROSS JOIN ncms n
  LOOP
    total := total + 1;
    ok := true;

    -- Política de operação
    BEGIN
      PERFORM public.fn_fiscal_resolve_operation('OUT', emit.state, sc.dest_uf, emit.crt,
        sc.final_consumer, sc.ind, sc.ncm, null, sc.channel, ref_date);
    EXCEPTION WHEN OTHERS THEN
      msg := coalesce(SQLERRM,'');
      code := CASE WHEN msg LIKE '%AMBIGUOUS%' THEN 'AMBIGUOUS' ELSE 'NOT_FOUND' END;
      ok := false;
      gaps := gaps || jsonb_build_object('scope','OPERACAO','destUf',sc.dest_uf,
        'finalConsumer',sc.final_consumer,'indIEDest',sc.ind,'channel',sc.channel,
        'ncm',sc.ncm,'code',code);
    END;

    kinds := ARRAY['ICMS']::text[];
    IF coalesce(emit.ipi_taxpayer,false) THEN kinds := array_append(kinds,'IPI'); END IF;
    IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'ICMS_ST'); END IF;
    IF coalesce(emit.fcp_applicable,false) THEN
      kinds := array_append(kinds,'FCP');
      IF coalesce(emit.icms_st_responsible,false) THEN kinds := array_append(kinds,'FCP_ST'); END IF;
    END IF;
    IF coalesce(emit.difal_responsible,false) AND sc.dest_uf <> upper(coalesce(emit.state,''))
       AND sc.final_consumer THEN kinds := array_append(kinds,'DIFAL'); END IF;
    kinds := kinds || ARRAY['PIS','COFINS']::text[];

    -- Contexto sintético NEUTRO, encadeado como no motor real. Sem persistência.
    v_icms := 0; v_ipi := 0; v_st := 0; v_base_st := NULL;

    FOREACH k IN ARRAY kinds LOOP
      code := NULL;
      BEGIN
        rule := public.fn_fiscal_resolve_tax_rule(k, emit.crt, emit.state, sc.dest_uf,
          sc.ncm, null, sc.final_consumer, sc.ind, ref_date);
      EXCEPTION WHEN OTHERS THEN
        msg := coalesce(SQLERRM,'');
        code := CASE
          WHEN msg LIKE '%ENGINE_UNAVAILABLE%' THEN 'ENGINE_UNAVAILABLE'
          WHEN msg LIKE '%AMBIGUOUS%'          THEN 'AMBIGUOUS'
          WHEN msg LIKE '%NOT_FOUND%'          THEN 'NOT_FOUND'
          ELSE 'INCOMPLETE' END;
      END;

      IF code IS NULL THEN
        ctx := jsonb_build_object(
          'produto', 1000, 'frete', 0, 'seguro', 0, 'outras', 0, 'desconto', 0,
          'ipi', v_ipi, 'icmsSt', v_st, 'icmsOwnValue', v_icms, 'baseST', v_base_st);
        code := public.fn_fiscal_rule_validate_synthetic(k, rule, ctx);

        IF code = 'OK' THEN
          BEGIN
            res := public.fn_fiscal_apply_tax_v2(rule, ctx);
            IF k = 'ICMS'    THEN v_icms := (res->>'value')::numeric; END IF;
            IF k = 'IPI'     THEN v_ipi  := (res->>'value')::numeric; END IF;
            IF k = 'ICMS_ST' THEN
              v_st := (res->>'value')::numeric;
              v_base_st := (res->'params'->>'baseST')::numeric;
            END IF;
          EXCEPTION WHEN OTHERS THEN
            code := 'INCOMPLETE';
          END;
        END IF;
      END IF;

      IF code <> 'OK' THEN
        ok := false;
        gaps := gaps || jsonb_build_object('scope','TRIBUTO','taxKind',k,'destUf',sc.dest_uf,
          'channel',sc.channel,'ncm',sc.ncm,'code',code);
      END IF;
    END LOOP;

    IF ok THEN covered := covered + 1; END IF;
  END LOOP;

  SELECT count(DISTINCT customer_id) INTO n_recip
    FROM public.customer_fiscal_profiles WHERE nfe_readiness_status = 'READY';

  n_channel := (SELECT count(*) FROM (
                  SELECT DISTINCT coalesce(fi.sales_channel,'B2B_PARTNER') ch
                    FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fi WHERE fi.document_model='NFE'
                  UNION SELECT 'B2B_PARTNER') q);

  n_ncm := CASE WHEN coalesce(n_recip,0) = 0 OR coalesce(n_channel,0) = 0
                THEN 0 ELSE total / greatest(n_recip * n_channel, 1) END;

  RETURN jsonb_build_object(
    'total', total, 'covered', covered,
    'dimensions', jsonb_build_object(
      'readyRecipients', coalesce(n_recip,0),
      'activeChannels', coalesce(n_channel,0),
      'officialNcms', coalesce(n_ncm,0)),
    'microorganisms', jsonb_build_object(
      'active', coalesce(n_micro_active,0),
      'ready', n_micro_ready,
      'draft', n_micro_draft,
      'blocked', n_micro_blocked,
      'inactive', coalesce(n_micro_inactive,0)),
    'gapCodes', jsonb_build_array('NOT_FOUND','AMBIGUOUS','INCOMPLETE','ENGINE_UNAVAILABLE'),
    'gaps', (SELECT coalesce(jsonb_agg(DISTINCT g),'[]'::jsonb) FROM jsonb_array_elements(gaps) g));
END $function$
;
REVOKE EXECUTE ON FUNCTION public.fn_fiscal_scenario_coverage() FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_calculate_invoice_v1(p_invoice_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  it record; pol public.fiscal_operation_policies%ROWTYPE; rule public.fiscal_tax_rules%ROWTYPE;
  item_taxes jsonb; item_snapshot jsonb; ctx jsonb; res jsonb;
  totals jsonb; existing jsonb; debtor jsonb;
  t_icms numeric := 0; t_st numeric := 0; t_fcp numeric := 0; t_difal numeric := 0;
  t_pis numeric := 0; t_cofins numeric := 0; t_ipi numeric := 0; t_fcpst numeric := 0;
  t_difal_dest numeric := 0; t_difal_orig numeric := 0; t_fcp_dest numeric := 0;
  t_prod numeric := 0; t_desc numeric := 0; t_frete numeric := 0; t_seg numeric := 0; t_outros numeric := 0;
  t_nf numeric := 0; t_com numeric := 0; n_items int := 0; ref_date date; kinds text[]; k text;
  has_difal boolean := false;
  v_prod numeric; v_icms_own numeric; v_ipi numeric; v_base_st numeric;
  v_st_val numeric; v_fcp_own numeric; v_fcp_st numeric;
  v_difal_dest numeric; v_difal_orig numeric; v_fcp_dest numeric;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para calcular documento fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;

  -- F3.1-R1: gate de ambiente avaliado ANTES de qualquer leitura/efeito, fail-closed.
  PERFORM public.fn_fiscal_assert_environment_homologation();

  SELECT * INTO inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_calculation_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_calculation_runs
              WHERE idempotency_key = p_idempotency_key
                AND fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.';
  END IF;

  SELECT result INTO existing FROM (SELECT * FROM public.fiscal_calculation_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_calculation_runs
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF existing IS NOT NULL THEN
    RETURN existing || jsonb_build_object('idempotentReplay', true);
  END IF;

  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: somente rascunho pode ser calculado (status=%)', inv.status;
  END IF;
  IF inv.document_model <> 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: fase F3 cobre apenas NF-e modelo 55.';
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF inv.tax_snapshot IS NOT NULL AND inv.tax_snapshot ? 'engineVersion' THEN
    RAISE EXCEPTION 'FISCAL_SNAPSHOT_IMMUTABLE: documento ja possui snapshot tributario; historico nao recalcula.';
  END IF;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %', (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  -- F3.1: devedor B2B x destinatario do documento (fail-closed, antes de qualquer efeito).
  debtor := public.fn_fiscal_assert_debtor_recipient(p_invoice_id);

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;

  -- F3.1: gate de ambiente/homologacao reavaliado tambem no CALCULO.
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao (tpAmb=1) bloqueado na fase F3; teto READY_HOMOLOGATION.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  IF inv.customer_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_RECIPIENT_MISSING: destinatario/devedor nao resolvido para o documento.';
  END IF;
  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;
  IF dest.nfe_readiness_status <> 'READY' THEN
    RAISE EXCEPTION 'FISCAL_RECIPIENT_NOT_READY: destinatario com pendencias %', dest.nfe_readiness_pendencies;
  END IF;

  ref_date := coalesce(inv.issue_date, current_date);

  FOR it IN
    SELECT * FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id ORDER BY item_sequence
  LOOP
    n_items := n_items + 1;
    IF coalesce(it.quantity,0) <= 0 OR coalesce(it.unit_value,0) < 0 THEN
      RAISE EXCEPTION 'FISCAL_ITEM_INVALID: item % com quantidade ou valor unitario invalido.', it.item_sequence;
    END IF;
    IF nullif(btrim(coalesce(it.ncm_snapshot,'')),'') IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ITEM_NCM_MISSING: item % sem NCM no snapshot do pedido.', it.item_sequence;
    END IF;

    v_prod := public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value));

    res := public.fn_fiscal_compute_item_taxes_v1(
      emit, dest, coalesce(inv.direction,'OUT'), inv.sales_channel, ref_date, it.ncm_snapshot,
      v_prod, coalesce(it.discount_value,0), coalesce(it.freight_value,0),
      coalesce(it.insurance_value,0), coalesce(it.other_value,0),
      coalesce(it.tax_input_snapshot,'{}'::jsonb), auth.uid());

    item_taxes := res->'taxes';
    kinds := ARRAY(SELECT jsonb_array_elements_text(res->'taxOrder'));
    SELECT * INTO pol FROM public.fiscal_operation_policies WHERE id = (res->'policy'->>'id')::uuid;
    v_icms_own   := coalesce((res->'chained'->>'icmsOwnValue')::numeric,0);
    v_ipi        := coalesce((res->'chained'->>'ipi')::numeric,0);
    v_st_val     := coalesce((res->'chained'->>'icmsSt')::numeric,0);
    v_base_st    := nullif(res->'chained'->>'baseST','')::numeric;
    v_fcp_own    := coalesce((res->'itemTotals'->>'vFCP')::numeric,0);
    v_fcp_st     := coalesce((res->'itemTotals'->>'vFCPST')::numeric,0);
    v_difal_dest := coalesce((res->'itemTotals'->>'vICMSUFDest')::numeric,0);
    v_difal_orig := coalesce((res->'itemTotals'->>'vICMSUFRemet')::numeric,0);
    v_fcp_dest   := coalesce((res->'itemTotals'->>'vFCPUFDest')::numeric,0);
    has_difal    := has_difal OR coalesce((res->>'hasDifal')::boolean,false);

    t_prod   := t_prod + v_prod;
    t_desc   := t_desc + public.fn_fiscal_round(coalesce(it.discount_value,0));
    t_frete  := t_frete + public.fn_fiscal_round(coalesce(it.freight_value,0));
    t_seg    := t_seg + public.fn_fiscal_round(coalesce(it.insurance_value,0));
    t_outros := t_outros + public.fn_fiscal_round(coalesce(it.other_value,0));
    t_icms   := t_icms   + coalesce((item_taxes->'ICMS'->>'value')::numeric,0);
    t_st     := t_st     + v_st_val;
    -- vFCP = FCP proprio da operacao. vFCPST = FCP retido por ST.
    -- vFCPUFDest = FCP devido a UF de destino no DIFAL. Sem sobreposicao.
    t_fcp    := t_fcp    + v_fcp_own;
    t_fcpst  := t_fcpst  + v_fcp_st;
    t_difal  := t_difal  + coalesce((item_taxes->'DIFAL'->>'value')::numeric,0);
    t_difal_dest := t_difal_dest + v_difal_dest;
    t_difal_orig := t_difal_orig + v_difal_orig;
    t_fcp_dest   := t_fcp_dest + v_fcp_dest;
    t_pis    := t_pis    + coalesce((item_taxes->'PIS'->>'value')::numeric,0);
    t_cofins := t_cofins + coalesce((item_taxes->'COFINS'->>'value')::numeric,0);
    t_ipi    := t_ipi    + coalesce((item_taxes->'IPI'->>'value')::numeric,0);

    item_snapshot := jsonb_build_object(
      'engineVersion','F3.4',
      'calculatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
      'ncm', it.ncm_snapshot,
      'cfop', pol.cfop,
      'natureOperation', pol.nature_operation,
      'operationPolicyId', pol.id,
      'operationPolicyVersion', pol.legal_version,
      'operationLegalBasis', pol.legal_basis,
      'operationSourceId', pol.source_id,
      'crt', emit.crt,
      'roundingMode','HALF_UP_2',
      'components', jsonb_build_object(
        'produto', v_prod,
        'desconto', public.fn_fiscal_round(coalesce(it.discount_value,0)),
        'frete', public.fn_fiscal_round(coalesce(it.freight_value,0)),
        'seguro', public.fn_fiscal_round(coalesce(it.insurance_value,0)),
        'outras', public.fn_fiscal_round(coalesce(it.other_value,0))),
      'taxOrder', to_jsonb(kinds),
      'taxInputs', coalesce(it.tax_input_snapshot, '{}'::jsonb),
      'chainedContext', jsonb_build_object(
        'icmsOwnValue', v_icms_own, 'ipi', v_ipi,
        'icmsSt', v_st_val, 'baseST', v_base_st),
      'itemTotals', jsonb_build_object(
        'vFCP', v_fcp_own, 'vFCPST', v_fcp_st,
        'vICMSUFDest', v_difal_dest, 'vICMSUFRemet', v_difal_orig,
        'vFCPUFDest', v_fcp_dest),
      'taxes', item_taxes);

    UPDATE public.fiscal_invoice_items
       SET tax_snapshot = item_snapshot,
           cfop_snapshot = pol.cfop,
           cst_icms_snapshot = item_taxes->'ICMS'->>'cst',
           csosn_snapshot = item_taxes->'ICMS'->>'csosn',
           net_value = coalesce((item_taxes->'ICMS'->>'baseOriginal')::numeric, v_prod),
           updated_at = now()
     WHERE id = it.id;
  END LOOP;

  IF n_items = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  -- H12: o total comercial do rascunho NAO contem tributos somados ao documento
  -- (ST/FCP-ST/IPI). O guard permanece, mas compara grandezas equivalentes.
  t_com := public.fn_fiscal_round(t_prod - t_desc + t_frete + t_seg + t_outros);
  t_nf  := public.fn_fiscal_round(t_com + t_st + t_fcpst + t_ipi);

  IF inv.total_amount IS NOT NULL
     AND abs(inv.total_amount - t_com) > 0.01
     AND abs(inv.total_amount - t_nf)  > 0.01 THEN
    RAISE EXCEPTION 'FISCAL_TOTAL_MISMATCH: total informado % difere do total comercial % e do total fiscal %',
      inv.total_amount, t_com, t_nf;
  END IF;

  totals := jsonb_build_object(
    'engineVersion','F3.4', 'roundingMode','HALF_UP_2',
    'itemCount', n_items,
    'vProd', public.fn_fiscal_round(t_prod), 'vDesc', public.fn_fiscal_round(t_desc),
    'vFrete', public.fn_fiscal_round(t_frete), 'vSeg', public.fn_fiscal_round(t_seg),
    'vOutro', public.fn_fiscal_round(t_outros),
    'vICMS', public.fn_fiscal_round(t_icms), 'vST', public.fn_fiscal_round(t_st),
    'vFCP', public.fn_fiscal_round(t_fcp), 'vFCPST', public.fn_fiscal_round(t_fcpst),
    'vDIFAL', public.fn_fiscal_round(t_difal),
    'vPIS', public.fn_fiscal_round(t_pis), 'vCOFINS', public.fn_fiscal_round(t_cofins),
    'vIPI', public.fn_fiscal_round(t_ipi), 'vNF', t_nf, 'vCommercial', t_com,
    'debtor', debtor);

  IF has_difal THEN
    totals := totals || jsonb_build_object(
      'vICMSUFDest', public.fn_fiscal_round(t_difal_dest),
      'vICMSUFRemet', public.fn_fiscal_round(t_difal_orig),
      'vFCPUFDest', public.fn_fiscal_round(t_fcp_dest));
  END IF;

  UPDATE public.fiscal_invoices
     SET tax_snapshot = totals,
         fiscal_totals_snapshot = totals,
         total_amount = t_nf,
         debtor_partner_id = coalesce(inv.debtor_partner_id, nullif(debtor->>'debtorPartnerId','')::uuid),
         debtor_customer_id = coalesce(inv.debtor_customer_id, nullif(debtor->>'recipientCustomerId','')::uuid),
         company_snapshot = jsonb_build_object(
           'cnpj', emit.cnpj, 'legalName', emit.legal_name, 'crt', emit.crt,
           'ie', emit.state_registration, 'uf', emit.state,
           'municipalityIbge', emit.municipality_ibge_code,
           'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code),
         customer_snapshot = jsonb_build_object(
           'document', dest.cpf_cnpj, 'legalName', dest.legal_name,
           'indIEDest', dest.taxpayer_indicator, 'uf', dest.fiscal_state,
           'municipalityIbge', dest.fiscal_municipality_ibge_code,
           'finalConsumer', dest.final_consumer, 'icmsTaxpayer', dest.icms_taxpayer,
           'debtorPartnerId', debtor->>'debtorPartnerId'),
         updated_at = now()
   WHERE id = p_invoice_id;

  INSERT INTO public.fiscal_calculation_runs (fiscal_invoice_id, idempotency_key, engine_version, result, created_by)
  VALUES (p_invoice_id, p_idempotency_key, 'F3.4', totals, auth.uid());

  RETURN totals || jsonb_build_object('idempotentReplay', false);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_calculate_invoice_v1(uuid,text) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_calculate_service_invoice_v1(p_invoice_id uuid, p_idempotency_key text, p_persist boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  prof public.service_fiscal_profiles%ROWTYPE;
  it record; ref_date date; n_items int := 0;
  v_base numeric; v_iss numeric; v_rate numeric;
  t_gross numeric := 0; t_disc numeric := 0; t_base numeric := 0; t_iss numeric := 0;
  t_iss_withheld numeric := 0; t_fed_withheld numeric := 0;
  wk text; w jsonb; w_rate numeric; w_val numeric; w_out jsonb;
  fed jsonb; items_out jsonb := '[]'::jsonb; item_taxes jsonb; totals jsonb;
  existing jsonb;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para calcular documento fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;
  PERFORM public.fn_fiscal_assert_environment_homologation();

  SELECT * INTO inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF coalesce(inv.document_model,'') <> 'NFSE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: esta rotina calcula apenas NFS-e (servicos).';
  END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: calculo disponivel apenas em rascunho (status=%).', inv.status;
  END IF;

  IF p_persist THEN
    SELECT result INTO existing FROM (SELECT * FROM public.fiscal_calculation_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_calculation_runs
      WHERE idempotency_key = p_idempotency_key AND fiscal_invoice_id = p_invoice_id
      ORDER BY created_at DESC LIMIT 1;
    IF existing IS NOT NULL THEN
      RETURN existing || jsonb_build_object('idempotentReplay', true);
    END IF;
    IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_calculation_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_calculation_runs
                WHERE idempotency_key = p_idempotency_key AND fiscal_invoice_id <> p_invoice_id) THEN
      RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave ja utilizada por outro documento fiscal.';
    END IF;
  END IF;

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao bloqueado.';
  END IF;

  ref_date := coalesce(inv.issue_date, current_date);

  FOR it IN SELECT * FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items
             WHERE fiscal_invoice_id = p_invoice_id ORDER BY item_sequence
  LOOP
    n_items := n_items + 1;
    IF coalesce(it.quantity,0) <= 0 OR coalesce(it.unit_value,0) < 0 THEN
      RAISE EXCEPTION 'FISCAL_ITEM_INVALID: item % com quantidade ou valor unitario invalido.', it.item_sequence;
    END IF;

    SELECT * INTO prof FROM public.service_fiscal_profiles
     WHERE (service_id = it.source_item_id OR source_reference = it.source_item_id::text)
       AND is_active ORDER BY updated_at DESC LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_PROFILE_MISSING: item % sem perfil fiscal de servico.', it.item_sequence;
    END IF;
    IF prof.profile_status <> 'VALIDATED' THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_PROFILE_NOT_VALIDATED: item % com perfil em status %.', it.item_sequence, prof.profile_status;
    END IF;
    IF nullif(btrim(coalesce(prof.lc116_item,'')),'') IS NULL THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_LC116_MISSING: item % sem enquadramento LC 116.', it.item_sequence;
    END IF;
    IF prof.iss_rate IS NULL OR prof.iss_rate < 0 OR prof.iss_rate > 100 THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_ISS_RATE_INVALID: item % sem aliquota de ISS valida.', it.item_sequence;
    END IF;
    IF NOT public.fn_fiscal_service_withholding_valid_v1(prof.federal_withholding_defaults) THEN
      RAISE EXCEPTION 'FISCAL_SERVICE_WITHHOLDING_INVALID: retencoes federais do item % fora do contrato.', it.item_sequence;
    END IF;

    -- IBS/CBS so podem entrar quando a politica E o leiaute estiverem comprovados.
    IF coalesce(prof.ibs_cbs_configuration,'{}'::jsonb) <> '{}'::jsonb
       AND coalesce((prof.ibs_cbs_configuration->>'enabled')::boolean,false) THEN
      IF NOT (public.fn_fiscal_rtc_layout_supported_v1('NFSE','IBS',ref_date)
              AND public.fn_fiscal_rtc_layout_supported_v1('NFSE','CBS',ref_date)) THEN
        RAISE EXCEPTION 'FISCAL_RTC_LAYOUT_UNVALIDATED: leiaute IBS/CBS nao validado para NFS-e nesta vigencia.';
      END IF;
    END IF;

    v_base := public.fn_fiscal_round(
      coalesce(it.gross_value, it.quantity * it.unit_value) - coalesce(it.discount_value,0));
    IF v_base < 0 THEN
      RAISE EXCEPTION 'FISCAL_TAX_BASE_NEGATIVE: base negativa no item %.', it.item_sequence;
    END IF;
    v_rate := prof.iss_rate;
    v_iss  := public.fn_fiscal_round(v_base * v_rate / 100);

    fed := coalesce(prof.federal_withholding_defaults,'{}'::jsonb);
    w_out := '{}'::jsonb;
    FOREACH wk IN ARRAY ARRAY['pis','cofins','csll','irrf','inss'] LOOP
      w := fed->wk;
      IF w IS NOT NULL THEN
        w_rate := (w->>'rate')::numeric;
        w_val  := public.fn_fiscal_round(v_base * w_rate / 100);
        w_out  := w_out || jsonb_build_object(upper(wk), jsonb_build_object(
          'base', v_base, 'rate', w_rate, 'value', w_val,
          'withheld', coalesce((w->>'withheld')::boolean,false)));
        IF coalesce((w->>'withheld')::boolean,false) THEN
          t_fed_withheld := t_fed_withheld + w_val;
        END IF;
      END IF;
    END LOOP;

    item_taxes := jsonb_build_object(
      'ISS', jsonb_build_object(
        'taxKind','ISS','formula','SVC1/ISS','base', v_base, 'rate', v_rate,
        'value', v_iss, 'withheld', coalesce(prof.iss_withheld_default,false),
        'lc116Item', prof.lc116_item,
        'municipalTaxationCode', prof.municipal_taxation_code,
        'nationalTaxationCode', prof.national_taxation_code,
        'incidenceMunicipalityIbge', prof.incidence_municipality_ibge_code),
      'FEDERAL_WITHHOLDING', w_out);

    t_gross := t_gross + public.fn_fiscal_round(coalesce(it.gross_value, it.quantity * it.unit_value));
    t_disc  := t_disc  + public.fn_fiscal_round(coalesce(it.discount_value,0));
    t_base  := t_base  + v_base;
    t_iss   := t_iss   + v_iss;
    IF coalesce(prof.iss_withheld_default,false) THEN
      t_iss_withheld := t_iss_withheld + v_iss;
    END IF;

    items_out := items_out || jsonb_build_array(jsonb_build_object(
      'itemSequence', it.item_sequence, 'base', v_base, 'taxes', item_taxes));

    IF p_persist THEN
      UPDATE public.fiscal_invoice_items
         SET tax_snapshot = item_taxes,
             net_value = v_base,
             updated_at = now()
       WHERE id = it.id;
    END IF;
  END LOOP;

  IF n_items = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  totals := jsonb_build_object(
    'engineVersion','SVC1.0', 'documentModel','NFSE', 'roundingMode','HALF_UP_2',
    'itemCount', n_items,
    'vServ', public.fn_fiscal_round(t_gross),
    'vDesc', public.fn_fiscal_round(t_disc),
    'vBC',   public.fn_fiscal_round(t_base),
    'vISS',  public.fn_fiscal_round(t_iss),
    'vISSRetido', public.fn_fiscal_round(t_iss_withheld),
    'vRetFederais', public.fn_fiscal_round(t_fed_withheld),
    -- Liquido = servicos menos descontos e SOMENTE tributos efetivamente retidos.
    'vLiq', public.fn_fiscal_round(t_base - t_iss_withheld - t_fed_withheld),
    'ibsCbsApplied', false,
    'ibsCbsGate','FISCAL_RTC_LAYOUT_UNVALIDATED',
    'nationalTransmissionSupported', false,
    'items', items_out);

  IF p_persist THEN
    UPDATE public.fiscal_invoices
       SET tax_snapshot = totals - 'items',
           fiscal_totals_snapshot = totals - 'items',
           updated_at = now()
     WHERE id = p_invoice_id;

    INSERT INTO public.fiscal_calculation_runs
      (fiscal_invoice_id, idempotency_key, engine_version, result, created_by)
    VALUES (p_invoice_id, p_idempotency_key, 'SVC1.0', totals, auth.uid());

    INSERT INTO public.fiscal_audit_log (table_name, record_id, action, old_values, new_values, changed_by)
    VALUES ('fiscal_invoices', p_invoice_id, 'UPDATE',
            jsonb_build_object('taxSnapshot', inv.tax_snapshot),
            jsonb_build_object('engine','SVC1.0','vISS', t_iss, 'vLiq',
              public.fn_fiscal_round(t_base - t_iss_withheld - t_fed_withheld)),
            auth.uid());
  END IF;

  RETURN totals || jsonb_build_object('idempotentReplay', false, 'persisted', p_persist);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_calculate_service_invoice_v1(uuid,text,boolean) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_certificate_register_a1(uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text[],text,text,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_register_a1(uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text[],text,text,integer,text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_certificate_register_os(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_certificate_register_os(uuid,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_certificate_revoke(p_certificate_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_company((SELECT company_settings_id FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) fiscal_certificates WHERE id=p_certificate_id));

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_role(v_user, 'administrador'::app_role) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) fiscal_certificates WHERE id = p_certificate_id) THEN
    RAISE EXCEPTION 'certificate_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.fiscal_certificates
  SET is_active = false,
      status = CASE WHEN status <> 'REVOKED' THEN 'REVOKED' ELSE status END,
      revoked_at = COALESCE(revoked_at, now()),
      revoked_by = COALESCE(revoked_by, v_user),
      revoke_reason = COALESCE(NULLIF(LEFT(COALESCE(p_reason, ''), 500), ''), revoke_reason),
      updated_at = now()
  WHERE id = p_certificate_id;

  UPDATE public.company_fiscal_settings
  SET certificate_ref = NULL,
      updated_at = now()
  WHERE certificate_ref = p_certificate_id::text;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_certificate_revoke(uuid,text) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_rtc_get()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_row public.company_fiscal_settings%ROWTYPE;
BEGIN
  PERFORM public.h15_require_staff();

  IF NOT public._fiscal_rtc_can_read(v_uid) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings
   ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  RETURN jsonb_build_object(
    'configuration', COALESCE(v_row.rtc_configuration,'{}'::jsonb),
    'revision', COALESCE(v_row.updated_at::text,''),
    'exists', v_row.id IS NOT NULL);
END; $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_company_rtc_get() FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_rtc_save(payload jsonb, expected_revision text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_id uuid; v_current text; v_new text;
BEGIN
  PERFORM public.h15_require_staff();

  IF v_uid IS NULL THEN RAISE EXCEPTION 'FISCAL_UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_role(v_uid,'administrador'::app_role) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  PERFORM public._fiscal_rtc_assert_payload(payload,'company');
  SELECT id, updated_at::text INTO v_id, v_current
    FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings
   ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'FISCAL_COMPANY_NOT_INITIALIZED' USING ERRCODE='P0002'; END IF;
  IF expected_revision IS NOT NULL AND expected_revision <> v_current THEN
    RAISE EXCEPTION 'FISCAL_CONFLICT' USING ERRCODE='40001'; END IF;
  UPDATE public.company_fiscal_settings
     SET rtc_configuration = payload, updated_at = now()
   WHERE id = v_id
   RETURNING updated_at::text INTO v_new;
  RETURN jsonb_build_object('configuration', payload, 'revision', v_new);
END; $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_company_rtc_save(jsonb,text) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_company_settings_init()
 RETURNS company_fiscal_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing public.company_fiscal_settings;
  v_actor    uuid;
BEGIN
  PERFORM public.h15_require_staff();

  BEGIN
    v_actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor := NULL;
  END;
  IF v_actor IS NULL OR NOT public.has_role(v_actor, 'administrador') THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  -- Advisory lock transacional: elimina corrida de singleton entre
  -- chamadas concorrentes desta RPC.
  PERFORM pg_advisory_xact_lock(hashtext('fiscal_company_settings_singleton'));

  SELECT * INTO v_existing
    FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings
    WHERE is_active = true
    LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.company_fiscal_settings (
    organization_id, is_active, fiscal_environment, configuration_status,
    fiscal_provider, nfe_provider, nfse_provider,
    nfe_enabled, nfse_enabled, production_enabled,
    last_validation_status, configuration_version,
    created_by, updated_by
  ) VALUES (
    public.h15_actor_organization(), true, 'NOT_CONFIGURED', 'DRAFT',
    'NONE', 'NONE', 'NONE',
    false, false, false,
    'NOT_VALIDATED', 1,
    v_actor, v_actor
  ) RETURNING * INTO v_existing;

  RETURN v_existing;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_company_settings_init() FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_draft_save(p_invoice_id uuid, p_invoice jsonb, p_items jsonb, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_user           uuid := auth.uid();
  v_row            public.fiscal_invoices;
  v_new_id         uuid;
  v_total          numeric(14,2) := 0;
  v_item           jsonb;
  v_seq            integer := 0;
  v_env            text;
  v_invoice_type   text;
  v_customer_id    uuid;
  v_qty            numeric;
  v_unit           numeric;
  v_gross          numeric;
  v_disc           numeric;
  v_net            numeric;
  v_kind           text;
  v_items_count    integer;
  v_emit_uf        text;
  v_dest_uf        text;
  v_freight_total  numeric := 0;
  v_insurance_total numeric := 0;
  v_other_total    numeric := 0;
  v_gross_arr      numeric[];
  v_fr_arr         numeric[];
  v_in_arr         numeric[];
  v_ot_arr         numeric[];
  v_computed_items jsonb := '[]'::jsonb;
  v_profile_snap   jsonb;
  v_tax_snap       jsonb;
  FORBIDDEN_KEYS   text[] := ARRAY[
    'sefaz_key','access_key','protocol_number','authorization_number',
    'authorized_at','authorization_xml','xml','pdf','signed_xml',
    'cancel_protocol','provider_response'
  ];
  k text;
BEGIN
  PERFORM public.h15_require_staff();
  IF p_invoice_id IS NOT NULL THEN PERFORM public.h15_require_invoice(p_invoice_id); END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
    RAISE EXCEPTION 'invoice_object_required' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items_array_required' USING ERRCODE = '22023';
  END IF;

  IF public.fiscal_json_has_sensitive_key(p_invoice)
     OR public.fiscal_json_has_sensitive_key(p_items) THEN
    RAISE EXCEPTION 'sensitive_key_in_payload' USING ERRCODE = '22023';
  END IF;

  FOREACH k IN ARRAY FORBIDDEN_KEYS LOOP
    IF p_invoice ? k THEN
      RAISE EXCEPTION 'emission_field_forbidden' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_items_count := jsonb_array_length(p_items);
  IF v_items_count < 1 OR v_items_count > 500 THEN
    RAISE EXCEPTION 'items_count_out_of_range' USING ERRCODE = '22023';
  END IF;

  v_invoice_type := COALESCE(p_invoice->>'invoice_type','');
  IF v_invoice_type NOT IN ('NFE','NFSE') THEN
    RAISE EXCEPTION 'invoice_type_invalid' USING ERRCODE = '22023';
  END IF;

  v_env := COALESCE(p_invoice->>'environment','NOT_CONFIGURED');
  IF v_env NOT IN ('HOMOLOGATION','NOT_CONFIGURED') THEN
    RAISE EXCEPTION 'environment_not_allowed' USING ERRCODE = '22023';
  END IF;

  v_customer_id := NULLIF(p_invoice->>'customer_id','')::uuid;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_customer_id) THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- FASE C2/C3: UFs e encargos resolvidos no servidor (o cliente nao e autoridade).
  SELECT upper(coalesce(state,'')) INTO v_emit_uf
    FROM (SELECT * FROM public.company_fiscal_settings WHERE id = COALESCE((SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id),public.h15_active_company())) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT upper(coalesce(fiscal_state,'')) INTO v_dest_uf
    FROM public.customer_fiscal_profiles WHERE customer_id = v_customer_id;
  v_dest_uf := coalesce(nullif(v_dest_uf,''), v_emit_uf);

  v_freight_total   := round(coalesce(nullif(p_invoice->>'freight_value','')::numeric, 0), 2);
  v_insurance_total := round(coalesce(nullif(p_invoice->>'insurance_value','')::numeric, 0), 2);
  v_other_total     := round(coalesce(nullif(p_invoice->>'other_value','')::numeric, 0), 2);
  IF v_freight_total < 0 OR v_insurance_total < 0 OR v_other_total < 0 THEN
    RAISE EXCEPTION 'invoice_charges_negative' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_seq  := v_seq + 1;
    v_kind := COALESCE(v_item->>'item_kind','');
    IF v_invoice_type = 'NFE'  AND v_kind <> 'PRODUCT' THEN
      RAISE EXCEPTION 'nfe_requires_product_items' USING ERRCODE = '22023';
    END IF;
    IF v_invoice_type = 'NFSE' AND v_kind <> 'SERVICE' THEN
      RAISE EXCEPTION 'nfse_requires_service_items' USING ERRCODE = '22023';
    END IF;

    v_qty  := COALESCE(NULLIF(v_item->>'quantity','')::numeric, 0);
    v_unit := COALESCE(NULLIF(v_item->>'unit_value','')::numeric, 0);
    v_disc := COALESCE(NULLIF(v_item->>'discount_value','')::numeric, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'item_quantity_must_be_positive' USING ERRCODE = '22023';
    END IF;
    IF v_unit < 0 THEN
      RAISE EXCEPTION 'item_unit_value_negative' USING ERRCODE = '22023';
    END IF;
    IF v_disc < 0 THEN
      RAISE EXCEPTION 'item_discount_negative' USING ERRCODE = '22023';
    END IF;

    v_gross := round(v_qty * v_unit, 2);
    IF v_disc > v_gross THEN
      RAISE EXCEPTION 'item_discount_gt_gross' USING ERRCODE = '22023';
    END IF;
    v_net  := round(v_gross - v_disc, 2);

    -- 3.16.2-C: whitelist FAIL-CLOSED por item + verificação de source_item_id
    DECLARE
      v_item_profile jsonb := COALESCE(v_item->'fiscal_profile_snapshot', '{}'::jsonb);
      v_item_tax     jsonb := COALESCE(v_item->'tax_snapshot', '{}'::jsonb);
      v_item_input   jsonb := COALESCE(v_item->'tax_input_snapshot', '{}'::jsonb);
      v_source_id    uuid  := NULLIF(v_item->>'source_item_id','')::uuid;
      v_icms_obj     jsonb;
      v_pis_obj      jsonb;
      v_cofins_obj   jsonb;
      v_ipi_obj      jsonb;
      v_rate         numeric;
      v_pfp          public.product_fiscal_profiles%ROWTYPE;
      v_ncm_s        text;
      v_cest_s       text;
      v_orig_s       text;
      v_cfop_s       text;
      v_cst_s        text;
      v_csosn_s      text;
      v_withheld     jsonb;
      v_rets         jsonb;
    BEGIN
      IF jsonb_typeof(v_item_profile) <> 'object' THEN v_item_profile := '{}'::jsonb; END IF;
      IF jsonb_typeof(v_item_tax)     <> 'object' THEN v_item_tax     := '{}'::jsonb; END IF;
      IF jsonb_typeof(v_item_input)   <> 'object' THEN v_item_input   := '{}'::jsonb; END IF;
      IF NOT public.fn_fiscal_tax_input_valid(v_item_input) THEN
        RAISE EXCEPTION 'tax_input_snapshot_invalid:%', v_seq USING ERRCODE = '22023';
      END IF;
      IF public.fiscal_json_has_sensitive_key(v_item_profile)
         OR public.fiscal_json_has_sensitive_key(v_item_tax) THEN
        RAISE EXCEPTION 'sensitive_key_in_snapshot' USING ERRCODE = '22023';
      END IF;

      IF v_invoice_type = 'NFE' THEN
        -- Whitelist do perfil NF-e
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_profile,
          ARRAY['ncm','cest','cfop','origem_mercadoria','cst_icms','csosn','unidade'],
          'nfe_profile'
        );
        -- Whitelist da tributação NF-e (somente configuração preparatória)
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_tax, ARRAY['pis','cofins','ipi','icms'], 'nfe_tax'
        );
        v_icms_obj   := v_item_tax->'icms';
        v_pis_obj    := v_item_tax->'pis';
        v_cofins_obj := v_item_tax->'cofins';
        v_ipi_obj    := v_item_tax->'ipi';
        IF v_icms_obj IS NOT NULL THEN
          IF jsonb_typeof(v_icms_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_icms_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(
            v_icms_obj, ARRAY['cst','csosn','aliquota','base_calculo_modalidade'], 'nfe_tax.icms'
          );
        END IF;
        IF v_pis_obj IS NOT NULL THEN
          IF jsonb_typeof(v_pis_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_pis_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_pis_obj, ARRAY['cst','aliquota'], 'nfe_tax.pis');
        END IF;
        IF v_cofins_obj IS NOT NULL THEN
          IF jsonb_typeof(v_cofins_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_cofins_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_cofins_obj, ARRAY['cst','aliquota'], 'nfe_tax.cofins');
        END IF;
        IF v_ipi_obj IS NOT NULL THEN
          IF jsonb_typeof(v_ipi_obj) <> 'object' THEN RAISE EXCEPTION 'nfe_tax_ipi_not_object' USING ERRCODE = '22023'; END IF;
          PERFORM public.fiscal_validate_snapshot_keys(v_ipi_obj, ARRAY['cst','aliquota'], 'nfe_tax.ipi');
        END IF;

        -- Verificação de existência do source_item_id (produto + perfil)
        IF v_source_id IS NOT NULL THEN
          IF NOT EXISTS (SELECT 1 FROM public.produtos pr WHERE pr.id = v_source_id) THEN
            RAISE EXCEPTION 'source_item_product_not_found:%', v_seq USING ERRCODE = 'P0002';
          END IF;
          SELECT * INTO v_pfp FROM public.product_fiscal_profiles pfp
            WHERE pfp.product_id = v_source_id AND pfp.is_active = true LIMIT 1;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'source_item_product_profile_missing:%', v_seq USING ERRCODE = 'P0002';
          END IF;
        END IF;

        -- FASE C2: materializacao server-side dos snapshots fisicos do item.
        v_ncm_s   := nullif(btrim(coalesce(v_pfp.ncm,        v_item_profile->>'ncm',              '')), '');
        v_cest_s  := nullif(btrim(coalesce(v_pfp.cest,       v_item_profile->>'cest',             '')), '');
        v_orig_s  := nullif(btrim(coalesce(v_pfp.origin_code,v_item_profile->>'origem_mercadoria','')), '');
        v_cfop_s  := nullif(btrim(coalesce(
                        CASE WHEN v_dest_uf = v_emit_uf THEN v_pfp.cfop_in_state ELSE v_pfp.cfop_interstate END,
                        v_item_profile->>'cfop', '')), '');
        v_cst_s   := nullif(btrim(coalesce(v_pfp.icms_cst,   v_item_profile->>'cst_icms', '')), '');
        v_csosn_s := nullif(btrim(coalesce(v_pfp.icms_csosn, v_item_profile->>'csosn',    '')), '');
        IF v_ncm_s IS NULL THEN
          RAISE EXCEPTION 'item_ncm_unresolved:%', v_seq USING ERRCODE = '22023';
        END IF;
      ELSE
        -- NFS-e
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_profile,
          ARRAY['lc116_item','cnae','municipal_tax_code','national_tax_code','municipality_ibge_code'],
          'nfse_profile'
        );
        PERFORM public.fiscal_validate_snapshot_keys(
          v_item_tax, ARRAY['iss_rate','iss_withheld','retencoes_suportadas'], 'nfse_tax'
        );
        IF v_item_tax ? 'iss_rate' THEN
          IF jsonb_typeof(v_item_tax->'iss_rate') <> 'number' THEN
            RAISE EXCEPTION 'nfse_iss_rate_not_number' USING ERRCODE = '22023';
          END IF;
          v_rate := (v_item_tax->>'iss_rate')::numeric;
          IF v_rate < 0 OR v_rate > 100 THEN
            RAISE EXCEPTION 'nfse_iss_rate_out_of_range' USING ERRCODE = '22023';
          END IF;
        END IF;
        v_withheld := v_item_tax->'iss_withheld';
        IF v_withheld IS NOT NULL AND jsonb_typeof(v_withheld) <> 'boolean' THEN
          RAISE EXCEPTION 'nfse_iss_withheld_not_boolean' USING ERRCODE = '22023';
        END IF;
        v_rets := v_item_tax->'retencoes_suportadas';
        IF v_rets IS NOT NULL THEN
          IF jsonb_typeof(v_rets) <> 'object' THEN
            RAISE EXCEPTION 'nfse_retencoes_not_object' USING ERRCODE = '22023';
          END IF;
          PERFORM public.fiscal_validate_snapshot_keys(
            v_rets, ARRAY['pis','cofins','csll','irrf','inss'], 'nfse_tax.retencoes_suportadas'
          );
        END IF;

        IF v_source_id IS NOT NULL THEN
          IF NOT EXISTS (
            SELECT 1 FROM public.service_fiscal_profiles sfp
            WHERE sfp.service_id = v_source_id AND sfp.is_active = true
          ) THEN
            RAISE EXCEPTION 'source_item_service_profile_missing:%', v_seq USING ERRCODE = 'P0002';
          END IF;
        END IF;
      END IF;

      v_computed_items := v_computed_items || jsonb_build_object(
        'seq', v_seq,
        'item_kind', v_kind,
        'description', COALESCE(v_item->>'description',''),
        'quantity', v_qty,
        'commercial_unit', v_item->>'commercial_unit',
        'unit_value', v_unit,
        'gross_value', v_gross,
        'discount_value', v_disc,
        'net_value', v_net,
        'source_item_type', v_item->>'source_item_type',
        'source_item_id',   NULLIF(v_item->>'source_item_id','')::uuid,
        'fiscal_profile_snapshot', v_item_profile,
        'tax_snapshot',            v_item_tax,
        'tax_input_snapshot',      v_item_input,
        'ncm_snapshot',       v_ncm_s,
        'cest_snapshot',      v_cest_s,
        'origem_snapshot',    v_orig_s,
        'cfop_snapshot',      v_cfop_s,
        'cst_icms_snapshot',  v_cst_s,
        'csosn_snapshot',     v_csosn_s
      );
    END;
    v_total := v_total + v_net;
  END LOOP;

  -- FASE C3: rateio canonico server-side, proporcional ao valor bruto, sem perder centavos.
  SELECT array_agg((it->>'gross_value')::numeric ORDER BY (it->>'seq')::integer)
    INTO v_gross_arr FROM jsonb_array_elements(v_computed_items) it;
  v_fr_arr := public.fn_fiscal_apportion_v1(v_freight_total,   v_gross_arr);
  v_in_arr := public.fn_fiscal_apportion_v1(v_insurance_total, v_gross_arr);
  v_ot_arr := public.fn_fiscal_apportion_v1(v_other_total,     v_gross_arr);
  v_total := round(v_total + v_freight_total + v_insurance_total + v_other_total, 2);

  v_profile_snap := COALESCE(p_invoice->'fiscal_profile_snapshot', '{}'::jsonb);
  v_tax_snap     := COALESCE(p_invoice->'tax_snapshot', '{}'::jsonb);
  IF jsonb_typeof(v_profile_snap) <> 'object' THEN v_profile_snap := '{}'::jsonb; END IF;
  IF jsonb_typeof(v_tax_snap)     <> 'object' THEN v_tax_snap     := '{}'::jsonb; END IF;
  IF public.fiscal_json_has_sensitive_key(v_profile_snap)
     OR public.fiscal_json_has_sensitive_key(v_tax_snap) THEN
    RAISE EXCEPTION 'sensitive_key_in_snapshot' USING ERRCODE = '22023';
  END IF;

  IF p_invoice_id IS NULL THEN
    INSERT INTO public.fiscal_invoices (company_settings_id, 
      invoice_type, document_model, document_origin, environment, provider,
      status, normalized_status, series, issue_date, notes,
      company_cnpj, customer_id, receivable_id, delivery_id,
      customer_snapshot, company_snapshot, fiscal_totals_snapshot,
      fiscal_profile_snapshot, tax_snapshot,
      draft_version, created_by, total_amount
    ) VALUES (public.h15_active_company(), 
      v_invoice_type,
      p_invoice->>'document_model',
      'MANUAL_RECORD',
      v_env,
      'NONE',
      'DRAFT',
      'DRAFT',
      p_invoice->>'series',
      NULLIF(p_invoice->>'issue_date','')::date,
      p_invoice->>'notes',
      p_invoice->>'company_cnpj',
      v_customer_id,
      NULLIF(p_invoice->>'receivable_id','')::uuid,
      NULLIF(p_invoice->>'delivery_id','')::uuid,
      COALESCE(p_invoice->'customer_snapshot','{}'::jsonb),
      COALESCE(p_invoice->'company_snapshot','{}'::jsonb),
      jsonb_build_object('total_net', v_total, 'vFrete', v_freight_total, 'vSeg', v_insurance_total, 'vOutro', v_other_total, 'computed_at', now()),
      v_profile_snap,
      v_tax_snap,
      1,
      v_user,
      v_total
    ) RETURNING id INTO v_new_id;
  ELSE
    SELECT * INTO v_row FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;
    IF v_row.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'invoice_locked' USING ERRCODE = '55006';
    END IF;
    IF v_row.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'invoice_not_editable' USING ERRCODE = '22023';
    END IF;
    IF v_row.provider <> 'NONE' THEN
      RAISE EXCEPTION 'invoice_has_provider' USING ERRCODE = '22023';
    END IF;
    IF v_row.document_origin <> 'MANUAL_RECORD' THEN
      RAISE EXCEPTION 'invoice_origin_forbidden' USING ERRCODE = '22023';
    END IF;
    IF v_row.draft_version <> p_expected_version THEN
      RAISE EXCEPTION 'conflict' USING ERRCODE = '40001';
    END IF;

    UPDATE public.fiscal_invoices SET
      invoice_type      = v_invoice_type,
      document_model    = COALESCE(p_invoice->>'document_model', document_model),
      document_origin   = 'MANUAL_RECORD',
      environment       = v_env,
      provider          = 'NONE',
      status            = 'DRAFT',
      normalized_status = 'DRAFT',
      series            = COALESCE(p_invoice->>'series', series),
      issue_date        = COALESCE(NULLIF(p_invoice->>'issue_date','')::date, issue_date),
      notes             = COALESCE(p_invoice->>'notes', notes),
      customer_id       = v_customer_id,
      customer_snapshot = COALESCE(p_invoice->'customer_snapshot', customer_snapshot),
      fiscal_profile_snapshot = v_profile_snap,
      tax_snapshot            = v_tax_snap,
      fiscal_totals_snapshot  = jsonb_build_object('total_net', v_total, 'vFrete', v_freight_total, 'vSeg', v_insurance_total, 'vOutro', v_other_total, 'computed_at', now()),
      total_amount            = v_total,
      draft_version           = draft_version + 1,
      updated_at              = now()
    WHERE id = p_invoice_id;
    v_new_id := p_invoice_id;
  END IF;

  DELETE FROM public.fiscal_invoice_items WHERE fiscal_invoice_id = v_new_id;

  INSERT INTO public.fiscal_invoice_items (
    fiscal_invoice_id, item_sequence, item_kind, description,
    quantity, commercial_unit, unit_value, gross_value, discount_value, net_value,
    source_item_type, source_item_id,
    fiscal_profile_snapshot, tax_snapshot, tax_input_snapshot,
    ncm_snapshot, cest_snapshot, origem_snapshot, cfop_snapshot,
    cst_icms_snapshot, csosn_snapshot,
    freight_value, insurance_value, other_value
  )
  SELECT
    v_new_id,
    (it->>'seq')::integer,
    it->>'item_kind',
    it->>'description',
    (it->>'quantity')::numeric,
    it->>'commercial_unit',
    (it->>'unit_value')::numeric,
    (it->>'gross_value')::numeric,
    (it->>'discount_value')::numeric,
    (it->>'net_value')::numeric,
    it->>'source_item_type',
    NULLIF(it->>'source_item_id','')::uuid,
    COALESCE(it->'fiscal_profile_snapshot','{}'::jsonb),
    COALESCE(it->'tax_snapshot','{}'::jsonb),
    COALESCE(it->'tax_input_snapshot','{}'::jsonb),
    it->>'ncm_snapshot',
    it->>'cest_snapshot',
    it->>'origem_snapshot',
    it->>'cfop_snapshot',
    it->>'cst_icms_snapshot',
    it->>'csosn_snapshot',
    COALESCE(v_fr_arr[(it->>'seq')::integer], 0),
    COALESCE(v_in_arr[(it->>'seq')::integer], 0),
    COALESCE(v_ot_arr[(it->>'seq')::integer], 0)
  FROM jsonb_array_elements(v_computed_items) AS it;

  SELECT * INTO v_row FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = v_new_id;
  RETURN jsonb_build_object(
    'id',            v_row.id,
    'draft_version', v_row.draft_version,
    'total_amount',  v_row.total_amount
  );
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_draft_save(uuid,jsonb,jsonb,integer) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_draft_validate_homologation(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_row     public.fiscal_invoices;
  v_items   integer;
  v_missing jsonb := '[]'::jsonb;
  v_status  text;
  v_has_cert boolean;
  v_has_company boolean;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)
          OR public.has_role(v_user, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found' USING ERRCODE = 'P0002'; END IF;

  IF v_row.status <> 'DRAFT' THEN
    RETURN jsonb_build_object(
      'status','BLOCKED',
      'reason','Documento nao esta em rascunho (status atual: '||v_row.status||').'
    );
  END IF;
  IF v_row.provider <> 'NONE' THEN
    RETURN jsonb_build_object(
      'status','BLOCKED',
      'reason','Documento com provedor configurado nao pode ser homologado por esta central.'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) cs WHERE cs.cnpj = v_row.company_cnpj
  ) INTO v_has_company;

  SELECT EXISTS (
    SELECT 1 FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) fc
    JOIN (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) cs ON cs.id = fc.company_settings_id
    WHERE cs.cnpj = v_row.company_cnpj
      AND fc.environment = 'HOMOLOGATION'
      AND fc.is_active = true
      AND fc.status = 'AVAILABLE'
  ) INTO v_has_cert;

  IF NOT v_has_company THEN
    v_missing := v_missing || jsonb_build_object('field','company','message','Configuracao fiscal da empresa nao encontrada.');
  END IF;
  IF v_row.customer_id IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','customer','message','Cliente destinatario e obrigatorio.');
  ELSIF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_row.customer_id) THEN
    v_missing := v_missing || jsonb_build_object('field','customer','message','Cliente informado nao existe mais no cadastro.');
  END IF;
  IF v_row.invoice_type IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','invoice_type','message','Tipo de documento (NF-e/NFS-e) e obrigatorio.');
  END IF;
  IF v_row.document_model IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','document_model','message','Modelo do documento e obrigatorio.');
  END IF;
  IF v_row.series IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','series','message','Serie do documento e obrigatoria.');
  END IF;
  IF v_row.issue_date IS NULL THEN
    v_missing := v_missing || jsonb_build_object('field','issue_date','message','Data de emissao e obrigatoria.');
  END IF;

  SELECT COUNT(*) INTO v_items FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id;
  IF v_items = 0 THEN
    v_missing := v_missing || jsonb_build_object('field','items','message','Documento precisa de ao menos um item.');
  END IF;

  -- 3.16.2-C: perfil fiscal + tributos obrigatórios por item
  -- Produto (NF-e): NCM, CFOP e (CST_ICMS ou CSOSN).
  -- Serviço (NFS-e): LC116, CNAE e ISS rate.
  DECLARE
    r RECORD;
    v_prof jsonb;
    v_tax  jsonb;
    v_icms jsonb;
    v_has_cst_or_csosn boolean;
  BEGIN
    FOR r IN
      SELECT item_sequence, item_kind,
             COALESCE(fiscal_profile_snapshot, '{}'::jsonb) AS prof,
             COALESCE(tax_snapshot, '{}'::jsonb) AS tax
      FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items
      WHERE fiscal_invoice_id = p_invoice_id
      ORDER BY item_sequence
    LOOP
      v_prof := r.prof;
      v_tax  := r.tax;
      IF r.item_kind = 'PRODUCT' THEN
        IF v_prof = '{}'::jsonb OR NULLIF(v_prof->>'ncm','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_fiscal_profile','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem NCM no perfil fiscal.'
          );
        END IF;
        IF NULLIF(v_prof->>'cfop','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_cfop','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem CFOP no perfil fiscal.'
          );
        END IF;
        v_icms := v_tax->'icms';
        v_has_cst_or_csosn :=
          NULLIF(v_prof->>'cst_icms','') IS NOT NULL
          OR NULLIF(v_prof->>'csosn','') IS NOT NULL
          OR (v_icms IS NOT NULL AND (NULLIF(v_icms->>'cst','') IS NOT NULL OR NULLIF(v_icms->>'csosn','') IS NOT NULL));
        IF NOT v_has_cst_or_csosn THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_cst_csosn','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem CST_ICMS ou CSOSN definido.'
          );
        END IF;
      ELSIF r.item_kind = 'SERVICE' THEN
        IF v_prof = '{}'::jsonb OR NULLIF(v_prof->>'lc116_item','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_lc116','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem item LC 116 no perfil fiscal.'
          );
        END IF;
        IF NULLIF(v_prof->>'cnae','') IS NULL THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_cnae','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem CNAE no perfil fiscal.'
          );
        END IF;
        IF NOT (v_tax ? 'iss_rate') OR jsonb_typeof(v_tax->'iss_rate') <> 'number' THEN
          v_missing := v_missing || jsonb_build_object(
            'field','item_iss_rate','item_sequence', r.item_sequence,
            'message','Item '||r.item_sequence||' sem aliquota de ISS definida.'
          );
        END IF;
      END IF;
    END LOOP;
  END;

  IF v_row.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customer_fiscal_profiles WHERE customer_id = v_row.customer_id
  ) THEN
    v_missing := v_missing || jsonb_build_object('field','customer_fiscal_profile','message','Cliente ainda nao possui perfil fiscal cadastrado.');
  END IF;

  IF NOT v_has_cert THEN
    v_missing := v_missing || jsonb_build_object('field','certificate','message','Certificado digital ativo para homologacao nao configurado.');
  END IF;

  v_status := CASE WHEN jsonb_array_length(v_missing) = 0 THEN 'READY' ELSE 'INCOMPLETE' END;

  RETURN jsonb_build_object(
    'status', v_status,
    'missing', v_missing,
    'item_count', v_items,
    'total_amount', v_row.total_amount
  );
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_draft_validate_homologation(uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_emitter_accounting_validate(p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE r public.company_fiscal_settings%ROWTYPE;
BEGIN
  PERFORM public.h15_require_staff();

  IF NOT public.fn_regulatory_can_approve('FISCAL') THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: somente responsavel fiscal/contabil valida o emitente.';
  END IF;
  IF length(btrim(coalesce(p_notes,''))) < 20 THEN
    RAISE EXCEPTION 'FISCAL_JUSTIFICATION_REQUIRED: registre a justificativa da validacao (min. 20 caracteres).';
  END IF;
  SELECT * INTO r FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF r.updated_by IS NOT NULL AND r.updated_by = auth.uid() AND r.configuration_status = 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_SEGREGATION_OF_DUTIES: preparador e validador contabil devem ser pessoas distintas.';
  END IF;
  UPDATE public.company_fiscal_settings
     SET configuration_status = 'VALIDATED', accounting_validated_at = now(),
         accounting_validated_by = auth.uid(), configuration_notes = btrim(p_notes), updated_at = now()
   WHERE id = r.id;
  RETURN jsonb_build_object('companyId', r.id, 'status','VALIDATED');
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_emitter_accounting_validate(text) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_emitter_request_accounting_review(p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM public.h15_require_staff();

  IF NOT public.fn_regulatory_can_prepare() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para solicitar validacao contabil.';
  END IF;
  IF length(btrim(coalesce(p_notes,''))) < 20 THEN
    RAISE EXCEPTION 'FISCAL_JUSTIFICATION_REQUIRED: descreva a solicitacao com pelo menos 20 caracteres.';
  END IF;
  UPDATE public.company_fiscal_settings
     SET configuration_status = 'PENDING_ACCOUNTING',
         configuration_notes = btrim(p_notes), updated_by = auth.uid(), updated_at = now()
   WHERE is_active AND organization_id=public.h15_actor_organization() RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  RETURN jsonb_build_object('companyId', v_id, 'status','PENDING_ACCOUNTING');
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_emitter_request_accounting_review(text) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_event_manual(p_invoice_id uuid, p_event_type text, p_notes text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_id uuid;
  v_fp_existing text;
  v_notes text := NULLIF(btrim(coalesce(p_notes,'')), '');
  v_key text := NULLIF(btrim(coalesce(p_idempotency_key,'')), '');
  v_fp text;
  v_allowed text[] := ARRAY['MANUAL_UPDATED','RECONCILIATION_REQUIRED','RECONCILIATION_COMPLETED'];
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF v_actor IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT (public.has_role(v_actor,'administrador'::app_role)
       OR public.has_role(v_actor,'financeiro'::app_role)
       OR public.has_role(v_actor,'gestor'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_invoice_id IS NULL THEN RAISE EXCEPTION 'invoice_id_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id) THEN
    RAISE EXCEPTION 'invoice_not_found: %', p_invoice_id;
  END IF;
  IF NOT (p_event_type = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'event_type_not_allowed_for_manual: %', p_event_type;
  END IF;
  IF v_notes IS NOT NULL AND char_length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'notes_too_long';
  END IF;

  -- H7B-001: sem chave de idempotencia nao existe INSERT. Fail-closed.
  IF v_key IS NULL THEN
    RAISE EXCEPTION
      'FISCAL_IDEMPOTENCY_REQUIRED: informe p_idempotency_key nao vazia para registrar evento fiscal.'
      USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_TOO_LONG' USING ERRCODE = 'P0001';
  END IF;

  v_fp := public.fn_fiscal_event_fingerprint_v1(p_event_type, v_notes);

  -- Lock logico por documento: serializa retries concorrentes.
  PERFORM pg_advisory_xact_lock(hashtext('fiscal_event_manual:' || p_invoice_id::text));

  SELECT id, payload_fingerprint INTO v_id, v_fp_existing
    FROM (SELECT * FROM public.fiscal_events WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_events
   WHERE fiscal_invoice_id = p_invoice_id
     AND event_type = p_event_type
     AND idempotency_key = v_key;

  IF v_id IS NOT NULL THEN
    IF v_fp_existing IS NOT NULL AND v_fp_existing IS DISTINCT FROM v_fp THEN
      RAISE EXCEPTION
        'FISCAL_IDEMPOTENCY_CONFLICT: chave % ja registrada para o documento % com payload diferente.',
        v_key, p_invoice_id
        USING ERRCODE = 'P0001';
    END IF;
    RETURN v_id; -- replay estavel: mesmo evento, sem duplicar
  END IF;

  INSERT INTO public.fiscal_events(
    fiscal_invoice_id, event_type, event_source, notes, performed_by,
    idempotency_key, payload_fingerprint
  ) VALUES (
    p_invoice_id, p_event_type, 'USER', v_notes, v_actor, v_key, v_fp
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_event_manual(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_mark_signed_v1(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_mark_signed_v1(uuid,text,text,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_reconcile_v1(uuid,uuid,text,text,text,timestamp with time zone) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_event_sefaz_reconcile_v1(uuid,uuid,text,text,text,timestamp with time zone) TO service_role;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_homologation_readiness()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
 v_uid uuid := auth.uid(); v_authorized boolean := false;
 v_company public.company_fiscal_settings%ROWTYPE;
 v_env_ok boolean := false; v_prod_off boolean := false; v_company_ok boolean := false;
 v_nfe_ok boolean := false; v_nfse_ok boolean := false;
 v_products_available boolean := false; v_services_available boolean := false;
 v_customers_available boolean := false; v_drafts_available boolean := false;
 v_products_ready integer := 0; v_services_ready integer := 0; v_customers_ready integer := 0;
 v_cert_ok boolean := false; v_vault_available boolean := false;
 v_upload_fn_ok boolean := false; v_revoke_fn_ok boolean := false;
 v_rpc_save_ok boolean := false; v_rpc_validate_ok boolean := false;
 v_drafts_total integer := 0; v_drafts_ready integer := 0;
 v_drafts_incomp integer := 0; v_drafts_blocked integer := 0;
 v_checklist jsonb := '[]'::jsonb; v_status text := 'INCOMPLETE';
 v_has_blocker boolean := false; v_has_unavailable boolean := false; v_all_items_ready boolean;
BEGIN
  PERFORM public.h15_require_staff();

 IF v_uid IS NULL THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT public.has_role(v_uid,'administrador'::app_role)
     OR public.has_role(v_uid,'gestor'::app_role)
     OR public.has_role(v_uid,'financeiro'::app_role) INTO v_authorized;
 IF NOT v_authorized THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;

 SELECT * INTO v_company FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings
 WHERE is_active=true ORDER BY updated_at DESC NULLS LAST LIMIT 1;
 IF FOUND THEN
  v_env_ok := v_company.fiscal_environment='HOMOLOGATION';
  v_prod_off := COALESCE(v_company.production_enabled,false)=false;
  v_company_ok := v_company.cnpj IS NOT NULL AND length(v_company.cnpj)>=14
    AND v_company.legal_name IS NOT NULL AND length(btrim(v_company.legal_name))>0
    AND v_company.fiscal_email IS NOT NULL AND v_company.municipality_ibge_code IS NOT NULL;
  v_nfe_ok := COALESCE(v_company.nfe_enabled,false)
    AND COALESCE(jsonb_typeof(v_company.nfe_configuration),'null')='object'
    AND v_company.nfe_configuration<>'{}'::jsonb;
  v_nfse_ok := COALESCE(v_company.nfse_enabled,false)
    AND COALESCE(jsonb_typeof(v_company.nfse_configuration),'null')='object'
    AND v_company.nfse_configuration<>'{}'::jsonb;
 END IF;

 BEGIN SELECT count(*)::int INTO v_products_ready FROM public.v_product_fiscal_readiness WHERE minimally_classified=true AND accounting_validated=true; v_products_available:=true;
 EXCEPTION WHEN OTHERS THEN v_products_available:=false; v_products_ready:=0; END;
 BEGIN SELECT count(*)::int INTO v_services_ready FROM public.v_service_fiscal_readiness WHERE minimally_classified=true AND accounting_validated=true; v_services_available:=true;
 EXCEPTION WHEN OTHERS THEN v_services_available:=false; v_services_ready:=0; END;
 BEGIN SELECT count(*)::int INTO v_customers_ready FROM public.v_customer_fiscal_readiness WHERE has_ibge=true; v_customers_available:=true;
 EXCEPTION WHEN OTHERS THEN v_customers_available:=false; v_customers_ready:=0; END;

 IF v_company.id IS NOT NULL THEN
  SELECT EXISTS(SELECT 1 FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) c WHERE c.company_settings_id=v_company.id AND c.is_active=true AND c.status='AVAILABLE' AND c.environment='HOMOLOGATION' AND c.valid_from IS NOT NULL AND c.valid_from<=now() AND c.valid_until IS NOT NULL AND c.valid_until>now()) INTO v_cert_ok;
 END IF;
 v_vault_available := EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='fiscal_certificate_material');
 v_rpc_save_ok := EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_fiscal_draft_save');
 v_rpc_validate_ok := EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_fiscal_draft_validate_homologation');
 v_upload_fn_ok := EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_fiscal_certificate_register_a1');
 v_revoke_fn_ok := EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_fiscal_certificate_revoke');

 BEGIN
  SELECT count(*)::int,
   count(*) FILTER(WHERE homologation_validation_status='READY')::int,
   count(*) FILTER(WHERE homologation_validation_status IN ('INCOMPLETE','NOT_VALIDATED'))::int,
   count(*) FILTER(WHERE homologation_validation_status='BLOCKED')::int
  INTO v_drafts_total,v_drafts_ready,v_drafts_incomp,v_drafts_blocked
  FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE document_origin='MANUAL_RECORD' AND status='DRAFT';
  v_drafts_available:=true;
 EXCEPTION WHEN OTHERS THEN v_drafts_available:=false; v_drafts_total:=0; v_drafts_ready:=0; v_drafts_incomp:=0; v_drafts_blocked:=0; END;

 IF v_company.id IS NOT NULL AND COALESCE(v_company.production_enabled,false)=true THEN v_has_blocker:=true; END IF;
 v_checklist := jsonb_build_array(
  jsonb_build_object('key','env_homologation','label','Ambiente fiscal em homologação','status',CASE WHEN v_company.id IS NULL THEN 'NOT_CONFIGURED' WHEN v_env_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','production_disabled','label','Produção desabilitada','status',CASE WHEN v_prod_off THEN 'READY' ELSE 'BLOCKED' END),
  jsonb_build_object('key','company_profile','label','Dados da empresa completos','status',CASE WHEN v_company.id IS NULL THEN 'NOT_CONFIGURED' WHEN v_company_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','nfe_configured','label','NF-e habilitada e configurada','status',CASE WHEN v_nfe_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','nfse_configured','label','NFS-e habilitada e configurada','status',CASE WHEN v_nfse_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','product_ready','label','Ao menos um produto fiscal pronto','status',CASE WHEN NOT v_products_available THEN 'UNAVAILABLE' WHEN v_products_ready>0 THEN 'READY' ELSE 'INCOMPLETE' END,'count',v_products_ready),
  jsonb_build_object('key','service_ready','label','Ao menos um serviço fiscal pronto','status',CASE WHEN NOT v_services_available THEN 'UNAVAILABLE' WHEN v_services_ready>0 THEN 'READY' ELSE 'INCOMPLETE' END,'count',v_services_ready),
  jsonb_build_object('key','customer_ready','label','Ao menos um cliente fiscal pronto','status',CASE WHEN NOT v_customers_available THEN 'UNAVAILABLE' WHEN v_customers_ready>0 THEN 'READY' ELSE 'INCOMPLETE' END,'count',v_customers_ready),
  jsonb_build_object('key','drafts_source','label','Fonte de rascunhos disponível','status',CASE WHEN v_drafts_available THEN 'READY' ELSE 'UNAVAILABLE' END,'count',v_drafts_total),
  jsonb_build_object('key','certificate_active','label','Certificado de homologação ativo e vigente','status',CASE WHEN v_company.id IS NULL THEN 'NOT_CONFIGURED' WHEN v_cert_ok THEN 'READY' ELSE 'INCOMPLETE' END),
  jsonb_build_object('key','vault_available','label','Cofre de certificados disponível','status',CASE WHEN v_vault_available THEN 'READY' ELSE 'UNAVAILABLE' END),
  jsonb_build_object('key','upload_function','label','Função de registro de certificado disponível','status',CASE WHEN v_upload_fn_ok THEN 'READY' ELSE 'UNAVAILABLE' END),
  jsonb_build_object('key','revoke_function','label','Função de revogação de certificado disponível','status',CASE WHEN v_revoke_fn_ok THEN 'READY' ELSE 'UNAVAILABLE' END),
  jsonb_build_object('key','rpc_draft_save','label','RPC de salvamento de rascunho disponível','status',CASE WHEN v_rpc_save_ok THEN 'READY' ELSE 'UNAVAILABLE' END),
  jsonb_build_object('key','rpc_draft_validate','label','RPC de validação de homologação disponível','status',CASE WHEN v_rpc_validate_ok THEN 'READY' ELSE 'UNAVAILABLE' END)
 );
 SELECT bool_and((e->>'status')='READY'),bool_or((e->>'status')='UNAVAILABLE') INTO v_all_items_ready,v_has_unavailable FROM jsonb_array_elements(v_checklist)e;
 IF v_has_blocker THEN v_status:='BLOCKED'; ELSIF v_has_unavailable THEN v_status:='UNAVAILABLE'; ELSIF COALESCE(v_all_items_ready,false) AND v_env_ok THEN v_status:='READY'; ELSE v_status:='INCOMPLETE'; END IF;
 RETURN jsonb_build_object('status',v_status,'generated_at',to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'environment_label',CASE WHEN v_company.id IS NULL THEN 'Não configurado' WHEN v_env_ok THEN 'Homologação' ELSE 'Indisponível' END,'production_enabled',COALESCE(v_company.production_enabled,false),'checklist',v_checklist,'counts',jsonb_build_object('drafts_total',v_drafts_total,'drafts_ready',v_drafts_ready,'drafts_incomplete',v_drafts_incomp,'drafts_blocked',v_drafts_blocked,'products_ready',v_products_ready,'services_ready',v_services_ready,'customers_ready',v_customers_ready));
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_homologation_readiness() FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_homologation_readiness_rtc_check()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT jsonb_typeof(rtc_configuration) = 'object'
       AND rtc_configuration ? 'schema_version'
       AND rtc_configuration ? 'rtc_environment'
       AND (rtc_configuration->>'rtc_environment')
             IN ('NOT_CONFIGURED','HOMOLOGATION')
      FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings
     ORDER BY updated_at DESC NULLS LAST LIMIT 1), false);
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_homologation_readiness_rtc_check() FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_homologation_readiness_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_base jsonb; v_checklist jsonb; v_rtc_ok boolean;
  v_all_ready boolean; v_any_unavail boolean; v_any_blocked boolean;
  v_prod_on boolean; v_status text;
BEGIN
  PERFORM public.h15_require_staff();

  IF NOT public._fiscal_rtc_can_read(v_uid) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
  v_base := public.rpc_fiscal_homologation_readiness();
  v_rtc_ok := public.rpc_fiscal_homologation_readiness_rtc_check();
  v_checklist := COALESCE(v_base->'checklist','[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
         'key','rtc_configured',
         'label','Configuração RTC 2026 (IBS/CBS) preenchida',
         'status', CASE WHEN v_rtc_ok THEN 'READY' ELSE 'INCOMPLETE' END));
  SELECT bool_and((elem->>'status') = 'READY'),
         bool_or((elem->>'status') = 'UNAVAILABLE'),
         bool_or((elem->>'status') = 'BLOCKED')
   INTO v_all_ready, v_any_unavail, v_any_blocked
   FROM jsonb_array_elements(v_checklist) elem;
  v_prod_on := COALESCE((v_base->>'production_enabled')::boolean, false);
  v_status := CASE
    WHEN v_any_blocked OR v_prod_on THEN 'BLOCKED'
    WHEN v_any_unavail             THEN 'UNAVAILABLE'
    WHEN COALESCE(v_all_ready,false) AND v_rtc_ok THEN 'READY'
    ELSE 'INCOMPLETE' END;
  RETURN v_base || jsonb_build_object('status', v_status, 'checklist', v_checklist);
END; $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_homologation_readiness_v2() FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_nfe_readiness_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  emit public.company_fiscal_settings%ROWTYPE;
  rec_total int; rec_ready int; pol_pub int; rules_pub int; series_cnt int;
  cert_ok boolean; pend jsonb := '[]'::jsonb;
  cov jsonb; micro jsonb;
  m_active int; m_ready int; m_draft int; m_blocked int; m_inactive int;
  emitter_status text; overall text;
BEGIN
  PERFORM public.h15_require_staff();

  IF NOT public.fn_fiscal_can_read_internal() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao de leitura fiscal.';
  END IF;

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE organization_id = public.h15_actor_organization()) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  SELECT count(*), count(*) FILTER (WHERE nfe_readiness_status = 'READY')
    INTO rec_total, rec_ready FROM public.customer_fiscal_profiles;
  SELECT count(*) INTO pol_pub FROM public.fiscal_operation_policies
   WHERE policy_status = 'PUBLISHED' AND document_model = '55';
  SELECT count(*) INTO rules_pub FROM public.fiscal_tax_rules WHERE status = 'PUBLISHED';
  SELECT count(*) INTO series_cnt FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE status = 'ACTIVE';
  cert_ok := emit.certificate_ref IS NOT NULL;

  cov := public.fn_fiscal_scenario_coverage();
  micro := coalesce(cov->'microorganisms','{}'::jsonb);
  m_active   := coalesce((micro->>'active')::int,0);
  m_ready    := coalesce((micro->>'ready')::int,0);
  m_draft    := coalesce((micro->>'draft')::int,0);
  m_blocked  := coalesce((micro->>'blocked')::int,0);
  m_inactive := coalesce((micro->>'inactive')::int,0);

  -- Teto absoluto da F3: nunca READY_PRODUCTION.
  emitter_status := coalesce(emit.nfe_readiness_status,'NOT_READY');
  IF emitter_status = 'READY_PRODUCTION' THEN
    emitter_status := 'NOT_READY';
  END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','EMITTER_PRODUCTION_BLOCKED_F3',
      'severity','BLOCK','message','Ambiente de producao (tpAmb=1) bloqueado nesta fase. Teto: READY_HOMOLOGATION.');
  END IF;
  IF emit.id IS NOT NULL AND emit.sefaz_homologation_at IS NULL THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SEFAZ_HOMOLOGATION_NOT_RECORDED',
      'severity','WARN','message','Homologacao SEFAZ ainda nao registrada. A transicao so ocorrera por RPC controlada em fase posterior.');
  END IF;

  IF emit.id IS NULL THEN
    pend := pend || jsonb_build_object('section','EMITENTE','code','EMITTER_NOT_CONFIGURED','severity','BLOCK','message','Emitente nao cadastrado.');
  ELSE
    pend := pend || coalesce((SELECT jsonb_agg(e || jsonb_build_object('section','EMITENTE'))
                              FROM jsonb_array_elements(emit.nfe_readiness_pendencies) e), '[]'::jsonb);
  END IF;

  IF rec_total = 0 THEN
    pend := pend || jsonb_build_object('section','DESTINATARIOS','code','RECIPIENTS_NONE','severity','BLOCK','message','Nenhum perfil fiscal de destinatario cadastrado.');
  ELSIF rec_ready = 0 THEN
    pend := pend || jsonb_build_object('section','DESTINATARIOS','code','RECIPIENTS_NONE_READY','severity','BLOCK','message','Nenhum destinatario com cadastro fiscal completo.');
  END IF;

  IF pol_pub = 0 THEN
    pend := pend || jsonb_build_object('section','OPERACOES','code','OPERATION_POLICIES_NONE','severity','BLOCK','message','Nenhuma politica de operacao/CFOP publicada para modelo 55.');
  END IF;

  IF coalesce((cov->>'total')::int,0) = 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_NO_SCENARIOS','severity','BLOCK',
      'message','Nao ha cenarios reais (destinatario pronto x canal ativo x NCM oficial) para aferir cobertura tributaria.');
  ELSIF (cov->>'covered')::int < (cov->>'total')::int THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','COVERAGE_INCOMPLETE','severity','BLOCK',
      'message','Cobertura tributaria incompleta: '||(cov->>'covered')||' de '||(cov->>'total')||' cenarios validados no motor.');
  END IF;

  -- Somente microrganismos ATIVOS podem bloquear. Inativos sao informativos.
  IF m_blocked > 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','MICROORGANISMS_BLOCKED','severity','BLOCK',
      'message', m_blocked||' microrganismo(s) ativo(s) com perfil fiscal BLOQUEADO.');
  END IF;
  IF m_draft > 0 THEN
    pend := pend || jsonb_build_object('section','TRIBUTOS','code','MICROORGANISMS_NOT_READY','severity','BLOCK',
      'message', m_draft||' de '||m_active||' microrganismos ativos sem dossie aprovado e validacao contabil.');
  END IF;

  IF NOT cert_ok THEN
    pend := pend || jsonb_build_object('section','CERTIFICADO','code','CERTIFICATE_MISSING','severity','BLOCK','message','Certificado digital nao vinculado (apenas referencia segura; nenhum segredo e armazenado).');
  END IF;
  IF series_cnt = 0 THEN
    pend := pend || jsonb_build_object('section','HOMOLOGACAO','code','SERIES_NOT_INITIALIZED','severity','WARN','message','Nenhuma serie de numeracao inicializada; sera criada na primeira reserva.');
  END IF;

  overall := CASE
    WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(pend) e WHERE e->>'severity'='BLOCK') THEN 'NOT_READY'
    WHEN jsonb_array_length(pend) > 0 THEN 'PARTIAL'
    ELSE 'READY_HOMOLOGATION' END;

  RETURN jsonb_build_object(
    'generatedAt', to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SSZ'),
    'documentModel','55',
    'maxAllowedStatus','READY_HOMOLOGATION',
    'emitter', jsonb_build_object(
      'configured', emit.id IS NOT NULL,
      'status', emitter_status,
      'crt', emit.crt, 'uf', emit.state,
      'series', emit.nfe_series_number, 'environment', emit.nfe_environment_code,
      'certificateLinked', cert_ok,
      'sefazHomologationRecorded', emit.sefaz_homologation_at IS NOT NULL,
      'productionBlocked', true,
      'accountingValidated', emit.accounting_validated_at IS NOT NULL),
    'recipients', jsonb_build_object('total', rec_total, 'ready', rec_ready),
    'operations', jsonb_build_object('publishedPolicies', pol_pub),
    'taxes', jsonb_build_object('publishedRules', rules_pub, 'missingMandatoryKinds', '[]'::jsonb),
    'coverage', cov,
    'microorganisms', jsonb_build_object(
      'active', m_active, 'ready', m_ready, 'draft', m_draft,
      'blocked', m_blocked, 'inactive', m_inactive,
      'total', m_active + m_inactive),
    'numbering', jsonb_build_object('activeSeries', series_cnt),
    'pendencies', pend,
    'overallStatus', overall);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_nfe_readiness_v1() FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_preflight_v1(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_user      uuid := auth.uid();
  v_inv       public.fiscal_invoices;
  v_blockers  jsonb := '[]'::jsonb;
  v_warnings  jsonb := '[]'::jsonb;
  v_env       text := NULL;
  v_validate  jsonb;
  v_sum       numeric(14,2);
  v_diff      numeric(14,2);
  v_tolerance numeric := 0.01;
  v_dups      integer;
  v_miss      jsonb;
  v_pend      jsonb;
  v_cfs       public.company_fiscal_settings;
  v_cfp       public.customer_fiscal_profiles;
  r           RECORD;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (public.has_role(v_user, 'administrador'::app_role)
          OR public.has_role(v_user, 'financeiro'::app_role)
          OR public.has_role(v_user, 'gestor'::app_role)) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem competencia fiscal.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id USING ERRCODE = 'P0002';
  END IF;

  -- 1) Ambiente (fail-closed; produção sempre recusada pelo gate).
  BEGIN
    v_env := public.fn_fiscal_environment_gate_v1('PREFLIGHT');
  EXCEPTION WHEN OTHERS THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code', split_part(SQLERRM, ':', 1),
      'section', 'AMBIENTE',
      'field', 'environment',
      'message', SQLERRM,
      'action', 'Revisar configuracao do emitente/ambiente com a contabilidade.');
  END;

  -- 2) Regras de documento/itens/tributos, explodidas POR CAMPO.
  BEGIN
    v_validate := public.rpc_fiscal_draft_validate_homologation(p_invoice_id);
  EXCEPTION WHEN OTHERS THEN
    v_validate := jsonb_build_object('status','BLOCKED','reason', SQLERRM);
  END;

  IF coalesce(v_validate->>'status','BLOCKED') = 'BLOCKED'
     AND coalesce(jsonb_array_length(v_validate->'missing'), 0) = 0 THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','FISCAL_DOCUMENT_BLOCKED','section','DOCUMENTO','field','document',
      'message', coalesce(v_validate->>'reason','Documento fiscal bloqueado para homologacao.'),
      'action','Revisar a situacao do documento antes de transmitir.');
  END IF;

  FOR v_miss IN
    SELECT value FROM jsonb_array_elements(coalesce(v_validate->'missing','[]'::jsonb))
  LOOP
    v_blockers := v_blockers || jsonb_build_object(
      'code', 'FISCAL_FIELD_REQUIRED',
      'section', CASE
                   WHEN v_miss->>'field' LIKE 'item%' THEN 'ITENS'
                   WHEN v_miss->>'field' LIKE 'customer%' THEN 'DESTINATARIO'
                   WHEN v_miss->>'field' IN ('company','certificate') THEN 'EMITENTE'
                   ELSE 'DOCUMENTO'
                 END,
      'field', v_miss->>'field',
      'itemSequence', v_miss->'item_sequence',
      'message', v_miss->>'message',
      'action', 'Preencher o campo indicado no cadastro de origem.');
  END LOOP;

  -- 3) Pendências do EMITENTE (reutiliza a função canônica de prontidão).
  SELECT * INTO v_cfs FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active LIMIT 1;
  IF FOUND THEN
    FOR v_pend IN
      SELECT value FROM jsonb_array_elements(
        coalesce(public.fn_fiscal_emitter_pendencies_row(v_cfs), '[]'::jsonb))
    LOOP
      IF coalesce(v_pend->>'severity','BLOCK') = 'BLOCK' THEN
        v_blockers := v_blockers || jsonb_build_object(
          'code', v_pend->>'code', 'section','EMITENTE',
          'field', v_pend->>'field', 'message', v_pend->>'message',
          'action','Completar o cadastro do emitente.');
      ELSE
        v_warnings := v_warnings || jsonb_build_object(
          'code', v_pend->>'code', 'section','EMITENTE',
          'field', v_pend->>'field', 'message', v_pend->>'message',
          'action','Conferir manualmente com a contabilidade.');
      END IF;
    END LOOP;
  END IF;

  -- 4) Pendências do DESTINATÁRIO (documento/IE/UF/município/endereço).
  IF v_inv.customer_id IS NOT NULL THEN
    SELECT * INTO v_cfp FROM public.customer_fiscal_profiles
     WHERE customer_id = v_inv.customer_id LIMIT 1;
    IF FOUND THEN
      FOR v_pend IN
        SELECT value FROM jsonb_array_elements(
          coalesce(public.fn_fiscal_recipient_pendencies_row(v_cfp), '[]'::jsonb))
      LOOP
        IF coalesce(v_pend->>'severity','BLOCK') = 'BLOCK' THEN
          v_blockers := v_blockers || jsonb_build_object(
            'code', v_pend->>'code', 'section','DESTINATARIO',
            'field', v_pend->>'field', 'message', v_pend->>'message',
            'action','Completar o perfil fiscal do destinatario.');
        ELSE
          v_warnings := v_warnings || jsonb_build_object(
            'code', v_pend->>'code', 'section','DESTINATARIO',
            'field', v_pend->>'field', 'message', v_pend->>'message',
            'action','Conferir o perfil fiscal do destinatario.');
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- 5) Sanidade aritmética item a item (unidade, quantidade, valores).
  FOR r IN
    SELECT item_sequence, quantity, unit_value, commercial_unit,
           net_value, gross_value, discount_value
      FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items
     WHERE fiscal_invoice_id = p_invoice_id
     ORDER BY item_sequence
  LOOP
    IF r.quantity IS NULL OR r.quantity <= 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_QUANTITY_INVALID','section','ITENS','field','quantity',
        'itemSequence', r.item_sequence,
        'message', format('Item %s com quantidade invalida.', r.item_sequence),
        'action','Corrigir a quantidade do item.');
    END IF;
    IF r.commercial_unit IS NULL OR btrim(r.commercial_unit) = '' THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_UNIT_MISSING','section','ITENS','field','commercial_unit',
        'itemSequence', r.item_sequence,
        'message', format('Item %s sem unidade comercial.', r.item_sequence),
        'action','Definir a unidade comercial do item.');
    END IF;
    IF r.unit_value IS NULL OR r.unit_value < 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_UNIT_VALUE_INVALID','section','ITENS','field','unit_value',
        'itemSequence', r.item_sequence,
        'message', format('Item %s com valor unitario invalido.', r.item_sequence),
        'action','Corrigir o valor unitario do item.');
    END IF;
    IF r.net_value IS NULL THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_NET_VALUE_MISSING','section','ITENS','field','net_value',
        'itemSequence', r.item_sequence,
        'message', format('Item %s sem valor liquido calculado.', r.item_sequence),
        'action','Recalcular o documento fiscal.');
    ELSIF r.quantity IS NOT NULL AND r.unit_value IS NOT NULL
          AND abs(r.net_value - (r.quantity * r.unit_value - coalesce(r.discount_value,0))) > v_tolerance THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_ITEM_TOTAL_MISMATCH','section','ITENS','field','net_value',
        'itemSequence', r.item_sequence,
        'message', format('Item %s: liquido diverge de quantidade x unitario - desconto.', r.item_sequence),
        'action','Recalcular o documento a partir do snapshot de origem.');
    END IF;
  END LOOP;

  -- 6) Coerência aritmética dos totais (tolerância documentada de R$ 0,01).
  SELECT coalesce(sum(coalesce(net_value, gross_value, quantity * unit_value)), 0)::numeric(14,2)
    INTO v_sum
    FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id;

  IF v_inv.total_amount IS NULL THEN
    v_blockers := v_blockers || jsonb_build_object(
      'code','FISCAL_TOTAL_MISSING','section','TOTAIS','field','total_amount',
      'message','Total do documento nao informado.','action','Recalcular o documento.');
  ELSE
    v_diff := abs(v_inv.total_amount - v_sum);
    IF v_diff > v_tolerance THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_TOTAL_MISMATCH','section','TOTAIS','field','total_amount',
        'message', format('Total do documento (%s) diverge da soma dos itens (%s).', v_inv.total_amount, v_sum),
        'action','Recalcular o documento a partir do snapshot de origem.');
    END IF;
  END IF;

  -- 7) Duplicidade ativa por origem (mesma regra do índice ux_fiscal_invoice_scope_nfe).
  IF v_inv.source_id IS NOT NULL AND v_inv.document_model = 'NFE' THEN
    SELECT count(*) INTO v_dups FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) f
     WHERE f.source_type = v_inv.source_type
       AND f.source_id = v_inv.source_id
       AND f.document_model = 'NFE'
       AND f.id <> v_inv.id
       AND f.status <> 'CANCELED';
    IF v_dups > 0 THEN
      v_blockers := v_blockers || jsonb_build_object(
        'code','FISCAL_DUPLICATE_ACTIVE_DOCUMENT','section','ORIGEM','field','source_id',
        'message','Ja existe documento fiscal ativo para esta origem.',
        'action','Cancelar ou reaproveitar o documento existente.');
    END IF;
  END IF;

  -- 8) Pré-requisito externo: certificado de homologação para transmitir.
  IF NOT EXISTS (
    SELECT 1 FROM (SELECT * FROM public.fiscal_certificates WHERE public.h15_company_access(company_settings_id)) fc
     JOIN (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) cs ON cs.id = fc.company_settings_id
    WHERE fc.environment = 'HOMOLOGATION' AND fc.is_active AND fc.status = 'AVAILABLE'
  ) THEN
    v_warnings := v_warnings || jsonb_build_object(
      'code','EXTERNAL_PREREQUISITE_MISSING','section','CERTIFICADO','field','certificate',
      'message','Certificado de homologacao indisponivel: transmissao nao pode ser executada.',
      'action','Provisionar certificado A1 de homologacao antes do smoke SEFAZ.');
  END IF;

  RETURN jsonb_build_object(
    'invoiceId', p_invoice_id,
    'preflightVersion', 'h7k-v1',
    'environment', coalesce(v_env, 'UNKNOWN'),
    'status', CASE WHEN jsonb_array_length(v_blockers) > 0 THEN 'BLOCKED'
                   WHEN jsonb_array_length(v_warnings) > 0 THEN 'READY_WITH_PREREQUISITES'
                   ELSE 'READY' END,
    'canTransmit', (jsonb_array_length(v_blockers) = 0 AND jsonb_array_length(v_warnings) = 0),
    'blockers', v_blockers,
    'warnings', v_warnings,
    'fields', (
      SELECT coalesce(jsonb_object_agg(f.field, f.msgs), '{}'::jsonb)
        FROM (
          SELECT b->>'field' AS field, jsonb_agg(b->>'message') AS msgs
            FROM jsonb_array_elements(v_blockers) b
           WHERE b->>'field' IS NOT NULL
           GROUP BY b->>'field'
        ) f
    ),
    'itemsTotal', v_sum,
    'documentTotal', v_inv.total_amount,
    'toleranceBRL', v_tolerance,
    'evaluatedAt', now()
  );
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_preflight_v1(uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_reserve_nfe_number_v1(p_invoice_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  s public.fiscal_document_series%ROWTYPE;
  existing public.fiscal_number_reservations%ROWTYPE;
  n int; cnf text; key43 text; dv int; full_key text; cuf text;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para reservar numeracao.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;

  -- F3.1-R1: gate de ambiente avaliado ANTES de qualquer leitura/efeito, fail-closed.
  PERFORM public.fn_fiscal_assert_environment_homologation();
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: documento nao informado.';
  END IF;

  SELECT * INTO inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_number_reservations WHERE public.h15_invoice_access(fiscal_invoice_id)) r
              WHERE r.idempotency_key = p_idempotency_key
                AND r.fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.'
      USING HINT = 'Gere uma chave exclusiva por documento. Reservas nunca sao compartilhadas entre documentos.';
  END IF;

  SELECT * INTO existing FROM (SELECT * FROM public.fiscal_number_reservations WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_number_reservations
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('reservationId', existing.id, 'number', existing.number,
      'series', (SELECT series FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE id = existing.series_id),
      'accessKey', existing.access_key, 'checkDigit', existing.check_digit,
      'tpEmis', existing.tp_emis, 'status', existing.status, 'idempotentReplay', true);
  END IF;

  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: reserva permitida apenas em rascunho (status=%)', inv.status;
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_number_reservations WHERE public.h15_invoice_access(fiscal_invoice_id)) r
             WHERE r.fiscal_invoice_id = p_invoice_id AND r.status = 'RESERVED') THEN
    RAISE EXCEPTION 'FISCAL_NUMBER_ALREADY_RESERVED: documento ja possui reserva ativa.';
  END IF;
  IF inv.tax_snapshot IS NULL OR NOT (inv.tax_snapshot ? 'engineVersion') THEN
    RAISE EXCEPTION 'FISCAL_CALCULATION_REQUIRED: calcule os tributos antes de reservar numeracao.';
  END IF;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %',
      (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id))->>'reasons';
  END IF;

  -- F3.1: devedor B2B x destinatario reavaliado na reserva.
  PERFORM public.fn_fiscal_assert_debtor_recipient(p_invoice_id);

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao (tpAmb=1) bloqueado na fase F3; teto READY_HOMOLOGATION.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fiscal_series:' || emit.id::text || ':' ||
          coalesce(emit.nfe_series_number,0)::text || ':' || coalesce(emit.nfe_environment_code,'2')));

  SELECT * INTO s FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series
   WHERE company_id = emit.id AND document_model = '55'
     AND series = emit.nfe_series_number AND environment_code = emit.nfe_environment_code
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.fiscal_document_series (company_id, series, environment_code, created_by)
    VALUES (emit.id, emit.nfe_series_number, emit.nfe_environment_code, auth.uid())
    RETURNING * INTO s;
    SELECT * INTO s FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE id = s.id FOR UPDATE;
  END IF;
  IF s.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'FISCAL_SERIES_BLOCKED: serie % bloqueada.', s.series;
  END IF;

  n := s.current_number + 1;
  IF n > 999999999 THEN RAISE EXCEPTION 'FISCAL_SERIES_EXHAUSTED: serie % esgotada.', s.series; END IF;

  cnf := lpad(((get_byte(extensions.gen_random_bytes(4),0)::bigint << 24
              | get_byte(extensions.gen_random_bytes(4),0)::bigint << 16
              | get_byte(extensions.gen_random_bytes(4),0)::bigint << 8
              | get_byte(extensions.gen_random_bytes(4),0)::bigint) % 100000000)::text, 8, '0');

  cuf := public.fn_fiscal_uf_ibge_code(emit.state);
  key43 := cuf
        || to_char(coalesce(inv.issue_date, current_date), 'YYMM')
        || public.fn_fiscal_digits(emit.cnpj)
        || '55'
        || lpad(s.series::text, 3, '0')
        || lpad(n::text, 9, '0')
        || coalesce(inv.tp_emis,1)::text
        || cnf;
  dv := public.fn_fiscal_access_key_dv(key43);
  full_key := key43 || dv::text;

  UPDATE public.fiscal_document_series SET current_number = n, updated_at = now() WHERE id = s.id;

  INSERT INTO public.fiscal_number_reservations
    (series_id, number, cnf, access_key, check_digit, status, fiscal_invoice_id,
     idempotency_key, reserved_by, tp_emis)
  VALUES (s.id, n, cnf, full_key, dv, 'RESERVED', p_invoice_id,
          p_idempotency_key, auth.uid(), coalesce(inv.tp_emis,1));

  UPDATE public.fiscal_invoices
     SET series = s.series::text, invoice_number = n::text, access_key = full_key, updated_at = now()
   WHERE id = p_invoice_id;

  RETURN jsonb_build_object('number', n, 'series', s.series, 'accessKey', full_key,
                            'checkDigit', dv, 'tpEmis', coalesce(inv.tp_emis,1),
                            'status','RESERVED', 'idempotentReplay', false);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_reserve_nfe_number_v1(uuid,text) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_sefaz_transmission_status_v1(_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_items jsonb;
BEGIN
  PERFORM public.h15_require_staff();
  IF _invoice_id IS NOT NULL THEN PERFORM public.h15_require_invoice(_invoice_id); END IF;

  IF NOT public.fn_fiscal_can_read_internal(auth.uid()) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'createdAt' DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'transmissionId', t.id, 'service', t.service, 'state', t.state,
      'outcome', t.outcome,
      'invoiceId', t.fiscal_invoice_id, 'xmlRunId', t.xml_run_id,
      'eventId', t.fiscal_event_id,
      'environmentCode', t.environment_code, 'endpointHost', t.endpoint_host,
      'cStat', t.c_stat, 'xMotivo', t.x_motivo, 'chNFe', t.ch_nfe,
      'nProt', t.n_prot, 'nRec', t.n_rec, 'dhRecbto', t.dh_recbto,
      'errorCode', t.error_code, 'attempt', t.attempt,
      'correlationId', t.correlation_id,
      'createdAt', t.created_at, 'completedAt', t.completed_at) AS x
    FROM (SELECT * FROM public.fiscal_sefaz_transmissions WHERE public.h15_invoice_access(fiscal_invoice_id)) t
    WHERE (_invoice_id IS NULL OR t.fiscal_invoice_id = _invoice_id)
    ORDER BY t.created_at DESC
    LIMIT 50
  ) s;

  RETURN jsonb_build_object('ceiling', 'HOMOLOGATION', 'environmentCode', '2',
                            'items', v_items);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_sefaz_transmission_status_v1(uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_tax_preview_v1(p_invoice_id uuid, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  inv public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  it record; ov jsonb; rule public.fiscal_tax_rules%ROWTYPE;
  ctx jsonb; res jsonb; item_taxes jsonb; out_items jsonb := '[]'::jsonb;
  ref_date date; kinds text[]; k text;
  v_prod numeric; v_icms_own numeric; v_ipi numeric; v_base_st numeric; v_st_val numeric;
  v_inputs jsonb; v_manual text;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.fn_fiscal_can_operate() THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para simular tributos.' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items_array_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;
  IF inv.document_model IS DISTINCT FROM 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: preview de servicos ainda indisponivel.';
  END IF;
  IF inv.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_DRAFT: preview disponivel apenas em rascunho (status=%)', inv.status;
  END IF;

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') = '1' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: ambiente de producao bloqueado.';
  END IF;

  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;

  ref_date := coalesce(inv.issue_date, current_date);

  FOR it IN SELECT * FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_invoice_items WHERE fiscal_invoice_id = p_invoice_id ORDER BY item_sequence
  LOOP
    SELECT e INTO ov FROM jsonb_array_elements(p_items) e
     WHERE (e->>'item_sequence')::int = it.item_sequence LIMIT 1;

    v_inputs := coalesce(ov->'tax_input_snapshot', it.tax_input_snapshot, '{}'::jsonb);
    IF NOT public.fn_fiscal_tax_input_valid(v_inputs) THEN
      RAISE EXCEPTION 'tax_input_snapshot_invalid:%', it.item_sequence USING ERRCODE = '22023';
    END IF;

    v_prod := public.fn_fiscal_round(coalesce(
      nullif(ov->>'gross_value','')::numeric,
      it.gross_value, it.quantity * it.unit_value));

    res := public.fn_fiscal_compute_item_taxes_v1(
      emit, dest, coalesce(inv.direction,'OUT'), inv.sales_channel, ref_date, it.ncm_snapshot,
      v_prod,
      public.fn_fiscal_round(coalesce(nullif(ov->>'discount_value','')::numeric, it.discount_value, 0)),
      public.fn_fiscal_round(coalesce(it.freight_value,0)),
      public.fn_fiscal_round(coalesce(it.insurance_value,0)),
      public.fn_fiscal_round(coalesce(it.other_value,0)),
      v_inputs, auth.uid());
    item_taxes := res->'taxes';

    out_items := out_items || jsonb_build_object(
      'itemSequence', it.item_sequence,
      'description', it.description,
      'taxOrder', res->'taxOrder',
      'policy', res->'policy',
      'chained', res->'chained',
      'itemTotals', res->'itemTotals',
      'components', jsonb_build_object(
        'produto', v_prod,
        'desconto', public.fn_fiscal_round(coalesce(nullif(ov->>'discount_value','')::numeric, it.discount_value, 0)),
        'frete', public.fn_fiscal_round(coalesce(it.freight_value,0)),
        'seguro', public.fn_fiscal_round(coalesce(it.insurance_value,0)),
        'outras', public.fn_fiscal_round(coalesce(it.other_value,0))),
      'taxes', item_taxes);
  END LOOP;

  RETURN jsonb_build_object(
    'engineVersion','F3.4',
    'preview', true,
    'persisted', false,
    'items', out_items);
END $function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_tax_preview_v1(uuid,jsonb) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_xml_prepare_v1(p_invoice_id uuid, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  inv  public.fiscal_invoices%ROWTYPE;
  emit public.company_fiscal_settings%ROWTYPE;
  dest public.customer_fiscal_profiles%ROWTYPE;
  resv public.fiscal_number_reservations%ROWTYPE;
  srs  public.fiscal_document_series%ROWTYPE;
  existing public.fiscal_xml_runs%ROWTYPE;
  v_items jsonb;
  v_payload jsonb;
  v_hash text;
  v_schema text;
  v_version int;
  v_prev uuid;
  v_run public.fiscal_xml_runs%ROWTYPE;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF NOT public.fn_fiscal_can_operate(auth.uid()) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para gerar XML fiscal.';
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key,'')),'') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_KEY_REQUIRED: informe uma chave de idempotencia.';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: documento nao informado.';
  END IF;

  -- Gate de ambiente fail-closed ANTES de qualquer leitura/efeito (F3.1-R2).
  PERFORM public.fn_fiscal_assert_environment_homologation();

  IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_xml_runs
              WHERE idempotency_key = p_idempotency_key
                AND fiscal_invoice_id <> p_invoice_id) THEN
    RAISE EXCEPTION 'FISCAL_IDEMPOTENCY_SCOPE_MISMATCH: chave de idempotencia ja utilizada por outro documento fiscal.';
  END IF;

  SELECT * INTO inv FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_INVOICE_NOT_FOUND: %', p_invoice_id; END IF;

  IF inv.document_model <> 'NFE' THEN
    RAISE EXCEPTION 'FISCAL_MODEL_UNSUPPORTED: fase F4 cobre apenas NF-e modelo 55.';
  END IF;
  IF coalesce(inv.tp_emis,1) <> 1 THEN
    RAISE EXCEPTION 'FISCAL_TPEMIS_UNSUPPORTED: apenas emissao normal (tpEmis=1) esta habilitada nesta fase.';
  END IF;
  IF inv.tax_snapshot IS NULL OR NOT (inv.tax_snapshot ? 'engineVersion') THEN
    RAISE EXCEPTION 'FISCAL_CALCULATION_REQUIRED: calcule os tributos antes de gerar o XML.';
  END IF;

  SELECT * INTO resv FROM (SELECT * FROM public.fiscal_number_reservations WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_number_reservations
   WHERE fiscal_invoice_id = p_invoice_id AND status = 'RESERVED'
   ORDER BY reserved_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_NUMBER_RESERVATION_REQUIRED: reserve a numeracao antes de gerar o XML.';
  END IF;
  SELECT * INTO srs FROM (SELECT * FROM public.fiscal_document_series WHERE public.h15_company_access(company_id)) fiscal_document_series WHERE id = resv.series_id;

  IF NOT ((public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id, p_invoice_id))->>'eligible')::boolean THEN
    RAISE EXCEPTION 'FISCAL_NOT_ELIGIBLE: %',
      (public.fn_fiscal_invoice_eligibility(inv.source_type, inv.source_id, p_invoice_id))->>'reasons';
  END IF;

  PERFORM public.fn_fiscal_assert_debtor_recipient(p_invoice_id);

  SELECT * INTO emit FROM (SELECT * FROM public.company_fiscal_settings WHERE id = (SELECT company_settings_id FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE id=p_invoice_id) AND public.h15_company_access(id)) company_fiscal_settings WHERE is_active ORDER BY updated_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EMITTER_NOT_CONFIGURED: emitente nao cadastrado.'; END IF;
  IF coalesce(emit.nfe_environment_code,'2') <> '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_BLOCKED: apenas homologacao (tpAmb=2) e permitida na fase F4.';
  END IF;
  IF emit.nfe_readiness_status <> 'READY_HOMOLOGATION' THEN
    RAISE EXCEPTION 'FISCAL_EMITTER_NOT_READY: emitente com pendencias %', emit.nfe_readiness_pendencies;
  END IF;

  SELECT * INTO dest FROM public.customer_fiscal_profiles WHERE customer_id = inv.customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_RECIPIENT_PROFILE_MISSING: perfil fiscal do destinatario nao cadastrado.'; END IF;
  IF dest.nfe_readiness_status <> 'READY' THEN
    RAISE EXCEPTION 'FISCAL_RECIPIENT_NOT_READY: destinatario com pendencias %', dest.nfe_readiness_pendencies;
  END IF;

  SELECT schema_version INTO v_schema
    FROM public.fiscal_xsd_registry
   WHERE schema_name = 'nfe_v4.00' AND is_active
   ORDER BY published_at DESC LIMIT 1;
  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'FISCAL_XSD_NOT_REGISTERED: esquema NF-e 4.00 ausente no registro oficial.';
  END IF;

  SELECT jsonb_agg(
           jsonb_build_object(
             'nItem', i.item_sequence,
             'cProd', coalesce(nullif(btrim(coalesce(i.source_item_id::text,'')),''), 'ITEM' || i.item_sequence::text),
             'xProd', i.description,
             'NCM', i.ncm_snapshot,
             'CEST', i.cest_snapshot,
             'CFOP', i.cfop_snapshot,
             'uCom', i.commercial_unit,
             'qCom', i.quantity,
             'vUnCom', i.unit_value,
             'vProd', coalesce(i.gross_value, i.quantity * i.unit_value),
             'vDesc', coalesce(i.discount_value,0),
             'vFrete', coalesce(i.freight_value,0),
             'vSeg', coalesce(i.insurance_value,0),
             'vOutro', coalesce(i.other_value,0),
             'orig', coalesce(i.origem_snapshot,'0'),
             'CST', i.cst_icms_snapshot,
             'CSOSN', i.csosn_snapshot,
             'taxSnapshot', i.tax_snapshot)
           ORDER BY i.item_sequence)
    INTO v_items
    FROM (SELECT * FROM public.fiscal_invoice_items WHERE public.h15_invoice_access(fiscal_invoice_id)) i
   WHERE i.fiscal_invoice_id = p_invoice_id;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'FISCAL_INVOICE_NO_ITEMS: documento sem itens.';
  END IF;

  v_payload := jsonb_build_object(
    'engineVersion','F4.1',
    'schemaVersion', v_schema,
    'tpAmb', emit.nfe_environment_code,
    'accessKey', resv.access_key,
    'ide', jsonb_build_object(
      'cUF', left(resv.access_key,2),
      'cNF', resv.cnf,
      'natOp', coalesce(inv.nature_operation, 'VENDA'),
      'mod', '55',
      'serie', coalesce(srs.series, emit.nfe_series_number),
      'nNF', resv.number,
      'dhEmi', to_char(coalesce(inv.issue_date, current_date), 'YYYY-MM-DD'),
      'tpNF', CASE WHEN coalesce(inv.direction,'OUT') = 'OUT' THEN '1' ELSE '0' END,
      'idDest', CASE
                  WHEN upper(coalesce(dest.fiscal_state,'')) = upper(coalesce(emit.state,'')) THEN '1'
                  ELSE '2' END,
      'cMunFG', emit.municipality_ibge_code,
      'tpImp','1', 'tpEmis','1',
      'cDV', resv.check_digit::text,
      'finNFe', coalesce(inv.fin_nfe,'1'),
      'indFinal', CASE WHEN coalesce(dest.final_consumer,true) THEN '1' ELSE '0' END,
      'indPres','9', 'procEmi','0', 'verProc','ARBIO-F4.1'),
    'emit', jsonb_build_object(
      'CNPJ', public.fn_fiscal_digits(emit.cnpj),
      'xNome', emit.legal_name,
      'xFant', emit.trade_name,
      'IE', public.fn_fiscal_digits(coalesce(emit.state_registration,'')),
      'CRT', emit.crt,
      'CNAE', emit.primary_cnae,
      'enderEmit', jsonb_build_object(
        'xLgr', emit.street, 'nro', emit.number, 'xCpl', emit.complement,
        'xBairro', emit.neighborhood, 'cMun', emit.municipality_ibge_code,
        'xMun', emit.city, 'UF', emit.state,
        'CEP', public.fn_fiscal_digits(coalesce(emit.postal_code,'')),
        'cPais','1058','xPais','BRASIL')),
    'dest', jsonb_build_object(
      'personType', dest.person_type,
      'doc', public.fn_fiscal_digits(coalesce(dest.cpf_cnpj,'')),
      'xNome', dest.legal_name,
      'indIEDest', dest.taxpayer_indicator,
      'IE', public.fn_fiscal_digits(coalesce(dest.state_registration,'')),
      'enderDest', jsonb_build_object(
        'xLgr', dest.fiscal_street, 'nro', dest.fiscal_number, 'xCpl', dest.fiscal_complement,
        'xBairro', dest.fiscal_neighborhood, 'cMun', dest.fiscal_municipality_ibge_code,
        'xMun', dest.fiscal_city, 'UF', dest.fiscal_state,
        'CEP', public.fn_fiscal_digits(coalesce(dest.fiscal_postal_code,'')),
        'cPais','1058','xPais','BRASIL')),
    'det', v_items,
    'total', inv.fiscal_totals_snapshot,
    'infAdic', jsonb_build_object(
      'infCpl', 'AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'));

  IF public.fiscal_json_has_sensitive_key(v_payload) THEN
    RAISE EXCEPTION 'FISCAL_PAYLOAD_SENSITIVE: payload de XML contem chave sensivel.';
  END IF;

  v_hash := encode(extensions.digest(v_payload::text, 'sha256'), 'hex');

  SELECT * INTO existing FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_xml_runs
   WHERE fiscal_invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.payload_sha256 <> v_hash THEN
      RAISE EXCEPTION 'FISCAL_XML_FINGERPRINT_MISMATCH: documento mudou apos o preparo; use nova chave de idempotencia.';
    END IF;
    RETURN jsonb_build_object(
      'runId', existing.id, 'state', existing.state, 'runVersion', existing.run_version,
      'schemaVersion', existing.schema_version, 'accessKey', existing.access_key,
      'payloadSha256', existing.payload_sha256, 'payload', existing.payload,
      'idempotentReplay', true);
  END IF;

  SELECT id, run_version INTO v_prev, v_version
    FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_xml_runs
   WHERE fiscal_invoice_id = p_invoice_id
   ORDER BY run_version DESC LIMIT 1;

  IF v_prev IS NOT NULL AND EXISTS (
      SELECT 1 FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) fiscal_xml_runs
       WHERE fiscal_invoice_id = p_invoice_id AND state NOT IN ('SIGNED','FAILED')) THEN
    RAISE EXCEPTION 'FISCAL_XML_RUN_IN_PROGRESS: existe execucao em andamento para este documento.';
  END IF;

  INSERT INTO public.fiscal_xml_runs (
    fiscal_invoice_id, reservation_id, idempotency_key, run_version, previous_run_id,
    schema_version, environment_code, access_key, payload, payload_sha256, created_by)
  VALUES (
    p_invoice_id, resv.id, p_idempotency_key, coalesce(v_version,0) + 1, v_prev,
    v_schema, emit.nfe_environment_code, resv.access_key, v_payload, v_hash, auth.uid())
  RETURNING * INTO v_run;

  INSERT INTO public.fiscal_audit_log (table_name, record_id, action, changed_by, new_values)
  VALUES ('fiscal_xml_runs', v_run.id, 'XML_PREPARED', auth.uid(),
          jsonb_build_object('invoiceId', p_invoice_id, 'runVersion', v_run.run_version,
                             'payloadSha256', v_hash, 'schemaVersion', v_schema));

  RETURN jsonb_build_object(
    'runId', v_run.id, 'state', v_run.state, 'runVersion', v_run.run_version,
    'schemaVersion', v_run.schema_version, 'accessKey', v_run.access_key,
    'payloadSha256', v_run.payload_sha256, 'payload', v_run.payload,
    'idempotentReplay', false);
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_xml_prepare_v1(uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_fiscal_xml_record_v1(uuid,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.rpc_fiscal_xml_status_v1(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_runs jsonb;
BEGIN
  PERFORM public.h15_require_staff();
  PERFORM public.h15_require_invoice(p_invoice_id);

  IF NOT public.fn_fiscal_can_read_internal(auth.uid()) THEN
    RAISE EXCEPTION 'FISCAL_FORBIDDEN: perfil sem permissao para consultar execucoes de XML.';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'runId', r.id, 'runVersion', r.run_version, 'state', r.state,
           'engineVersion', r.engine_version, 'schemaVersion', r.schema_version,
           'accessKey', r.access_key, 'environmentCode', r.environment_code,
           'payloadSha256', r.payload_sha256,
           'unsignedSha256', r.unsigned_sha256, 'unsignedBytes', r.unsigned_bytes,
           'signedSha256', r.signed_sha256, 'signedBytes', r.signed_bytes,
           'hasUnsigned', r.unsigned_path IS NOT NULL,
           'hasSigned', r.signed_path IS NOT NULL,
           'validation', r.validation, 'signature', r.signature_metadata,
           'errorCode', r.error_code,
           'preparedAt', r.prepared_at, 'generatedAt', r.generated_at,
           'validatedAt', r.validated_at, 'signedAt', r.signed_at, 'failedAt', r.failed_at)
           ORDER BY r.run_version DESC), '[]'::jsonb)
    INTO v_runs
    FROM (SELECT * FROM public.fiscal_xml_runs WHERE public.h15_invoice_access(fiscal_invoice_id)) r
   WHERE r.fiscal_invoice_id = p_invoice_id;

  RETURN jsonb_build_object('invoiceId', p_invoice_id, 'ceiling','SIGNED', 'runs', v_runs);
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_fiscal_xml_status_v1(uuid) FROM PUBLIC,anon;
CREATE OR REPLACE FUNCTION public.rpc_upsert_fiscal_invoice_manual(p_receivable_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ar  record;
  v_existing record;
  v_id uuid;
  v_status text;
  v_number text;
  v_series text;
  v_key text;
  v_issue date;
  v_type text;
  v_total numeric(14,2);
  v_delivery uuid;
  v_old jsonb;
  v_action text;
BEGIN
  PERFORM public.h15_require_staff();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT is_financial_staff(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão para alterar dados fiscais.' USING ERRCODE='insufficient_privilege';
  END IF;

  SELECT * INTO v_ar FROM accounts_receivable WHERE id = p_receivable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta a receber não encontrada.'; END IF;

  v_status   := COALESCE(NULLIF(p_payload->>'status',''), 'PENDING');
  v_number   := NULLIF(p_payload->>'invoice_number','');
  v_series   := NULLIF(p_payload->>'series','');
  v_key      := NULLIF(btrim(coalesce(p_payload->>'access_key','')),'');
  v_issue    := NULLIF(p_payload->>'issue_date','')::date;
  v_type     := COALESCE(NULLIF(p_payload->>'invoice_type',''), 'NFE');
  v_total    := COALESCE((p_payload->>'total_amount')::numeric, v_ar.total_amount);
  v_delivery := NULLIF(p_payload->>'delivery_id','')::uuid;

  IF v_status NOT IN ('PENDING','ISSUED','CANCELED','ERROR') THEN
    RAISE EXCEPTION 'Status fiscal inválido: %', v_status USING ERRCODE='check_violation';
  END IF;

  -- H7B-005: nenhum registro manual assume "emitido" sem evidencia externa.
  IF v_status = 'ISSUED' THEN
    IF v_key IS NULL OR v_key !~ '^[0-9]{44}$' THEN
      RAISE EXCEPTION
        'FISCAL_MANUAL_EVIDENCE_REQUIRED: registro manual como emitido exige chave de acesso de 44 digitos do documento externo.'
        USING ERRCODE='check_violation';
    END IF;
    IF v_number IS NULL THEN
      RAISE EXCEPTION
        'FISCAL_MANUAL_EVIDENCE_REQUIRED: registro manual como emitido exige o numero do documento externo.'
        USING ERRCODE='check_violation';
    END IF;
  END IF;

  SELECT * INTO v_existing FROM (SELECT * FROM public.fiscal_invoices WHERE public.h15_company_access(company_settings_id)) fiscal_invoices WHERE receivable_id = p_receivable_id
   FOR UPDATE;

  IF FOUND THEN
    IF public.fn_fiscal_status_is_terminal(v_existing.normalized_status) THEN
      RAISE EXCEPTION
        'FISCAL_DOCUMENT_LOCKED: documento fiscal % esta em % e nao aceita registro manual.',
        v_existing.id, v_existing.normalized_status
        USING ERRCODE='insufficient_privilege';
    END IF;
    IF EXISTS (SELECT 1 FROM (SELECT * FROM public.fiscal_number_reservations WHERE public.h15_invoice_access(fiscal_invoice_id)) r
                WHERE r.fiscal_invoice_id = v_existing.id) THEN
      RAISE EXCEPTION
        'FISCAL_DOCUMENT_ENGINE_MANAGED: documento % pertence ao motor NF-e; use o fluxo de emissao.',
        v_existing.id
        USING ERRCODE='insufficient_privilege';
    END IF;

    v_old := to_jsonb(v_existing);
    UPDATE fiscal_invoices SET
      status = v_status,
      invoice_number = v_number,
      series = v_series,
      access_key = v_key,
      issue_date = v_issue,
      invoice_type = v_type,
      total_amount = v_total,
      delivery_id = COALESCE(v_delivery, v_existing.delivery_id),
      document_origin = 'MANUAL_RECORD',
      provider = COALESCE(v_existing.provider, 'NONE')
    WHERE id = v_existing.id
    RETURNING id INTO v_id;
    v_action := 'FISCAL_INVOICE_UPDATED';
  ELSE
    INSERT INTO fiscal_invoices(company_settings_id, 
      receivable_id, delivery_id, invoice_type, invoice_number, series, access_key,
      issue_date, total_amount, status, created_by, document_origin, provider
    ) VALUES (public.h15_active_company(), 
      p_receivable_id, v_delivery, v_type, v_number, v_series, v_key,
      v_issue, v_total, v_status, v_uid, 'MANUAL_RECORD', 'NONE'
    ) RETURNING id INTO v_id;
    v_action := 'FISCAL_INVOICE_CREATED';
  END IF;

  UPDATE accounts_receivable SET
    fiscal_invoice_status = CASE
      WHEN v_status = 'ISSUED' THEN 'ISSUED'
      WHEN v_status = 'CANCELED' THEN 'CANCELED'
      WHEN v_status = 'PENDING' THEN 'PENDING'
      ELSE accounts_receivable.fiscal_invoice_status
    END,
    fiscal_invoice_number = COALESCE(v_number, fiscal_invoice_number),
    fiscal_access_key     = COALESCE(v_key, fiscal_access_key),
    fiscal_issue_date     = COALESCE(v_issue, fiscal_issue_date)
  WHERE id = p_receivable_id;

  INSERT INTO financial_audit_log (entity_type, entity_id, action, old_data, new_data, performed_by)
  VALUES ('fiscal_invoices', v_id, v_action, v_old,
          jsonb_build_object('status', v_status, 'invoice_number', v_number,
                             'delivery_id', v_delivery,
                             'document_origin', 'MANUAL_RECORD'),
          v_uid);

  RETURN jsonb_build_object('invoice_id', v_id, 'status', v_status,
                            'document_origin', 'MANUAL_RECORD');
END;
$function$
;
REVOKE EXECUTE ON FUNCTION public.rpc_upsert_fiscal_invoice_manual(uuid,jsonb) FROM PUBLIC,anon;
