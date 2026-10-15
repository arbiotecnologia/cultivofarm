-- CANDIDATO 07 — NÃO APLICAR/PUBLICAR. Fase separada e revisável.
-- Laboratório: somente produtos familia_catalogo='biologico' e microrganismos.
-- Preserva históricos/estoque/entregas; protege apenas NOVAS entradas/conversões.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='swzpzcwiasxmjutrmvkm') THEN RAISE EXCEPTION 'CANONICAL_REF_REQUIRED'; END IF;
  -- Hash live de 15/10/2026 após o hardening que inclui B2B_INTERNAL_DOWNSTREAM_UNVERIFIED.
  IF md5(pg_get_functiondef('public.generate_production_orders_from_partner(uuid)'::regprocedure)) <> 'ad584fa71bd7cc2bb00f4887e5b3706b' THEN RAISE EXCEPTION 'lab07_generate_orders_drift'; END IF;
  IF md5(pg_get_functiondef('public.rpc_programar_os_v1(uuid,text,date)'::regprocedure)) <> '3e7479b964f0927a36442770c25e8562' THEN RAISE EXCEPTION 'lab07_programar_drift'; END IF;
  IF md5(pg_get_functiondef('public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)'::regprocedure)) IS NULL THEN RAISE EXCEPTION 'lab07_lote_missing'; END IF;
  IF to_regprocedure('public.rpc_planejamento_publicar_v1(uuid,text)') IS NULL OR to_regprocedure('public.publish_planning_to_lab(uuid)') IS NULL THEN RAISE EXCEPTION 'lab07_publish_missing'; END IF;
END $$;

CREATE FUNCTION platform_private.lab_item_is_manufacturable(p_product_id uuid,p_microorganism_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE
    -- Duas referências na mesma linha são ambíguas e falham fechadas. Isso impede que
    -- um microrganismo válido transforme produto químico/fertilizante em fabricável.
    WHEN p_product_id IS NOT NULL AND p_microorganism_id IS NOT NULL THEN false
    WHEN p_product_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.produtos p WHERE p.id=p_product_id AND p.familia_catalogo='biologico')
    WHEN p_microorganism_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.microrganismos m WHERE m.id=p_microorganism_id)
    ELSE false END
$$;
REVOKE ALL ON FUNCTION platform_private.lab_item_is_manufacturable(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION platform_private.lab_assert_manufacturable(p_product_id uuid,p_microorganism_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT platform_private.lab_item_is_manufacturable(p_product_id,p_microorganism_id) THEN
    RAISE EXCEPTION 'LAB_ITEM_NOT_MANUFACTURABLE' USING ERRCODE='23514',
      HINT='Somente produtos biológicos e microrganismos podem gerar fabricação laboratorial.';
  END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.lab_assert_manufacturable(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Defesa em profundidade: só bloqueia INSERT ou mudança de referência; updates históricos irrelevantes passam.
CREATE FUNCTION platform_private.trg_lab_programming_biological_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.produto_id IS NOT DISTINCT FROM OLD.produto_id
                    AND NEW.microrganismo_id IS NOT DISTINCT FROM OLD.microrganismo_id THEN RETURN NEW; END IF;
  PERFORM platform_private.lab_assert_manufacturable(NEW.produto_id,NEW.microrganismo_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_lab_programming_biological_only() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_lab_programming_biological_only BEFORE INSERT OR UPDATE OF produto_id,microrganismo_id ON public.programacao_producao
FOR EACH ROW EXECUTE FUNCTION platform_private.trg_lab_programming_biological_only();

CREATE FUNCTION platform_private.trg_lab_lot_biological_only() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.produto_id IS NOT DISTINCT FROM OLD.produto_id
                    AND NEW.microrganismo_id IS NOT DISTINCT FROM OLD.microrganismo_id THEN RETURN NEW; END IF;
  PERFORM platform_private.lab_assert_manufacturable(NEW.produto_id,NEW.microrganismo_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.trg_lab_lot_biological_only() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trg_lab_lot_biological_only BEFORE INSERT OR UPDATE OF produto_id,microrganismo_id ON public.lotes
FOR EACH ROW EXECUTE FUNCTION platform_private.trg_lab_lot_biological_only();

-- Wrappers/funções existentes devem incorporar, antes de qualquer mutação:
-- rpc_planejamento_publicar_v1 / publish_planning_to_lab: planejamento só publica linhas elegíveis.
-- generate_production_orders_from_partner: CTE `itens` filtra JOIN produtos p ON p.id=poi.product_id
--   AND p.familia_catalogo='biologico'; pedido misto ignora linhas químicas/fertilizantes.
-- rpc_programar_os_v1: após lock da OS, valida produto/micro da OS/programação.
-- rpc_cockpit_gerar_lote_v1: valida IDs do p_lote contra programação e lab_assert_manufacturable.
-- Os quatro corpos completos/hash-after serão anexados antes de revisão/aplicação; este candidato permanece NO-GO.
COMMIT;
