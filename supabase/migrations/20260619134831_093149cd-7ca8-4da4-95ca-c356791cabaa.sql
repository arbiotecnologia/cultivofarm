CREATE OR REPLACE FUNCTION public.enforce_micro_profile_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_alvos int;
  v_fontes int;
  v_old_status text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status_validacao ELSE NULL END;
BEGIN
  IF NEW.status_validacao = 'aprovado'
     AND (TG_OP = 'INSERT' OR COALESCE(v_old_status, '') <> 'aprovado') THEN

    IF COALESCE(btrim(NEW.resumo_curto), '') = '' THEN RAISE EXCEPTION 'approval_missing_resumo_curto'; END IF;
    IF COALESCE(btrim(NEW.explicacao_tecnica), '') = '' THEN RAISE EXCEPTION 'approval_missing_explicacao_tecnica'; END IF;
    IF COALESCE(btrim(NEW.explicacao_produtor), '') = '' THEN RAISE EXCEPTION 'approval_missing_explicacao_produtor'; END IF;
    IF COALESCE(btrim(NEW.mecanismo_acao), '') = '' THEN RAISE EXCEPTION 'approval_missing_mecanismo_acao'; END IF;
    IF COALESCE(btrim(NEW.beneficios_agronomicos), '') = '' THEN RAISE EXCEPTION 'approval_missing_beneficios_agronomicos'; END IF;
    IF COALESCE(btrim(NEW.observacoes_regulatorias), '') = '' THEN RAISE EXCEPTION 'approval_missing_observacoes_regulatorias'; END IF;

    SELECT count(*) INTO v_alvos FROM public.microorganism_targets
      WHERE microrganismo_id = NEW.microrganismo_id AND ativo = true;
    IF v_alvos = 0 THEN RAISE EXCEPTION 'approval_missing_alvos'; END IF;

    IF v_uid IS NOT NULL THEN
      SELECT (public.has_role(v_uid, 'administrador'::app_role)
           OR public.has_role(v_uid, 'gestor'::app_role)) INTO v_is_admin;
    END IF;

    IF NOT v_is_admin THEN
      SELECT count(*) INTO v_fontes FROM public.catalog_technical_sources
        WHERE (entidade_tipo = 'ficha_microrganismo' AND entidade_id = NEW.id)
           OR (entidade_tipo = 'microrganismo' AND entidade_id = NEW.microrganismo_id);
      IF v_fontes = 0 THEN RAISE EXCEPTION 'approval_missing_fontes'; END IF;
    END IF;

    IF NEW.validado_por IS NULL THEN NEW.validado_por := v_uid; END IF;
    IF NEW.validado_em IS NULL THEN NEW.validado_em := now(); END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_by := COALESCE(v_uid, NEW.updated_by);
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_product_profile_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_alvos int;
  v_fontes int;
  v_comp int;
  v_old_status text := CASE WHEN TG_OP = 'UPDATE' THEN OLD.status_validacao ELSE NULL END;
BEGIN
  IF NEW.status_validacao = 'aprovado'
     AND (TG_OP = 'INSERT' OR COALESCE(v_old_status, '') <> 'aprovado') THEN

    IF COALESCE(btrim(NEW.resumo_curto), '') = '' THEN RAISE EXCEPTION 'approval_missing_resumo_curto'; END IF;
    IF COALESCE(btrim(NEW.explicacao_tecnica), '') = '' THEN RAISE EXCEPTION 'approval_missing_explicacao_tecnica'; END IF;
    IF COALESCE(btrim(NEW.explicacao_produtor), '') = '' THEN RAISE EXCEPTION 'approval_missing_explicacao_produtor'; END IF;
    IF COALESCE(btrim(NEW.beneficio_combinado), '') = '' THEN RAISE EXCEPTION 'approval_missing_beneficio_combinado'; END IF;
    IF COALESCE(btrim(NEW.observacoes_regulatorias), '') = ''
       AND COALESCE(btrim(NEW.cuidados_aplicacao), '') = '' THEN
      RAISE EXCEPTION 'approval_missing_observacoes_ou_cuidados';
    END IF;

    SELECT count(*) INTO v_comp FROM public.formulacoes WHERE produto_id = NEW.produto_id;
    IF v_comp = 0 THEN RAISE EXCEPTION 'approval_missing_composicao'; END IF;

    SELECT count(*) INTO v_alvos FROM public.product_target_recommendations
      WHERE produto_id = NEW.produto_id AND ativo = true;
    IF v_alvos = 0 THEN RAISE EXCEPTION 'approval_missing_alvos'; END IF;

    IF v_uid IS NOT NULL THEN
      SELECT (public.has_role(v_uid, 'administrador'::app_role)
           OR public.has_role(v_uid, 'gestor'::app_role)) INTO v_is_admin;
    END IF;

    IF NOT v_is_admin THEN
      SELECT count(*) INTO v_fontes FROM public.catalog_technical_sources
        WHERE (entidade_tipo = 'ficha_produto' AND entidade_id = NEW.id)
           OR (entidade_tipo = 'produto' AND entidade_id = NEW.produto_id);
      IF v_fontes = 0 THEN RAISE EXCEPTION 'approval_missing_fontes'; END IF;
    END IF;

    IF NEW.validado_por IS NULL THEN NEW.validado_por := v_uid; END IF;
    IF NEW.validado_em IS NULL THEN NEW.validado_em := now(); END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_by := COALESCE(v_uid, NEW.updated_by);
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$function$;