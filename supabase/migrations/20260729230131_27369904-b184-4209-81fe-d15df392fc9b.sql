-- =====================================================================
-- CHECKPOINT PÓS-FASE 1 — Motor B2B (STAGING ikaauvsflpmamgxmkhoq)
-- Forward-only, idempotente. Nenhum DML de negócio.
-- =====================================================================
-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
DO $guard$
DECLARE v_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NOT NULL THEN
    EXECUTE 'SELECT project_ref FROM public._fiscal_staging_marker WHERE marker = ''STAGING'' LIMIT 1'
      INTO v_ref;
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref de PRODUCAO recusado';
  END IF;
END
$guard$;

-- ---------------------------------------------------------------------
-- 1) CATÁLOGO B2B — resolução canônica, sem fórmula duplicada,
--    sem fallback zero (ausência de preço => NULL + sob_consulta).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid)
RETURNS TABLE(item_id uuid, item_tipo text, product_id uuid, produto_nome text,
  produto_codigo text, descricao_curta text, preco_tabela numeric, desconto_percentual numeric,
  preco_parceiro numeric, produto_ativo boolean, resumo_curto text, explicacao_b2b text,
  beneficios_principais text, ficha_status text, ficha_aprovada boolean,
  valor_dose_brl numeric, valor_litro_brl numeric, valor_ha_brl numeric,
  unidade_preco_principal text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_user_partner uuid;
  r record;
  v_pid uuid; v_mid uuid;
  j_ha jsonb; j_li jsonb; j_do jsonb;
  n_ha numeric; n_li numeric; n_do numeric;
  b_ha numeric; b_li numeric; b_do numeric;
  v_base numeric; v_final numeric; v_unid text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  v_is_admin := has_role(v_uid,'administrador'::app_role) OR has_role(v_uid,'gestor_comercial'::app_role);
  v_user_partner := public.get_user_partner_id();

  -- Técnico do parceiro nunca acessa o catálogo financeiro.
  IF has_role(v_uid,'parceiro_b2b_tecnico'::app_role) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden_financial_terms';
  END IF;

  IF NOT v_is_admin AND (NOT has_role(v_uid,'parceiro_b2b'::app_role)
      OR v_user_partner IS NULL OR v_user_partner <> p_partner_id) THEN
    RAISE EXCEPTION 'forbidden_partner';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.partner_accounts pa
                 WHERE pa.id = p_partner_id AND pa.ativo = true) THEN
    RAISE EXCEPTION 'partner_not_found';
  END IF;

  FOR r IN
    SELECT p.id, 'produto'::text AS tipo, p.nome, p.codigo, p.ativo,
           ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b,
           ptp.beneficio_combinado AS beneficios
      FROM public.produtos p
      LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
     WHERE p.ativo = true AND COALESCE(p.b2b_enabled,true) = true
    UNION ALL
    SELECT m.id, 'microrganismo'::text, m.nome, m.codigo, m.ativo,
           mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b,
           mtp.beneficios_agronomicos
      FROM public.microrganismos m
      LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
     WHERE m.ativo = true AND COALESCE(m.b2b_enabled,false) = true
  LOOP
    v_pid := CASE WHEN r.tipo='produto' THEN r.id END;
    v_mid := CASE WHEN r.tipo='microrganismo' THEN r.id END;

    j_ha := public.fn_resolve_commercial_price('partner', p_partner_id, NULL, NULL, v_pid, v_mid, 'hectare', NULL, current_date);
    j_li := public.fn_resolve_commercial_price('partner', p_partner_id, NULL, NULL, v_pid, v_mid, 'litro',   NULL, current_date);
    j_do := public.fn_resolve_commercial_price('partner', p_partner_id, NULL, NULL, v_pid, v_mid, 'dose',    NULL, current_date);

    n_ha := CASE WHEN COALESCE((j_ha->>'ok')::boolean,false)
                  AND NOT COALESCE((j_ha->>'quote_required')::boolean,false)
                 THEN NULLIF((j_ha->>'final_unit_price')::numeric,0) END;
    n_li := CASE WHEN COALESCE((j_li->>'ok')::boolean,false)
                  AND NOT COALESCE((j_li->>'quote_required')::boolean,false)
                 THEN NULLIF((j_li->>'final_unit_price')::numeric,0) END;
    n_do := CASE WHEN COALESCE((j_do->>'ok')::boolean,false)
                  AND NOT COALESCE((j_do->>'quote_required')::boolean,false)
                 THEN NULLIF((j_do->>'final_unit_price')::numeric,0) END;
    b_ha := CASE WHEN n_ha IS NOT NULL THEN NULLIF((j_ha->>'base_price')::numeric,0) END;
    b_li := CASE WHEN n_li IS NOT NULL THEN NULLIF((j_li->>'base_price')::numeric,0) END;
    b_do := CASE WHEN n_do IS NOT NULL THEN NULLIF((j_do->>'base_price')::numeric,0) END;

    v_unid := CASE WHEN n_ha IS NOT NULL THEN 'hectare'
                   WHEN n_li IS NOT NULL THEN 'litro'
                   WHEN n_do IS NOT NULL THEN 'dose_100ml'
                   ELSE 'sob_consulta' END;
    v_final := COALESCE(n_ha, n_li, n_do);
    v_base  := COALESCE(b_ha, b_li, b_do);

    item_id := r.id;
    item_tipo := r.tipo;
    product_id := v_pid;
    produto_nome := r.nome;
    produto_codigo := r.codigo;
    descricao_curta := CASE WHEN r.status_validacao='aprovado' THEN LEFT(COALESCE(r.resumo_curto,''),220) END;
    preco_tabela := ROUND(v_base, 2);
    desconto_percentual := CASE WHEN v_base IS NOT NULL AND v_base > 0 AND v_final IS NOT NULL
                                THEN ROUND((1 - v_final / v_base) * 100.0, 2) END;
    preco_parceiro := ROUND(v_final, 2);
    produto_ativo := r.ativo;
    resumo_curto := CASE WHEN r.status_validacao='aprovado' THEN r.resumo_curto END;
    explicacao_b2b := CASE WHEN r.status_validacao='aprovado' THEN r.explicacao_b2b END;
    beneficios_principais := CASE WHEN r.status_validacao='aprovado' THEN r.beneficios END;
    ficha_status := COALESCE(r.status_validacao,'sem_ficha');
    ficha_aprovada := (r.status_validacao = 'aprovado');
    valor_dose_brl := ROUND(n_do, 2);
    valor_litro_brl := ROUND(n_li, 2);
    valor_ha_brl := ROUND(n_ha, 2);
    unidade_preco_principal := v_unid;
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_partner_catalog_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) CATÁLOGO TÉCNICO — zero exposição financeira ao parceiro_b2b_tecnico
--    (assinatura preservada; colunas de valor retornam NULL).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_partner_catalog_tecnico_secure()
RETURNS TABLE(item_id uuid, item_tipo text, nome text, codigo text, descricao_curta text,
  tipo text, nome_cientifico text, funcao text, dose_ml_ha numeric, valor_dose_brl numeric,
  valor_litro_brl numeric, valor_ha_brl numeric, preco_tabela_dose numeric,
  preco_tabela_litro numeric, preco_tabela_ha numeric, unidade_preco_principal text,
  resumo_curto text, explicacao_b2b text, beneficios_principais text, ficha_status text,
  ficha_aprovada boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_tec boolean;
  v_partner uuid;
  v_show_fin boolean;
  r record;
  v_pid uuid; v_mid uuid;
  j_ha jsonb; j_li jsonb; j_do jsonb;
  n_ha numeric; n_li numeric; n_do numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  v_is_admin := public.has_role(v_uid,'administrador'::app_role)
             OR public.has_role(v_uid,'gestor_comercial'::app_role);
  v_is_tec := public.has_role(v_uid,'parceiro_b2b_tecnico'::app_role);

  IF NOT (v_is_tec OR public.has_role(v_uid,'parceiro_b2b'::app_role) OR v_is_admin) THEN
    RAISE EXCEPTION 'Acesso negado ao catálogo técnico';
  END IF;

  v_partner := public.get_user_partner_id();
  -- Financeiro somente para gestor B2B do próprio parceiro. Técnico e admin sem
  -- contexto de parceiro recebem NULL (nunca zero, nunca preço de tabela cru).
  v_show_fin := (NOT v_is_tec) AND v_partner IS NOT NULL
                AND public.has_role(v_uid,'parceiro_b2b'::app_role);

  FOR r IN
    SELECT p.id, 'produto'::text AS itipo, p.nome, p.codigo, p.tipo::text AS ptipo,
           NULL::text AS nome_cientifico, p.funcao_completa AS funcao, p.dose_ml_ha,
           ptp.status_validacao, ptp.resumo_curto, ptp.explicacao_b2b,
           ptp.beneficio_combinado AS beneficios, p.descricao
      FROM public.produtos p
      LEFT JOIN public.product_technical_profiles ptp ON ptp.produto_id = p.id
     WHERE p.ativo = true AND p.b2b_enabled = true
    UNION ALL
    SELECT m.id, 'microrganismo'::text, m.nome, m.codigo, m.tipo::text,
           m.nome_cientifico, m.funcao_agronomica, m.dose_ml_ha,
           mtp.status_validacao, mtp.resumo_curto, mtp.explicacao_b2b,
           mtp.beneficios_agronomicos, m.descricao
      FROM public.microrganismos m
      LEFT JOIN public.microorganism_technical_profiles mtp ON mtp.microrganismo_id = m.id
     WHERE m.ativo = true AND m.b2b_enabled = true
  LOOP
    n_ha := NULL; n_li := NULL; n_do := NULL;
    IF v_show_fin THEN
      v_pid := CASE WHEN r.itipo='produto' THEN r.id END;
      v_mid := CASE WHEN r.itipo='microrganismo' THEN r.id END;
      j_ha := public.fn_resolve_commercial_price('partner', v_partner, NULL, NULL, v_pid, v_mid, 'hectare', NULL, current_date);
      j_li := public.fn_resolve_commercial_price('partner', v_partner, NULL, NULL, v_pid, v_mid, 'litro',   NULL, current_date);
      j_do := public.fn_resolve_commercial_price('partner', v_partner, NULL, NULL, v_pid, v_mid, 'dose',    NULL, current_date);
      n_ha := CASE WHEN COALESCE((j_ha->>'ok')::boolean,false)
                    AND NOT COALESCE((j_ha->>'quote_required')::boolean,false)
                   THEN NULLIF((j_ha->>'final_unit_price')::numeric,0) END;
      n_li := CASE WHEN COALESCE((j_li->>'ok')::boolean,false)
                    AND NOT COALESCE((j_li->>'quote_required')::boolean,false)
                   THEN NULLIF((j_li->>'final_unit_price')::numeric,0) END;
      n_do := CASE WHEN COALESCE((j_do->>'ok')::boolean,false)
                    AND NOT COALESCE((j_do->>'quote_required')::boolean,false)
                   THEN NULLIF((j_do->>'final_unit_price')::numeric,0) END;
    END IF;

    item_id := r.id;
    item_tipo := r.itipo;
    nome := r.nome;
    codigo := r.codigo;
    descricao_curta := CASE WHEN r.status_validacao='aprovado' THEN COALESCE(r.resumo_curto, r.descricao) END;
    tipo := r.ptipo;
    nome_cientifico := r.nome_cientifico;
    funcao := r.funcao;
    dose_ml_ha := r.dose_ml_ha;
    valor_dose_brl := ROUND(n_do,2);
    valor_litro_brl := ROUND(n_li,2);
    valor_ha_brl := ROUND(n_ha,2);
    preco_tabela_dose := ROUND(n_do,2);
    preco_tabela_litro := ROUND(n_li,2);
    preco_tabela_ha := ROUND(n_ha,2);
    unidade_preco_principal := CASE
      WHEN n_ha IS NOT NULL THEN 'hectare'
      WHEN n_li IS NOT NULL THEN 'litro'
      WHEN n_do IS NOT NULL THEN 'dose_100ml'
      ELSE 'sob_consulta' END;
    resumo_curto := CASE WHEN r.status_validacao='aprovado' THEN r.resumo_curto END;
    explicacao_b2b := CASE WHEN r.status_validacao='aprovado' THEN r.explicacao_b2b END;
    beneficios_principais := CASE WHEN r.status_validacao='aprovado' THEN r.beneficios END;
    ficha_status := COALESCE(r.status_validacao,'sem_ficha');
    ficha_aprovada := (r.status_validacao='aprovado');
    RETURN NEXT;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_partner_catalog_tecnico_secure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_partner_catalog_tecnico_secure() TO authenticated;

-- ---------------------------------------------------------------------
-- 3) RLS ON-FARM / APLICADOR — escopo por carteira (user_clientes),
--    comandos separados, DELETE bloqueado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_onfarm_scope_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT _cliente_id IS NOT NULL
     AND (has_role(auth.uid(),'operador_onfarm'::app_role)
          OR has_role(auth.uid(),'aplicador'::app_role))
     AND EXISTS (SELECT 1 FROM public.user_clientes uc
                  WHERE uc.user_id = auth.uid() AND uc.cliente_id = _cliente_id);
$function$;

CREATE OR REPLACE FUNCTION public.fn_onfarm_scope_lote(_lote_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.lotes l
      JOIN public.programacao_producao pp ON pp.id = l.programacao_id
      LEFT JOIN public.ordens_servico os ON os.id = pp.ordem_servico_id
      LEFT JOIN public.ordens_servico_onfarm oso ON oso.id = pp.ordem_servico_onfarm_id
     WHERE l.id = _lote_id
       AND public.fn_onfarm_scope_cliente(COALESCE(os.cliente_id, oso.cliente_id))
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_onfarm_scope_cliente(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_onfarm_scope_lote(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_onfarm_scope_cliente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_onfarm_scope_lote(uuid) TO authenticated;

-- remove liberações globais por papel
DROP POLICY IF EXISTS "OnFarm access lotes" ON public.lotes;
DROP POLICY IF EXISTS "OnFarm access controle_qualidade" ON public.controle_qualidade;
DROP POLICY IF EXISTS "OnFarm access envase" ON public.envase;
DROP POLICY IF EXISTS "OnFarm access programacao_producao" ON public.programacao_producao;
DROP POLICY IF EXISTS "OnFarm access estoque_produto" ON public.estoque_produto;
DROP POLICY IF EXISTS "OnFarm access estoque_movimentacoes" ON public.estoque_movimentacoes;
DROP POLICY IF EXISTS "OnFarm/Aplicador read ordens_servico" ON public.ordens_servico;
DROP POLICY IF EXISTS "OnFarm/Aplicador read ordens_servico_onfarm" ON public.ordens_servico_onfarm;

-- programacao_producao (escopo pela OS)
DROP POLICY IF EXISTS "OnFarm scoped select programacao" ON public.programacao_producao;
CREATE POLICY "OnFarm scoped select programacao" ON public.programacao_producao
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ordens_servico os WHERE os.id = ordem_servico_id
             AND public.fn_onfarm_scope_cliente(os.cliente_id))
 OR EXISTS (SELECT 1 FROM public.ordens_servico_onfarm o2 WHERE o2.id = ordem_servico_onfarm_id
             AND public.fn_onfarm_scope_cliente(o2.cliente_id)));
DROP POLICY IF EXISTS "OnFarm scoped update programacao" ON public.programacao_producao;
CREATE POLICY "OnFarm scoped update programacao" ON public.programacao_producao
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(),'operador_onfarm'::app_role) AND (
      EXISTS (SELECT 1 FROM public.ordens_servico os WHERE os.id = ordem_servico_id
               AND public.fn_onfarm_scope_cliente(os.cliente_id))
   OR EXISTS (SELECT 1 FROM public.ordens_servico_onfarm o2 WHERE o2.id = ordem_servico_onfarm_id
               AND public.fn_onfarm_scope_cliente(o2.cliente_id))))
  WITH CHECK (
    has_role(auth.uid(),'operador_onfarm'::app_role) AND (
      EXISTS (SELECT 1 FROM public.ordens_servico os WHERE os.id = ordem_servico_id
               AND public.fn_onfarm_scope_cliente(os.cliente_id))
   OR EXISTS (SELECT 1 FROM public.ordens_servico_onfarm o2 WHERE o2.id = ordem_servico_onfarm_id
               AND public.fn_onfarm_scope_cliente(o2.cliente_id))));

-- lotes
DROP POLICY IF EXISTS "OnFarm scoped select lotes" ON public.lotes;
CREATE POLICY "OnFarm scoped select lotes" ON public.lotes
  FOR SELECT TO authenticated USING (public.fn_onfarm_scope_lote(id));
DROP POLICY IF EXISTS "OnFarm scoped insert lotes" ON public.lotes;
CREATE POLICY "OnFarm scoped insert lotes" ON public.lotes
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'operador_onfarm'::app_role) AND (
      EXISTS (SELECT 1 FROM public.programacao_producao pp
               LEFT JOIN public.ordens_servico os ON os.id = pp.ordem_servico_id
               LEFT JOIN public.ordens_servico_onfarm o2 ON o2.id = pp.ordem_servico_onfarm_id
              WHERE pp.id = programacao_id
                AND public.fn_onfarm_scope_cliente(COALESCE(os.cliente_id, o2.cliente_id)))));
DROP POLICY IF EXISTS "OnFarm scoped update lotes" ON public.lotes;
CREATE POLICY "OnFarm scoped update lotes" ON public.lotes
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'operador_onfarm'::app_role) AND public.fn_onfarm_scope_lote(id))
  WITH CHECK (has_role(auth.uid(),'operador_onfarm'::app_role) AND public.fn_onfarm_scope_lote(id));

-- controle_qualidade / envase (escopo pelo lote)
DROP POLICY IF EXISTS "OnFarm scoped select cq" ON public.controle_qualidade;
CREATE POLICY "OnFarm scoped select cq" ON public.controle_qualidade
  FOR SELECT TO authenticated USING (public.fn_onfarm_scope_lote(lote_id));
DROP POLICY IF EXISTS "OnFarm scoped insert cq" ON public.controle_qualidade;
CREATE POLICY "OnFarm scoped insert cq" ON public.controle_qualidade
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'operador_onfarm'::app_role) AND public.fn_onfarm_scope_lote(lote_id));
DROP POLICY IF EXISTS "OnFarm scoped update cq" ON public.controle_qualidade;
CREATE POLICY "OnFarm scoped update cq" ON public.controle_qualidade
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'operador_onfarm'::app_role) AND public.fn_onfarm_scope_lote(lote_id))
  WITH CHECK (has_role(auth.uid(),'operador_onfarm'::app_role) AND public.fn_onfarm_scope_lote(lote_id));

DROP POLICY IF EXISTS "OnFarm scoped select envase" ON public.envase;
CREATE POLICY "OnFarm scoped select envase" ON public.envase
  FOR SELECT TO authenticated USING (public.fn_onfarm_scope_lote(lote_id));
DROP POLICY IF EXISTS "OnFarm scoped insert envase" ON public.envase;
CREATE POLICY "OnFarm scoped insert envase" ON public.envase
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'operador_onfarm'::app_role) AND public.fn_onfarm_scope_lote(lote_id));
DROP POLICY IF EXISTS "OnFarm scoped update envase" ON public.envase;
CREATE POLICY "OnFarm scoped update envase" ON public.envase
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'operador_onfarm'::app_role) AND public.fn_onfarm_scope_lote(lote_id))
  WITH CHECK (has_role(auth.uid(),'operador_onfarm'::app_role) AND public.fn_onfarm_scope_lote(lote_id));

-- estoque_produto (escopo pelo lote ou pela reserva de cliente)
DROP POLICY IF EXISTS "OnFarm scoped select estoque_produto" ON public.estoque_produto;
CREATE POLICY "OnFarm scoped select estoque_produto" ON public.estoque_produto
  FOR SELECT TO authenticated USING (
    public.fn_onfarm_scope_lote(lote_id)
    OR public.fn_onfarm_scope_cliente(reservado_para_cliente_id));
DROP POLICY IF EXISTS "OnFarm scoped insert estoque_produto" ON public.estoque_produto;
CREATE POLICY "OnFarm scoped insert estoque_produto" ON public.estoque_produto
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'operador_onfarm'::app_role) AND public.fn_onfarm_scope_lote(lote_id));
DROP POLICY IF EXISTS "OnFarm scoped update estoque_produto" ON public.estoque_produto;
CREATE POLICY "OnFarm scoped update estoque_produto" ON public.estoque_produto
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'operador_onfarm'::app_role)
         AND (public.fn_onfarm_scope_lote(lote_id)
              OR public.fn_onfarm_scope_cliente(reservado_para_cliente_id)))
  WITH CHECK (has_role(auth.uid(),'operador_onfarm'::app_role)
         AND (public.fn_onfarm_scope_lote(lote_id)
              OR public.fn_onfarm_scope_cliente(reservado_para_cliente_id)));

-- estoque_movimentacoes (histórico: sem UPDATE/DELETE para on-farm)
DROP POLICY IF EXISTS "OnFarm scoped select estoque_mov" ON public.estoque_movimentacoes;
CREATE POLICY "OnFarm scoped select estoque_mov" ON public.estoque_movimentacoes
  FOR SELECT TO authenticated USING (
    public.fn_onfarm_scope_cliente(cliente_id) OR public.fn_onfarm_scope_lote(lote_id));
DROP POLICY IF EXISTS "OnFarm scoped insert estoque_mov" ON public.estoque_movimentacoes;
CREATE POLICY "OnFarm scoped insert estoque_mov" ON public.estoque_movimentacoes
  FOR INSERT TO authenticated WITH CHECK (
    has_role(auth.uid(),'operador_onfarm'::app_role)
    AND (public.fn_onfarm_scope_cliente(cliente_id) OR public.fn_onfarm_scope_lote(lote_id)));

-- OS: leitura escopada por carteira
DROP POLICY IF EXISTS "OnFarm/Aplicador scoped read ordens_servico" ON public.ordens_servico;
CREATE POLICY "OnFarm/Aplicador scoped read ordens_servico" ON public.ordens_servico
  FOR SELECT TO authenticated USING (public.fn_onfarm_scope_cliente(cliente_id));
DROP POLICY IF EXISTS "OnFarm/Aplicador scoped read os_onfarm" ON public.ordens_servico_onfarm;
CREATE POLICY "OnFarm/Aplicador scoped read os_onfarm" ON public.ordens_servico_onfarm
  FOR SELECT TO authenticated USING (public.fn_onfarm_scope_cliente(cliente_id));
