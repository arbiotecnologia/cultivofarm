-- Local role grants reproduce the captured ACL order and values exactly.
DO $do$ DECLARE r record; BEGIN
 FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);
 END LOOP;
END $do$;
GRANT EXECUTE ON FUNCTION public.h15_actor_organization(),public.has_role(uuid,public.app_role),public.storage1_path_strict(text),public.financial_storage_object_permitted(text,text),platform_private.h15_actor_organization(),platform_private.platform_actor_access_ready(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_authz_uid_scope_ok(uuid),public.is_financial_staff(uuid),public.rpc_financial_document_soft_delete(uuid,text),platform_private.has_role(uuid,public.app_role) TO service_role,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_tenant_organization_id(),public.fn_audit_financial_documents(),public.fn_financial_audit() TO service_role;
CREATE FUNCTION public.get_cliente_ids_for_user(uuid) RETURNS uuid[] LANGUAGE sql AS $$SELECT ARRAY[]::uuid[]$$;
-- Producer membership is a declared stub: this task tests financial staff, not producer eligibility.
ALTER TABLE public.accounts_receivable ADD COLUMN customer_id uuid;
CREATE POLICY "Staff can view non-deleted documents" ON public.financial_documents FOR SELECT TO authenticated USING ((deleted_at IS NULL) AND (is_financial_staff((SELECT auth.uid())) OR platform_private.has_role((SELECT auth.uid()), 'administrativo'::app_role)));
CREATE POLICY fd_no_hard_delete ON public.financial_documents FOR DELETE TO authenticated USING (false);
CREATE POLICY fd_producer_read_own_ar ON public.financial_documents FOR SELECT TO authenticated USING ((deleted_at IS NULL) AND (owner_type = 'RECEIVABLE'::text) AND platform_private.has_role((SELECT auth.uid()), 'cliente_produtor'::app_role) AND EXISTS(SELECT 1 FROM accounts_receivable ar WHERE ar.id=financial_documents.owner_id AND ar.customer_id=ANY(get_cliente_ids_for_user((SELECT auth.uid())))));
CREATE POLICY fd_staff_insert ON public.financial_documents FOR INSERT TO authenticated WITH CHECK (is_financial_staff((SELECT auth.uid())));
CREATE POLICY fd_staff_update ON public.financial_documents FOR UPDATE TO authenticated USING (is_financial_staff((SELECT auth.uid()))) WITH CHECK (is_financial_staff((SELECT auth.uid())));
CREATE POLICY tenant_isolation_d51_5 ON public.financial_documents AS RESTRICTIVE FOR ALL TO authenticated USING ((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization())) WITH CHECK ((organization_id IS NOT NULL) AND (organization_id = platform_private.h15_actor_organization()));
CREATE TRIGGER tenant_organization_guard BEFORE INSERT OR UPDATE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_organization_id();
CREATE TRIGGER trg_audit_findocs AFTER INSERT OR DELETE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.fn_audit_financial_documents();
CREATE TRIGGER trg_fd_audit AFTER INSERT OR DELETE OR UPDATE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();
-- Reduced parent policies (tenant-bound RLS), NOT captured full production parent RLS.
DO $do$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['accounts_receivable','accounts_payable','entregas','fiscal_invoices','receivable_payments','payable_payments','financial_receipts','financial_report_exports','fiscal_events'] LOOP
 EXECUTE format('CREATE POLICY local_tenant ON public.%I FOR ALL TO authenticated USING(organization_id=public.h15_actor_organization()) WITH CHECK(organization_id=public.h15_actor_organization())',t);
 END LOOP;
END $do$;