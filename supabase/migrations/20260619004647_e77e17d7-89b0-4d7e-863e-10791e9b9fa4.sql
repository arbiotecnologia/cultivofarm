
-- 1) Replace partner catalog function so unapproved fichas are hidden
CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
 RETURNS TABLE(item_id uuid, item_tipo text, product_id uuid, produto_nome text, produto_codigo text, descricao_curta text, preco_tabela numeric, desconto_percentual numeric, preco_parceiro numeric, produto_ativo boolean, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_user_partner uuid;
  v_partner_desconto numeric(5,2);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  v_is_admin := has_role(v_uid,'administrador') OR has_role(v_uid,'gestor_comercial');
  v_user_partner := public.get_user_partner_id();
  IF NOT v_is_admin AND (NOT has_role(v_uid,'parceiro_b2b') OR v_user_partner IS NULL OR v_user_partner <> p_partner_id) THEN
    RAISE EXCEPTION 'forbidden_partner';
  END IF;
  SELECT pa.desconto_padrao INTO v_partner_desconto
    FROM public.partner_accounts pa WHERE pa.id = p_partner_id AND pa.ativo = true;
  IF v_partner_desconto IS NULL THEN RAISE EXCEPTION 'partner_not_found'; END IF;

  RETURN QUERY
  SELECT
    p.id, 'produto'::text, p.id, p.nome, p.codigo,
    CASE WHEN ptp.status_validacao = 'aprovado'
         THEN LEFT(COALESCE(ptp.resumo_curto, ''), 220)
         ELSE NULL END,
    COALESCE(p.valor_ha_brl, 0)::numeric,
    v_partner_desconto,
    ROUND(COALESCE(p.valor_ha_brl, 0) * (1 - v_partner_desconto/100.0), 2)::numeric,
    p.ativo,
    CASE WHEN ptp.status_validacao = 'aprovado' THEN ptp.resumo_curto ELSE NULL END,
    CASE WHEN ptp.status_validacao = 'aprovado' THEN ptp.explicacao_b2b ELSE NULL END,
    CASE WHEN ptp.status_validacao = 'aprovado' THEN ptp.beneficio_combinado ELSE NULL END,
    COALESCE(ptp.status_validacao, 'sem_ficha'),
    (ptp.status_validacao = 'aprovado')
  FROM public.produtos p
  LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
  WHERE p.ativo = true AND COALESCE(p.b2b_enabled, true) = true
  UNION ALL
  SELECT
    m.id, 'microrganismo'::text, NULL::uuid, m.nome, m.codigo,
    CASE WHEN mtp.status_validacao = 'aprovado'
         THEN LEFT(COALESCE(mtp.resumo_curto, ''), 220)
         ELSE NULL END,
    COALESCE(m.valor_dose_brl, 0)::numeric,
    v_partner_desconto,
    ROUND(COALESCE(m.valor_dose_brl, 0) * (1 - v_partner_desconto/100.0), 2)::numeric,
    m.ativo,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.resumo_curto ELSE NULL END,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.explicacao_b2b ELSE NULL END,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.beneficios_agronomicos ELSE NULL END,
    COALESCE(mtp.status_validacao, 'sem_ficha'),
    (mtp.status_validacao = 'aprovado')
  FROM public.microrganismos m
  LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
  WHERE m.ativo = true AND m.b2b_enabled = true;
END;
$function$;

-- 2) Generic audit trigger function
CREATE OR REPLACE FUNCTION public.log_catalog_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entidade text;
  v_id uuid;
BEGIN
  v_entidade := CASE TG_TABLE_NAME
    WHEN 'microorganism_technical_profiles' THEN 'ficha_microrganismo'
    WHEN 'product_technical_profiles' THEN 'ficha_produto'
    WHEN 'microorganism_targets' THEN 'alvo_microrganismo'
    WHEN 'product_target_recommendations' THEN 'alvo_produto'
    WHEN 'microorganism_crop_recommendations' THEN 'cultura_microrganismo'
    WHEN 'product_crop_recommendations' THEN 'cultura_produto'
    ELSE TG_TABLE_NAME
  END;
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
    INSERT INTO public.catalog_technical_audit_logs(entidade_tipo, entidade_id, acao, dados_anteriores, dados_novos, usuario_id)
    VALUES (v_entidade, v_id, 'delete', to_jsonb(OLD), NULL, auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_id := NEW.id;
    INSERT INTO public.catalog_technical_audit_logs(entidade_tipo, entidade_id, acao, dados_anteriores, dados_novos, usuario_id)
    VALUES (v_entidade, v_id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSE
    v_id := NEW.id;
    INSERT INTO public.catalog_technical_audit_logs(entidade_tipo, entidade_id, acao, dados_anteriores, dados_novos, usuario_id)
    VALUES (v_entidade, v_id, 'insert', NULL, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
END;
$$;

-- 3) Attach triggers
DROP TRIGGER IF EXISTS trg_audit_micro_profile ON public.microorganism_technical_profiles;
CREATE TRIGGER trg_audit_micro_profile AFTER INSERT OR UPDATE OR DELETE ON public.microorganism_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_catalog_change();

DROP TRIGGER IF EXISTS trg_audit_prod_profile ON public.product_technical_profiles;
CREATE TRIGGER trg_audit_prod_profile AFTER INSERT OR UPDATE OR DELETE ON public.product_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_catalog_change();

DROP TRIGGER IF EXISTS trg_audit_micro_targets ON public.microorganism_targets;
CREATE TRIGGER trg_audit_micro_targets AFTER INSERT OR UPDATE OR DELETE ON public.microorganism_targets
  FOR EACH ROW EXECUTE FUNCTION public.log_catalog_change();

DROP TRIGGER IF EXISTS trg_audit_prod_targets ON public.product_target_recommendations;
CREATE TRIGGER trg_audit_prod_targets AFTER INSERT OR UPDATE OR DELETE ON public.product_target_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.log_catalog_change();

DROP TRIGGER IF EXISTS trg_audit_micro_crops ON public.microorganism_crop_recommendations;
CREATE TRIGGER trg_audit_micro_crops AFTER INSERT OR UPDATE OR DELETE ON public.microorganism_crop_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.log_catalog_change();

DROP TRIGGER IF EXISTS trg_audit_prod_crops ON public.product_crop_recommendations;
CREATE TRIGGER trg_audit_prod_crops AFTER INSERT OR UPDATE OR DELETE ON public.product_crop_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.log_catalog_change();

-- 4) Approval validation: required fields + auto fill validado_por/em
CREATE OR REPLACE FUNCTION public.enforce_micro_profile_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status_validacao = 'aprovado' AND COALESCE(OLD.status_validacao, '') <> 'aprovado' THEN
    IF COALESCE(btrim(NEW.resumo_curto), '') = '' THEN
      RAISE EXCEPTION 'approval_missing_resumo_curto';
    END IF;
    IF COALESCE(btrim(NEW.explicacao_tecnica), '') = '' THEN
      RAISE EXCEPTION 'approval_missing_explicacao_tecnica';
    END IF;
    IF COALESCE(btrim(NEW.explicacao_produtor), '') = '' THEN
      RAISE EXCEPTION 'approval_missing_explicacao_produtor';
    END IF;
    IF NEW.validado_por IS NULL THEN NEW.validado_por := auth.uid(); END IF;
    IF NEW.validado_em IS NULL THEN NEW.validado_em := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_micro_approval ON public.microorganism_technical_profiles;
CREATE TRIGGER trg_enforce_micro_approval BEFORE INSERT OR UPDATE ON public.microorganism_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_micro_profile_approval();

CREATE OR REPLACE FUNCTION public.enforce_product_profile_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status_validacao = 'aprovado' AND COALESCE(OLD.status_validacao, '') <> 'aprovado' THEN
    IF COALESCE(btrim(NEW.resumo_curto), '') = '' THEN
      RAISE EXCEPTION 'approval_missing_resumo_curto';
    END IF;
    IF COALESCE(btrim(NEW.explicacao_tecnica), '') = '' THEN
      RAISE EXCEPTION 'approval_missing_explicacao_tecnica';
    END IF;
    IF COALESCE(btrim(NEW.explicacao_produtor), '') = '' THEN
      RAISE EXCEPTION 'approval_missing_explicacao_produtor';
    END IF;
    IF COALESCE(btrim(NEW.beneficio_combinado), '') = '' THEN
      RAISE EXCEPTION 'approval_missing_beneficio_combinado';
    END IF;
    IF NEW.validado_por IS NULL THEN NEW.validado_por := auth.uid(); END IF;
    IF NEW.validado_em IS NULL THEN NEW.validado_em := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_product_approval ON public.product_technical_profiles;
CREATE TRIGGER trg_enforce_product_approval BEFORE INSERT OR UPDATE ON public.product_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_profile_approval();
