
-- =========================================================
-- Fase Envase 1.1 — RLS, rastreio interno e anti-delete
-- =========================================================

-- 1) Função auxiliar de acesso
CREATE OR REPLACE FUNCTION public.can_user_access_produto_etiqueta(p_etiqueta_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cliente_id uuid;
  v_gerada_por uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  -- Perfis internos com acesso total
  IF public.has_role(v_uid,'administrador'::app_role)
     OR public.has_role(v_uid,'gestor'::app_role)
     OR public.has_role(v_uid,'producao'::app_role)
     OR public.has_role(v_uid,'operador_onfarm'::app_role)
     OR public.has_role(v_uid,'administrativo'::app_role)
     OR public.has_role(v_uid,'financeiro'::app_role)
  THEN
    RETURN true;
  END IF;

  SELECT cliente_id, gerada_por
    INTO v_cliente_id, v_gerada_por
    FROM public.produto_etiquetas
   WHERE id = p_etiqueta_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Cliente produtor: apenas etiquetas dos seus clientes
  IF public.has_role(v_uid,'cliente_produtor'::app_role) THEN
    IF v_cliente_id IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.user_clientes uc
       WHERE uc.user_id = v_uid AND uc.cliente_id = v_cliente_id
    );
  END IF;

  -- Consultor/técnico: regra conservadora — apenas se gerada por ele
  -- ou se estiver vinculado ao cliente em user_clientes
  IF public.has_role(v_uid,'consultor_tecnico'::app_role)
     OR public.has_role(v_uid,'tecnico_agronomo'::app_role)
  THEN
    IF v_gerada_por = v_uid THEN RETURN true; END IF;
    IF v_cliente_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_clientes uc
       WHERE uc.user_id = v_uid AND uc.cliente_id = v_cliente_id
    ) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_user_access_produto_etiqueta(uuid) TO authenticated;

-- 2) RLS produto_etiquetas
DROP POLICY IF EXISTS "Admin/Financeiro read produto_etiquetas" ON public.produto_etiquetas;
DROP POLICY IF EXISTS "Cliente_produtor own labels" ON public.produto_etiquetas;

CREATE POLICY "Read produto_etiquetas via access fn"
  ON public.produto_etiquetas
  FOR SELECT
  TO authenticated
  USING (public.can_user_access_produto_etiqueta(id));

-- "Internal manage produto_etiquetas" já existe e cobre admin/gestor/producao/operador_onfarm

-- 3) RLS produto_etiqueta_eventos
DROP POLICY IF EXISTS "Read etiqueta_eventos" ON public.produto_etiqueta_eventos;

CREATE POLICY "Read etiqueta_eventos via access fn"
  ON public.produto_etiqueta_eventos
  FOR SELECT
  TO authenticated
  USING (public.can_user_access_produto_etiqueta(etiqueta_id));

-- 4) entrega_etiquetas: campos de desativação lógica
ALTER TABLE public.entrega_etiquetas
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS desvinculado_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS desvinculado_por uuid NULL,
  ADD COLUMN IF NOT EXISTS motivo_desvinculacao text NULL;

-- Remover policy FOR ALL e revogar DELETE
DROP POLICY IF EXISTS "Internal manage entrega_etiquetas" ON public.entrega_etiquetas;
DROP POLICY IF EXISTS "Read entrega_etiquetas" ON public.entrega_etiquetas;

REVOKE DELETE ON public.entrega_etiquetas FROM authenticated;
REVOKE DELETE ON public.entrega_etiquetas FROM anon;

CREATE POLICY "entrega_etiquetas select"
  ON public.entrega_etiquetas
  FOR SELECT
  TO authenticated
  USING (public.can_user_access_produto_etiqueta(etiqueta_id));

CREATE POLICY "entrega_etiquetas insert internal"
  ON public.entrega_etiquetas
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
  );

CREATE POLICY "entrega_etiquetas update internal"
  ON public.entrega_etiquetas
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
  );

-- 5) RPC desvincular etiqueta-entrega (lógico)
CREATE OR REPLACE FUNCTION public.rpc_desvincular_etiqueta_entrega(
  p_entrega_id uuid,
  p_etiqueta_id uuid,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT (
    public.has_role(v_uid,'administrador'::app_role)
    OR public.has_role(v_uid,'gestor'::app_role)
    OR public.has_role(v_uid,'producao'::app_role)
    OR public.has_role(v_uid,'operador_onfarm'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF coalesce(length(trim(p_motivo)),0) < 3 THEN
    RAISE EXCEPTION 'Motivo obrigatório';
  END IF;

  UPDATE public.entrega_etiquetas
     SET ativo = false,
         desvinculado_em = now(),
         desvinculado_por = v_uid,
         motivo_desvinculacao = p_motivo
   WHERE entrega_id = p_entrega_id
     AND etiqueta_id = p_etiqueta_id
     AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vínculo não encontrado ou já desvinculado';
  END IF;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, user_id, payload)
  VALUES (p_etiqueta_id, 'etiqueta_substituida', v_uid,
          jsonb_build_object('entrega_id', p_entrega_id, 'motivo', p_motivo, 'acao','desvinculada'));

  BEGIN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, new_data)
    VALUES ('produto_etiqueta', p_etiqueta_id, 'LABEL_DELIVERY_UNLINKED', v_uid,
            jsonb_build_object('entrega_id', p_entrega_id, 'motivo', p_motivo));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_desvincular_etiqueta_entrega(uuid,uuid,text) TO authenticated;

-- 6) rpc_rastreio_produto_interno: usar função de acesso + retorno limitado
CREATE OR REPLACE FUNCTION public.rpc_rastreio_produto_interno(p_etiqueta_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.produto_etiquetas%ROWTYPE;
  v_lote jsonb; v_envase jsonb; v_cq jsonb; v_estoque jsonb; v_entrega jsonb; v_eventos jsonb;
  v_full boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  -- cliente_produtor jamais acessa rastreio interno completo
  IF public.has_role(v_uid,'cliente_produtor'::app_role)
     AND NOT (public.has_role(v_uid,'administrador'::app_role) OR public.has_role(v_uid,'gestor'::app_role)) THEN
    RAISE EXCEPTION 'Sem permissão para rastreio interno';
  END IF;

  IF NOT public.can_user_access_produto_etiqueta(p_etiqueta_id) THEN
    RAISE EXCEPTION 'Sem permissão para rastreio interno';
  END IF;

  SELECT * INTO v_row FROM public.produto_etiquetas WHERE id = p_etiqueta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etiqueta não encontrada'; END IF;

  v_full := public.has_role(v_uid,'administrador'::app_role)
         OR public.has_role(v_uid,'gestor'::app_role)
         OR public.has_role(v_uid,'producao'::app_role)
         OR public.has_role(v_uid,'operador_onfarm'::app_role)
         OR public.has_role(v_uid,'administrativo'::app_role);

  SELECT to_jsonb(l) INTO v_lote FROM public.lotes l WHERE l.id = v_row.lote_id;
  SELECT to_jsonb(e) INTO v_envase FROM public.envase e WHERE e.id = v_row.envase_id;
  SELECT to_jsonb(en) INTO v_entrega FROM public.entregas en WHERE en.id = v_row.entrega_id;
  SELECT jsonb_agg(to_jsonb(ev) ORDER BY ev.created_at DESC) INTO v_eventos
    FROM public.produto_etiqueta_eventos ev WHERE ev.etiqueta_id = p_etiqueta_id;

  IF v_full THEN
    SELECT jsonb_agg(to_jsonb(cq)) INTO v_cq FROM public.controle_qualidade cq WHERE cq.lote_id = v_row.lote_id;
    SELECT jsonb_agg(to_jsonb(ep)) INTO v_estoque FROM public.estoque_produto ep WHERE ep.lote_id = v_row.lote_id;
  ELSE
    v_cq := NULL;
    v_estoque := NULL;
  END IF;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, user_id)
    VALUES (p_etiqueta_id, 'rastreio_visualizado', v_uid);

  RETURN jsonb_build_object(
    'etiqueta', to_jsonb(v_row),
    'lote', v_lote,
    'envase', v_envase,
    'controle_qualidade', v_cq,
    'estoque', v_estoque,
    'entrega', v_entrega,
    'eventos', v_eventos,
    'nivel', CASE WHEN v_full THEN 'completo' ELSE 'limitado' END
  );
END;
$$;
