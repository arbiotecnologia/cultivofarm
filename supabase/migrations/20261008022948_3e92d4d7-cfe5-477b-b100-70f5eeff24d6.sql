-- Canonical destination independently verified: swzpzcwiasxmjutrmvkm.
-- Focal containment; no data changes, no ownership inference, no backfill.
CREATE OR REPLACE FUNCTION platform_private.stock_p1_lote_owned(p_lote uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.lotes l
   WHERE l.id = p_lote AND l.organization_id IS NOT NULL
     AND l.organization_id = public.h15_actor_organization()
 );
$$;
REVOKE ALL ON FUNCTION platform_private.stock_p1_lote_owned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.stock_p1_lote_owned(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.stock_p1_lote_owned(p_lote uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT platform_private.stock_p1_lote_owned(p_lote); $$;
REVOKE ALL ON FUNCTION public.stock_p1_lote_owned(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_p1_lote_owned(uuid) TO authenticated, service_role;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.estoque_produto'::regclass AND polname='stock_p1_tenant_isolation') THEN
  CREATE POLICY stock_p1_tenant_isolation ON public.estoque_produto AS RESTRICTIVE FOR ALL TO authenticated
   USING (public.stock_p1_lote_owned(lote_id))
   WITH CHECK (public.stock_p1_lote_owned(lote_id));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION platform_private.stock_p1_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_org uuid := public.h15_actor_organization();
 v_ref uuid;
 v_lote public.lotes%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR v_org IS NULL THEN
  RAISE EXCEPTION 'ESTQ_TENANT_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF TG_OP IN ('UPDATE','DELETE') AND NOT platform_private.stock_p1_lote_owned(OLD.lote_id) THEN
  RAISE EXCEPTION 'ESTQ_TENANT_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 IF NOT platform_private.stock_p1_lote_owned(NEW.lote_id) THEN
  RAISE EXCEPTION 'ESTQ_TENANT_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_lote FROM public.lotes WHERE id=NEW.lote_id;
 -- Explicit lote ownership is required; parent references never assign ownership.
 IF v_lote.programacao_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.programacao_producao p
   WHERE p.id=v_lote.programacao_id AND p.organization_id=v_org
 ) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NEW.envase_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.envase e WHERE e.id=NEW.envase_id
   AND e.lote_id=NEW.lote_id AND e.organization_id=v_org
 ) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NEW.reservado_para_cliente_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.clientes c WHERE c.id=NEW.reservado_para_cliente_id AND c.organization_id=v_org
 ) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NEW.reservado_para_partner_id IS NOT NULL AND NOT coalesce(public.b2b_phase1_partner_visible(NEW.reservado_para_partner_id,false),false) THEN
  RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF NEW.reservado_para_partner_order_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.partner_orders o WHERE o.id=NEW.reservado_para_partner_order_id
    AND o.partner_id=NEW.reservado_para_partner_id
    AND public.b2b_phase1_order_visible(o.id)
 ) THEN RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NEW.reservado_para_os_id IS NOT NULL THEN
  IF NEW.reservado_para_os_tipo IN ('onfarm','on_farm') THEN
   SELECT c.organization_id INTO v_ref FROM public.ordens_servico_onfarm o
    JOIN public.clientes c ON c.id=o.cliente_id WHERE o.id=NEW.reservado_para_os_id;
  ELSIF NEW.reservado_para_os_tipo IN ('manual','b2b') THEN
   SELECT o.organization_id INTO v_ref FROM public.ordens_servico o WHERE o.id=NEW.reservado_para_os_id;
  ELSE
   RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF v_ref IS DISTINCT FROM v_org THEN
   RAISE EXCEPTION 'ESTQ_REFERENCE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION platform_private.stock_p1_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform_private.stock_p1_guard() TO service_role;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.estoque_produto'::regclass AND tgname='a00_stock_p1_tenant_guard') THEN
  CREATE TRIGGER a00_stock_p1_tenant_guard BEFORE INSERT OR UPDATE OR DELETE ON public.estoque_produto
   FOR EACH ROW EXECUTE FUNCTION platform_private.stock_p1_guard();
 END IF;
END $$;

-- Contain client-callable DEFINER graph, including indirect replay/snapshot callers.
-- Preserve service ACL and business bodies. No automatic rollback granting access.
DO $contain$
DECLARE f record; v_definition text;
BEGIN
 FOR f IN
  WITH RECURSIVE funcs AS (
   SELECT p.oid,p.proname,p.prosrc,p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  ), affected AS (
   SELECT * FROM funcs WHERE prosrc ILIKE '%estoque_produto%'
   UNION
   SELECT candidate.* FROM funcs candidate JOIN affected a ON candidate.prosrc ~ ('\m' || a.proname || '\s*\(')
  )
  SELECT oid,oid::regprocedure::text AS signature FROM affected WHERE prosecdef
 LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
 END LOOP;
END $contain$;
COMMENT ON POLICY stock_p1_tenant_isolation ON public.estoque_produto IS 'P1 stock tenant containment: explicit lote organization required; preserve orphan records, no inferred ownership.';
COMMENT ON FUNCTION platform_private.stock_p1_guard() IS 'P1 defense in depth for privileged stock writes. Requires active actor organization and same-tenant references; service ACL is not actor authorization.';