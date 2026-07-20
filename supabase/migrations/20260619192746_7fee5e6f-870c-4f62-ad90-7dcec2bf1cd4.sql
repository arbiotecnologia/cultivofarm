
-- 1) Drop & recreate get_partner_catalog_secure with extra pricing columns
DROP FUNCTION IF EXISTS public.get_partner_catalog_secure(uuid);
CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
 RETURNS TABLE(
   item_id uuid, item_tipo text, product_id uuid,
   produto_nome text, produto_codigo text, descricao_curta text,
   preco_tabela numeric, desconto_percentual numeric, preco_parceiro numeric,
   produto_ativo boolean, resumo_curto text, explicacao_b2b text,
   beneficios_principais text, ficha_status text, ficha_aprovada boolean,
   valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric,
   unidade_preco_principal text
 )
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
         THEN LEFT(COALESCE(ptp.resumo_curto, ''), 220) ELSE NULL END,
    COALESCE(p.valor_ha_brl, 0)::numeric,
    v_partner_desconto,
    ROUND(COALESCE(p.valor_ha_brl, 0) * (1 - v_partner_desconto/100.0), 2)::numeric,
    p.ativo,
    CASE WHEN ptp.status_validacao = 'aprovado' THEN ptp.resumo_curto ELSE NULL END,
    CASE WHEN ptp.status_validacao = 'aprovado' THEN ptp.explicacao_b2b ELSE NULL END,
    CASE WHEN ptp.status_validacao = 'aprovado' THEN ptp.beneficio_combinado ELSE NULL END,
    COALESCE(ptp.status_validacao, 'sem_ficha'),
    (ptp.status_validacao = 'aprovado'),
    COALESCE(p.valor_dose_brl, 0)::numeric,
    COALESCE(p.valor_litro_brl, 0)::numeric,
    COALESCE(p.valor_ha_brl, 0)::numeric,
    'hectare'::text
  FROM public.produtos p
  LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
  WHERE p.ativo = true AND COALESCE(p.b2b_enabled, true) = true
  UNION ALL
  SELECT
    m.id, 'microrganismo'::text, NULL::uuid, m.nome, m.codigo,
    CASE WHEN mtp.status_validacao = 'aprovado'
         THEN LEFT(COALESCE(mtp.resumo_curto, ''), 220) ELSE NULL END,
    COALESCE(m.valor_dose_brl, 0)::numeric,
    v_partner_desconto,
    ROUND(COALESCE(m.valor_dose_brl, 0) * (1 - v_partner_desconto/100.0), 2)::numeric,
    m.ativo,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.resumo_curto ELSE NULL END,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.explicacao_b2b ELSE NULL END,
    CASE WHEN mtp.status_validacao = 'aprovado' THEN mtp.beneficios_agronomicos ELSE NULL END,
    COALESCE(mtp.status_validacao, 'sem_ficha'),
    (mtp.status_validacao = 'aprovado'),
    COALESCE(m.valor_dose_brl, 0)::numeric,
    COALESCE(m.valor_litro_brl, 0)::numeric,
    NULL::numeric,
    'dose'::text
  FROM public.microrganismos m
  LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
  WHERE m.ativo = true AND m.b2b_enabled = true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) TO authenticated;

-- 2) Restrict RLS on catalogo_volumes
DROP POLICY IF EXISTS "Authenticated read catalogo_volumes" ON public.catalogo_volumes;
DROP POLICY IF EXISTS "Staff manage catalogo_volumes" ON public.catalogo_volumes;

CREATE POLICY "Staff read all catalogo_volumes"
  ON public.catalogo_volumes FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(),'administrador')
    OR has_role(auth.uid(),'gestor_comercial')
    OR has_role(auth.uid(),'tecnico_agronomo')
    OR has_role(auth.uid(),'producao')
  );

CREATE POLICY "Partner B2B read enabled catalogo_volumes"
  ON public.catalogo_volumes FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(),'parceiro_b2b')
    AND ativo = true
    AND (
      (produto_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.produtos p
          WHERE p.id = catalogo_volumes.produto_id
            AND p.ativo = true AND COALESCE(p.b2b_enabled,true) = true
      ))
      OR
      (microrganismo_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.microrganismos m
          WHERE m.id = catalogo_volumes.microrganismo_id
            AND m.ativo = true AND COALESCE(m.b2b_enabled,false) = true
      ))
    )
  );

CREATE POLICY "Staff manage catalogo_volumes"
  ON public.catalogo_volumes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial'))
  WITH CHECK (has_role(auth.uid(),'administrador') OR has_role(auth.uid(),'gestor_comercial'));
