-- Canonical swzpzcwiasxmjutrmvkm. Additional containment; never reapply 20261008022948.
CREATE OR REPLACE FUNCTION platform_private.stock_p1_movement_owned(p_stock uuid,p_lote uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.estoque_produto e WHERE e.id=p_stock AND e.lote_id=p_lote AND platform_private.stock_p1_lote_owned(e.lote_id)); $$;
REVOKE ALL ON FUNCTION platform_private.stock_p1_movement_owned(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION platform_private.stock_p1_movement_owned(uuid,uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.stock_p1_movement_owned(p_stock uuid,p_lote uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT platform_private.stock_p1_movement_owned(p_stock,p_lote); $$;
REVOKE ALL ON FUNCTION public.stock_p1_movement_owned(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stock_p1_movement_owned(uuid,uuid) TO authenticated,service_role;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.estoque_movimentacoes'::regclass AND polname='stock_p1_mov_tenant_isolation') THEN
CREATE POLICY stock_p1_mov_tenant_isolation ON public.estoque_movimentacoes AS RESTRICTIVE FOR ALL TO authenticated USING(public.stock_p1_movement_owned(estoque_produto_id,lote_id)) WITH CHECK(public.stock_p1_movement_owned(estoque_produto_id,lote_id));
END IF; END $$;
CREATE OR REPLACE FUNCTION platform_private.stock_p1_movement_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$ DECLARE v_org uuid:=public.h15_actor_organization(); v_lote uuid; v_ref uuid;
BEGIN
IF auth.uid() IS NULL OR v_org IS NULL THEN RAISE EXCEPTION 'ESTQ_MOV_TENANT_FORBIDDEN' USING ERRCODE='42501'; END IF;
SELECT e.lote_id INTO v_lote FROM public.estoque_produto e WHERE e.id=NEW.estoque_produto_id;
IF v_lote IS NULL OR NOT platform_private.stock_p1_lote_owned(v_lote) THEN RAISE EXCEPTION 'ESTQ_MOV_TENANT_FORBIDDEN' USING ERRCODE='42501'; END IF;
-- Only a new ledger row may inherit its verified stock's lote, never organization or legacy backfill.
IF NEW.lote_id IS NULL THEN NEW.lote_id:=v_lote; END IF;
IF NEW.lote_id IS DISTINCT FROM v_lote THEN RAISE EXCEPTION 'ESTQ_MOV_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
IF NEW.cliente_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=NEW.cliente_id AND c.organization_id=v_org) THEN RAISE EXCEPTION 'ESTQ_MOV_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
IF NEW.os_id IS NOT NULL THEN
 IF NEW.os_tipo IN ('manual','b2b') THEN SELECT o.organization_id INTO v_ref FROM public.ordens_servico o WHERE o.id=NEW.os_id;
 ELSIF NEW.os_tipo IN ('onfarm','on_farm') THEN SELECT c.organization_id INTO v_ref FROM public.ordens_servico_onfarm o JOIN public.clientes c ON c.id=o.cliente_id WHERE o.id=NEW.os_id;
 ELSE RAISE EXCEPTION 'ESTQ_MOV_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF v_ref IS DISTINCT FROM v_org THEN RAISE EXCEPTION 'ESTQ_MOV_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
END IF;
IF NEW.movimentacao_origem_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.estoque_movimentacoes m WHERE m.id=NEW.movimentacao_origem_id AND m.estoque_produto_id=NEW.estoque_produto_id AND m.lote_id=NEW.lote_id) THEN RAISE EXCEPTION 'ESTQ_MOV_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
IF NEW.referencia_id IS NOT NULL THEN
 IF NEW.referencia_tipo='entrega' THEN
  IF NOT EXISTS(SELECT 1 FROM public.entregas e WHERE e.id=NEW.referencia_id AND e.organization_id=v_org AND (e.lote_id IS NULL OR e.lote_id=NEW.lote_id) AND (NEW.cliente_id IS NULL OR e.cliente_id=NEW.cliente_id)) THEN RAISE EXCEPTION 'ESTQ_MOV_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF NEW.referencia_tipo IN ('estoque','estoque_produto') THEN
  IF NEW.referencia_id IS DISTINCT FROM NEW.estoque_produto_id THEN RAISE EXCEPTION 'ESTQ_MOV_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF NEW.referencia_tipo IN ('os','ordem_servico') THEN
  IF NEW.os_id IS NULL OR NEW.referencia_id IS DISTINCT FROM NEW.os_id THEN RAISE EXCEPTION 'ESTQ_MOV_REFERENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'ESTQ_MOV_REFERENCE_UNSUPPORTED' USING ERRCODE='42501'; END IF;
END IF;
RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.stock_p1_movement_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_private.stock_p1_movement_guard() TO service_role;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.estoque_movimentacoes'::regclass AND tgname='a00_stock_p1_movement_guard') THEN CREATE TRIGGER a00_stock_p1_movement_guard BEFORE INSERT ON public.estoque_movimentacoes FOR EACH ROW EXECUTE FUNCTION platform_private.stock_p1_movement_guard(); END IF; END $$;
COMMENT ON POLICY stock_p1_mov_tenant_isolation ON public.estoque_movimentacoes IS 'P1 residual ledger containment: explicit owned stock/lote pair; no legacy backfill. Invoker BI views inherit this restriction.';
-- Existing append-only UPDATE/DELETE guard preserved; no data mutation or client RPC regrant.
