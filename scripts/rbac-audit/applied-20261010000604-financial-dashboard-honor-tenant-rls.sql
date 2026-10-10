-- P1: dashboard RPCs must honor authenticated RLS rather than bypassing tenant fences.
ALTER FUNCTION public.get_financial_dashboard_summary(date,date,uuid,uuid,uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_top_financial_rankings(date,date,integer) SECURITY INVOKER;
ALTER FUNCTION public.get_financial_alerts(date) SECURITY INVOKER;
ALTER FUNCTION public.fn_mark_financial_overdue() SECURITY INVOKER;

-- Empty recurring tables lacked any organization ownership. No historical ownership is inferred.
ALTER TABLE public.recurring_financial_templates ADD COLUMN organization_id uuid DEFAULT platform_private.h15_actor_organization();
CREATE INDEX recurring_financial_templates_organization_idx ON public.recurring_financial_templates(organization_id);
CREATE POLICY recurring_template_tenant_scope ON public.recurring_financial_templates AS RESTRICTIVE FOR ALL TO authenticated
 USING (organization_id IS NOT NULL AND organization_id = platform_private.h15_actor_organization())
 WITH CHECK (organization_id IS NOT NULL AND organization_id = platform_private.h15_actor_organization());
CREATE POLICY recurring_log_parent_scope ON public.recurring_generation_log AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS (SELECT 1 FROM public.recurring_financial_templates t WHERE t.id = template_id AND t.organization_id = platform_private.h15_actor_organization()))
 WITH CHECK (EXISTS (SELECT 1 FROM public.recurring_financial_templates t WHERE t.id = template_id AND t.organization_id = platform_private.h15_actor_organization()));