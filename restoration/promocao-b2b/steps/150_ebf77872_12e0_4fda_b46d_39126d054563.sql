-- PACOTE DE PROMOCAO MOTOR B2B — passo 150
-- Catalogo tecnico B2B
-- Origem (historico, NAO modificado): supabase/migrations/20260729201118_ebf77872-12e0-4fda-b46d-39126d054563.sql
-- sha256(origem) = 41a589ae93afac8804e12ec09bf83527623b728d56dbeaf795ee1d2142d89e1a
-- Guarda de ambiente removida deste passo: a verificacao de destino e
-- centralizada e fail-closed em 000_preflight.sql (executado antes).
-- Forward-only. Nao contem fixtures, UUIDs de teste nem DROP destrutivo de dados.

CREATE OR REPLACE FUNCTION public.get_partner_catalog_tecnico_secure()
 RETURNS TABLE(item_id uuid, item_tipo text, nome text, codigo text, descricao_curta text, tipo text, nome_cientifico text, funcao text, dose_ml_ha numeric, valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric, preco_tabela_dose numeric, preco_tabela_litro numeric, preco_tabela_ha numeric, unidade_preco_principal text, resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text, ficha_aprovada boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    CASE WHEN ptp.status_validacao = 'aprovado'
         THEN COALESCE(ptp.resumo_curto, p.descricao) END AS descricao_curta,
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
      WHEN COALESCE(p.valor_ha_brl, 0)    > 0 THEN 'hectare'
      WHEN COALESCE(p.valor_litro_brl, 0) > 0 THEN 'litro'
      WHEN COALESCE(p.valor_dose_brl, 0)  > 0 THEN 'dose_100ml'
      ELSE 'sob_consulta'
    END AS unidade_preco_principal,
    CASE WHEN ptp.status_validacao = 'aprovado' THEN ptp.resumo_curto END,
    CASE WHEN ptp.status_validacao = 'aprovado' THEN ptp.explicacao_b2b END,
    CASE WHEN ptp.status_validacao = 'aprovado' THEN ptp.beneficio_combinado END,
    COALESCE(ptp.status_validacao, 'sem_ficha') AS ficha_status,
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
    CASE WHEN mtp.status_validacao = 'aprovado'
         THEN COALESCE(mtp.resumo_curto, m.descricao) END,
    m.tipo::text,
    m.nome_cientifico,
    m.funcao_agronomica,
    m.dose_ml_ha,
    COALESCE(m.valor_dose_brl, 0),
    COALESCE(m.valor_litro_brl, COALESCE(m.valor_dose_brl, 0) * 10),
    CASE WHEN m.dose_ml_ha IS NOT NULL AND m.dose_ml_ha > 0 AND COALESCE(m.valor_dose_brl, 0) > 0
         THEN ROUND((m.dose_ml_ha / 100.0) * m.valor_dose_brl, 2) END,
    COALESCE(m.valor_dose_brl, 0),
    COALESCE(m.valor_litro_brl, COALESCE(m.valor_dose_brl, 0) * 10),
    CASE WHEN m.dose_ml_ha IS NOT NULL AND m.dose_ml_ha > 0 AND COALESCE(m.valor_dose_brl, 0) > 0
         THEN ROUND((m.dose_ml_ha / 100.0) * m.valor_dose_brl, 2) END,
    CASE
      WHEN COALESCE(m.valor_dose_brl, 0)  > 0 THEN 'dose_100ml'
      WHEN COALESCE(m.valor_litro_brl, 0) > 0 THEN 'litro'
      ELSE 'sob_consulta'
    END,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.resumo_curto END,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.explicacao_b2b END,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.beneficios_agronomicos END,
    COALESCE(mtp.status_validacao, 'sem_ficha'),
    (mtp.status_validacao = 'aprovado')
  FROM public.microrganismos m
  LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
  WHERE m.ativo = true AND m.b2b_enabled = true;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_partner_catalog_tecnico_secure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_catalog_tecnico_secure() TO authenticated;
