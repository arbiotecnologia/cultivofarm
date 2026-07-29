-- 1) Leitura cadastral para perfis internos faltantes
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_cliente_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_admin boolean;
    v_is_gestor boolean;
    v_is_adm_sys boolean;
    v_is_financeiro boolean;
    v_is_comercial boolean;
    v_is_producao boolean;
    v_is_aplicador boolean;
    v_is_onfarm boolean;
    v_is_consultor boolean;
    v_is_tecnico boolean;
    v_is_cliente boolean;
    v_is_b2b boolean;
    v_is_b2b_tec boolean;
    v_partner_id uuid;
BEGIN
    IF v_user_id IS NULL OR _cliente_id IS NULL THEN
        RETURN FALSE;
    END IF;

    v_is_admin := has_role(v_user_id, 'administrador'::app_role);
    v_is_gestor := has_role(v_user_id, 'gestor'::app_role);
    v_is_adm_sys := has_role(v_user_id, 'administrativo'::app_role);
    v_is_financeiro := has_role(v_user_id, 'financeiro'::app_role);
    v_is_comercial := has_role(v_user_id, 'gestor_comercial'::app_role);
    v_is_producao := has_role(v_user_id, 'producao'::app_role);
    v_is_aplicador := has_role(v_user_id, 'aplicador'::app_role);
    v_is_onfarm := has_role(v_user_id, 'operador_onfarm'::app_role);
    v_is_consultor := has_role(v_user_id, 'consultor_tecnico'::app_role);
    v_is_tecnico := has_role(v_user_id, 'tecnico_agronomo'::app_role);
    v_is_cliente := has_role(v_user_id, 'cliente_produtor'::app_role);
    v_is_b2b := has_role(v_user_id, 'parceiro_b2b'::app_role);
    v_is_b2b_tec := has_role(v_user_id, 'parceiro_b2b_tecnico'::app_role);

    IF v_is_admin OR v_is_gestor OR v_is_adm_sys OR v_is_financeiro
       OR v_is_comercial OR v_is_producao OR v_is_aplicador OR v_is_onfarm THEN
        RETURN TRUE;
    END IF;

    IF v_is_cliente THEN
        RETURN _cliente_id = ANY(get_cliente_ids_for_user(v_user_id));
    END IF;

    IF v_is_consultor OR v_is_tecnico THEN
        RETURN EXISTS (
            SELECT 1 FROM user_clientes uc
            WHERE uc.user_id = v_user_id AND uc.cliente_id = _cliente_id
        );
    END IF;

    IF v_is_b2b_tec THEN
        v_partner_id := public.get_user_partner_id();
        RETURN EXISTS (
            SELECT 1 FROM public.partner_technician_clients ptc
            WHERE ptc.cliente_id = _cliente_id
              AND ptc.technician_user_id = v_user_id
              AND ptc.partner_id = v_partner_id
              AND ptc.active = true
        );
    END IF;

    IF v_is_b2b THEN
        v_partner_id := public.get_user_partner_id();
        RETURN EXISTS (
            SELECT 1 FROM public.partner_technician_clients ptc
            WHERE ptc.cliente_id = _cliente_id
              AND ptc.partner_id = v_partner_id
              AND ptc.active = true
        ) OR EXISTS (
            SELECT 1 FROM public.partner_clients pc
            WHERE pc.cliente_id = _cliente_id
              AND pc.partner_id = v_partner_id
              AND pc.active = true
        );
    END IF;

    RETURN FALSE;
END;
$function$;

-- 2) Gestor Comercial escreve clientes (rota /clientes = rw)
DROP POLICY IF EXISTS "GestorComercial manage clients" ON public.clientes;
CREATE POLICY "GestorComercial manage clients" ON public.clientes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'gestor_comercial'::app_role))
  WITH CHECK (has_role(auth.uid(), 'gestor_comercial'::app_role));

-- 3) Operador On-Farm: cockpit laboratório + estoque
DROP POLICY IF EXISTS "OnFarm access lotes" ON public.lotes;
CREATE POLICY "OnFarm access lotes" ON public.lotes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'operador_onfarm'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operador_onfarm'::app_role));

DROP POLICY IF EXISTS "OnFarm access controle_qualidade" ON public.controle_qualidade;
CREATE POLICY "OnFarm access controle_qualidade" ON public.controle_qualidade
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'operador_onfarm'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operador_onfarm'::app_role));

DROP POLICY IF EXISTS "OnFarm access envase" ON public.envase;
CREATE POLICY "OnFarm access envase" ON public.envase
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'operador_onfarm'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operador_onfarm'::app_role));

DROP POLICY IF EXISTS "OnFarm access programacao_producao" ON public.programacao_producao;
CREATE POLICY "OnFarm access programacao_producao" ON public.programacao_producao
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'operador_onfarm'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operador_onfarm'::app_role));

DROP POLICY IF EXISTS "OnFarm access estoque_produto" ON public.estoque_produto;
CREATE POLICY "OnFarm access estoque_produto" ON public.estoque_produto
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'operador_onfarm'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operador_onfarm'::app_role));

DROP POLICY IF EXISTS "OnFarm access estoque_movimentacoes" ON public.estoque_movimentacoes;
CREATE POLICY "OnFarm access estoque_movimentacoes" ON public.estoque_movimentacoes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'operador_onfarm'::app_role))
  WITH CHECK (has_role(auth.uid(), 'operador_onfarm'::app_role));

-- 4) Leitura de OS para On-Farm e Aplicador
DROP POLICY IF EXISTS "OnFarm/Aplicador read ordens_servico" ON public.ordens_servico;
CREATE POLICY "OnFarm/Aplicador read ordens_servico" ON public.ordens_servico
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'operador_onfarm'::app_role)
    OR has_role(auth.uid(), 'aplicador'::app_role)
  );

DROP POLICY IF EXISTS "OnFarm/Aplicador read ordens_servico_onfarm" ON public.ordens_servico_onfarm;
CREATE POLICY "OnFarm/Aplicador read ordens_servico_onfarm" ON public.ordens_servico_onfarm
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'operador_onfarm'::app_role)
    OR has_role(auth.uid(), 'aplicador'::app_role)
  );

-- 5) Vínculos de carteira: bloco de FIXTURE removido da cadeia de migrations
--    (correção forward-only do checkpoint pós-Fase 1).
--    Os vínculos já aplicados no staging são preservados; a reaplicação futura
--    e a promoção para produção ficam impedidas.
--    Script movido para: scripts/tests/onfarm-b2b-fixtures/vinculos-homologacao.sql
