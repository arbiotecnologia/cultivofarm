
CREATE OR REPLACE FUNCTION public.get_partner_catalog_tecnico_secure()
RETURNS TABLE (
  item_id uuid,
  item_tipo text,
  nome text,
  codigo text,
  descricao_curta text,
  tipo text,
  nome_cientifico text,
  funcao text,
  dose_ml_ha numeric,
  valor_dose_brl numeric,
  valor_litro_brl numeric,
  valor_ha_brl numeric,
  preco_tabela_dose numeric,
  preco_tabela_litro numeric,
  preco_tabela_ha numeric,
  unidade_preco_principal text,
  resumo_curto text,
  explicacao_b2b text,
  beneficios_principais text,
  ficha_status text,
  ficha_aprovada boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'parceiro_b2b_tecnico'::app_role)
    OR public.has_role(v_uid, 'parceiro_b2b'::app_role)
    OR public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor_comercial'::app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado ao catálogo técnico';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS item_id,
    'produto'::text AS item_tipo,
    p.nome,
    p.codigo,
    p.descricao AS descricao_curta,
    p.tipo::text AS tipo,
    NULL::text AS nome_cientifico,
    p.funcao_completa AS funcao,
    p.dose_ml_ha,
    COALESCE(p.valor_dose_brl, 0)  AS valor_dose_brl,
    COALESCE(p.valor_litro_brl, 0) AS valor_litro_brl,
    COALESCE(p.valor_ha_brl, 0)    AS valor_ha_brl,
    COALESCE(p.valor_dose_brl, 0)  AS preco_tabela_dose,
    COALESCE(p.valor_litro_brl, 0) AS preco_tabela_litro,
    COALESCE(p.valor_ha_brl, 0)    AS preco_tabela_ha,
    CASE
      WHEN COALESCE(p.valor_ha_brl, 0)    > 0 THEN 'ha'
      WHEN COALESCE(p.valor_litro_brl, 0) > 0 THEN 'litro'
      WHEN COALESCE(p.valor_dose_brl, 0)  > 0 THEN 'dose'
      ELSE 'sob_consulta'
    END AS unidade_preco_principal,
    ptp.resumo_curto,
    ptp.explicacao_b2b,
    ptp.beneficio_combinado AS beneficios_principais,
    COALESCE(ptp.status_validacao, 'rascunho') AS ficha_status,
    (ptp.status_validacao = 'aprovado') AS ficha_aprovada
  FROM public.produtos p
  LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
  WHERE p.ativo = true AND p.b2b_enabled = true

  UNION ALL

  SELECT
    m.id,
    'microrganismo'::text,
    m.nome,
    m.codigo,
    m.descricao,
    m.tipo::text,
    m.nome_cientifico,
    m.funcao_agronomica,
    m.dose_ml_ha,
    COALESCE(m.valor_dose_brl, 0),
    COALESCE(m.valor_litro_brl, 0),
    NULL::numeric,
    COALESCE(m.valor_dose_brl, 0),
    COALESCE(m.valor_litro_brl, 0),
    NULL::numeric,
    CASE
      WHEN COALESCE(m.valor_litro_brl, 0) > 0 THEN 'litro'
      WHEN COALESCE(m.valor_dose_brl, 0)  > 0 THEN 'dose'
      ELSE 'sob_consulta'
    END,
    mtp.resumo_curto,
    mtp.explicacao_b2b,
    mtp.beneficios_agronomicos,
    COALESCE(mtp.status_validacao, 'rascunho'),
    (mtp.status_validacao = 'aprovado')
  FROM public.microrganismos m
  LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
  WHERE m.ativo = true AND m.b2b_enabled = true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_partner_catalog_tecnico_secure() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_partner_catalog_tecnico_secure() TO authenticated;
