-- Canônico previamente confirmado: swzpzcwiasxmjutrmvkm.
-- Contenção focal Fase 1; sem atualização de registros de negócio.
CREATE OR REPLACE FUNCTION public.b2b_phase1_partner_visible(p_partner uuid, p_technical boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE s record; u uuid := auth.uid();
BEGIN
 IF u IS NULL OR p_partner IS NULL THEN RETURN false; END IF;
 IF public.is_platform_superadmin(u) THEN RETURN true; END IF;
 SELECT * INTO s FROM platform_private.b2b_actor_scope(u);
 IF NOT s.profile_ok OR NOT s.partner_valid OR s.org_partner IS DISTINCT FROM p_partner THEN RETURN false; END IF;
 IF public.has_role(u,'parceiro_b2b_tecnico') THEN
  RETURN p_technical AND s.user_partner_count=1 AND s.user_partner=p_partner;
 END IF;
 IF public.has_role(u,'parceiro_b2b') THEN
  RETURN s.user_partner_count=1 AND s.user_partner=p_partner;
 END IF;
 RETURN true; -- existing permissive policies/RPC role guards still select allowed roles
END $f$;
REVOKE ALL ON FUNCTION public.b2b_phase1_partner_visible(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.b2b_phase1_partner_visible(uuid,boolean) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.b2b_phase1_order_visible(p_order uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
 SELECT EXISTS(SELECT 1 FROM public.partner_orders o WHERE o.id=p_order AND public.b2b_phase1_partner_visible(o.partner_id,false));
$f$;
REVOKE ALL ON FUNCTION public.b2b_phase1_order_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.b2b_phase1_order_visible(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.b2b_phase1_simulation_visible(p_sim uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $f$
 SELECT EXISTS(SELECT 1 FROM public.partner_simulations s WHERE s.id=p_sim AND public.b2b_phase1_partner_visible(s.partner_id,true) AND (NOT public.has_role(auth.uid(),'parceiro_b2b_tecnico') OR s.created_by=auth.uid()));
$f$;
REVOKE ALL ON FUNCTION public.b2b_phase1_simulation_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.b2b_phase1_simulation_visible(uuid) TO authenticated, service_role;
DO $policies$
DECLARE t text; predicate text;
BEGIN
 FOR t,predicate IN SELECT * FROM (VALUES
 ('partner_orders','public.b2b_phase1_partner_visible(partner_id,false)'),
 ('partner_order_items','public.b2b_phase1_order_visible(order_id)'),
 ('partner_order_payment_terms','public.b2b_phase1_order_visible(partner_order_id)'),
 ('partner_order_payment_schedule','public.b2b_phase1_order_visible(partner_order_id)'),
 ('partner_order_financial_links','public.b2b_phase1_order_visible(partner_order_id) AND public.b2b_phase1_partner_visible(partner_id,false)'),
 ('partner_order_idempotency','public.b2b_phase1_partner_visible(partner_id,false)'),
 ('partner_simulations','public.b2b_phase1_partner_visible(partner_id,true) AND (NOT public.has_role(auth.uid(),''parceiro_b2b_tecnico'') OR created_by=auth.uid())'),
 ('partner_simulation_items','public.b2b_phase1_simulation_visible(simulation_id)')
 ) v(t,predicate)
 LOOP
  EXECUTE format('DROP POLICY IF EXISTS b2b_phase1_tenant_guard ON public.%I',t);
  EXECUTE format('CREATE POLICY b2b_phase1_tenant_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',t,predicate,predicate);
 END LOOP;
END $policies$;
-- Keep original signatures, role guards, pricing/snapshots, locks and idempotency.
-- Insert tenant checks at function entry, before any privileged read/write.
DO $guards$
DECLARE r record; d text; guard text; arg text;
BEGIN
 FOR r IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('approve_partner_order','reject_partner_order','approve_b2b_credit','approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure','add_b2b_payment_terms_note_secure','respond_b2b_order_quote_secure','generate_b2b_receivable_secure','send_partner_simulation_to_manager_secure','archive_partner_simulation_secure')
 LOOP
  d:=pg_get_functiondef(r.oid);
  IF position('b2b_phase1_scope_denied' IN d)>0 THEN CONTINUE; END IF;
  IF r.proname IN ('send_partner_simulation_to_manager_secure','archive_partner_simulation_secure') THEN
   guard:=E'\n  IF NOT public.b2b_phase1_simulation_visible(p_simulation_id) THEN RAISE EXCEPTION ''b2b_phase1_scope_denied'' USING ERRCODE=''42501''; END IF;\n';
  ELSE
   arg:=CASE WHEN r.proname IN ('approve_partner_order','reject_partner_order') THEN 'p_order_id' ELSE 'p_partner_order_id' END;
   IF r.proname='generate_b2b_receivable_secure' THEN
    guard:=format(E'\n  IF auth.uid() IS NULL THEN\n    IF pg_trigger_depth()=0 THEN RAISE EXCEPTION ''b2b_phase1_scope_denied'' USING ERRCODE=''42501''; END IF;\n  ELSIF NOT public.b2b_phase1_order_visible(%s) THEN RAISE EXCEPTION ''b2b_phase1_scope_denied'' USING ERRCODE=''42501''; END IF;\n',arg);
   ELSE
    guard:=format(E'\n  IF NOT public.b2b_phase1_order_visible(%s) THEN RAISE EXCEPTION ''b2b_phase1_scope_denied'' USING ERRCODE=''42501''; END IF;\n',arg);
   END IF;
  END IF;
  IF position(E'BEGIN\n' IN d)=0 THEN RAISE EXCEPTION 'guard_injection_anchor_missing:%',r.proname; END IF;
  d:=overlay(d placing E'BEGIN\n'||guard from position(E'BEGIN\n' IN d) for length(E'BEGIN\n'));
  EXECUTE d;
 END LOOP;
END $guards$;
REVOKE ALL ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_b2b_receivable_secure_impl(uuid) TO service_role;
-- Reversible containment: remove only b2b_phase1_tenant_guard and restore
-- function definitions from the reviewed pre-migration inventory; doing so
-- reopens confirmed leakage and requires replacement containment first.
