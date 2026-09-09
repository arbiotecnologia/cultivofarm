-- H9-D-L3 — ROLLBACK de 20261009000000 (homologação ikaauvsflpmamgxmkhoq).
-- Restaura as definições vivas capturadas antes da correção e os grants originais.

CREATE OR REPLACE FUNCTION public.fn_catalogo_preco_canonico(p_product_id uuid, p_microrganismo_id uuid, p_unit_type text, p_volume_ml numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_litro   numeric(18,6);
  v_distint integer;
  v_dose_ha numeric;
  v_unit    numeric(18,6);
BEGIN
  IF num_nonnulls(p_product_id, p_microrganismo_id) <> 1 THEN RETURN NULL; END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN RETURN NULL; END IF;

  SELECT count(DISTINCT round(cv.preco_litro_brl,2)), min(round(cv.preco_litro_brl,2))
    INTO v_distint, v_litro
  FROM public.catalogo_volumes cv
  WHERE cv.ativo = true
    AND cv.preco_litro_brl IS NOT NULL
    AND cv.produto_id IS NOT DISTINCT FROM p_product_id
    AND cv.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id;

  IF COALESCE(v_distint,0) <> 1 OR COALESCE(v_litro,0) <= 0 THEN
    RETURN NULL;
  END IF;

  IF p_unit_type = 'unidade' THEN
    IF COALESCE(p_volume_ml,0) <= 0 THEN RETURN NULL; END IF;
    SELECT round(cv.preco_brl,2) INTO v_unit
    FROM public.catalogo_volumes cv
    WHERE cv.ativo = true
      AND cv.volume_ml = p_volume_ml
      AND cv.produto_id IS NOT DISTINCT FROM p_product_id
      AND cv.microrganismo_id IS NOT DISTINCT FROM p_microrganismo_id
    ORDER BY cv.volume_ml
    LIMIT 1;
    RETURN COALESCE(v_unit, round(v_litro * (p_volume_ml / 1000.0), 2));
  END IF;

  IF p_unit_type = 'litro' THEN RETURN v_litro; END IF;
  IF p_unit_type = 'dose'  THEN RETURN round(v_litro / 10.0, 2); END IF;

  -- hectare
  IF p_product_id IS NOT NULL THEN
    SELECT pr.dose_ml_ha INTO v_dose_ha FROM public.produtos pr WHERE pr.id = p_product_id;
  ELSE
    SELECT mo.dose_ml_ha INTO v_dose_ha FROM public.microrganismos mo WHERE mo.id = p_microrganismo_id;
  END IF;
  IF COALESCE(v_dose_ha,0) <= 0 THEN RETURN NULL; END IF;
  RETURN round(v_litro * (v_dose_ha / 1000.0), 2);
END
$function$
;

CREATE OR REPLACE FUNCTION public.get_cliente_ids_for_user(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ARRAY(
    SELECT cliente_id FROM public.user_clientes WHERE user_id = _user_id
    UNION
    SELECT cliente_id FROM public.profiles WHERE user_id = _user_id AND cliente_id IS NOT NULL
  );
$function$
;

CREATE OR REPLACE FUNCTION public.has_active_user_cliente_access(_user_id uuid, _cliente_id uuid, _levels text[] DEFAULT ARRAY['read'::text, 'execute'::text, 'manage'::text])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'administrador'::public.app_role) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.user_clientes uc
     WHERE uc.user_id = _user_id
       AND uc.cliente_id = _cliente_id
       AND uc.is_active = true
       AND (uc.valid_from IS NULL OR uc.valid_from <= now())
       AND (uc.valid_until IS NULL OR uc.valid_until >= now())
       AND uc.access_level::text = ANY(_levels)
  );
END
$function$
;

CREATE OR REPLACE FUNCTION public.is_delivery_staff(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_uid,'administrador'::app_role)
      OR public.has_role(_uid,'gestor'::app_role)
      OR public.has_role(_uid,'administrativo'::app_role)
      OR public.has_role(_uid,'producao'::app_role)
      OR public.has_role(_uid,'operador_onfarm'::app_role)
      OR public.has_role(_uid,'aplicador'::app_role);
$function$
;

CREATE OR REPLACE FUNCTION public.is_financial_staff(_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN has_role(_uid, 'administrador'::app_role)
      OR has_role(_uid, 'gestor'::app_role)
      OR has_role(_uid, 'financeiro'::app_role);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pode_acessar_recomendacao(_user_id uuid, _recomendacao_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.registros_consultor_recomendacoes r
    JOIN public.registros_consultor rc ON rc.id = r.registro_consultor_id
    WHERE r.id = _recomendacao_id
      AND (
        public.has_role(_user_id, 'administrador'::app_role)
        OR public.has_role(_user_id, 'gestor'::app_role)
        OR public.has_role(_user_id, 'tecnico_agronomo'::app_role)
        OR public.has_role(_user_id, 'consultor_tecnico'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_clientes uc
          WHERE uc.user_id = _user_id AND uc.cliente_id = rc.cliente_id
        )
      )
  );
$function$
;

GRANT EXECUTE ON FUNCTION public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric) TO authenticated;
