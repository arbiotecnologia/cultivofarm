-- =========================================================
-- Visita Técnica · Paridade — Bloco B (mutations e concorrência)
-- =========================================================

-- 0) Correção: remove DDL indevida da lista (função STABLE não pode criar tabela)
CREATE OR REPLACE FUNCTION public.rpc_listar_visitas_tecnicas_v1(
  p_search text DEFAULT NULL,
  p_status text[] DEFAULT NULL,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL,
  p_fazenda_id uuid DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  WITH base AS (
    SELECT r.*
      FROM public.registros_consultor r
     WHERE public.can_view_technical_visit(v_uid, r.id)
       AND (p_status IS NULL OR array_length(p_status, 1) IS NULL OR r.status::text = ANY (p_status))
       AND (p_cliente_id IS NULL OR r.cliente_id = p_cliente_id)
       AND (p_fazenda_id IS NULL OR r.fazenda_id = p_fazenda_id)
       AND (p_de IS NULL OR r.data_vistoria >= p_de)
       AND (p_ate IS NULL OR r.data_vistoria <= p_ate)
       AND (
         v_search IS NULL
         OR r.codigo_visita ILIKE '%' || v_search || '%'
         OR r.objetivo_visita ILIKE '%' || v_search || '%'
         OR r.problema_principal ILIKE '%' || v_search || '%'
         OR EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = r.cliente_id AND c.nome ILIKE '%' || v_search || '%')
         OR EXISTS (SELECT 1 FROM public.fazendas f WHERE f.id = r.fazenda_id AND f.nome ILIKE '%' || v_search || '%')
       )
  ), counted AS (
    SELECT count(*) AS total FROM base
  ), pagina AS (
    SELECT b.* FROM base b
     ORDER BY b.data_vistoria DESC NULLS LAST, b.created_at DESC
     LIMIT v_size OFFSET (v_page - 1) * v_size
  )
  SELECT (SELECT total FROM counted),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'id', p.id,
             'codigo_visita', p.codigo_visita,
             'status', p.status,
             'data_vistoria', p.data_vistoria,
             'tipo_visita', p.tipo_visita,
             'objetivo_visita', p.objetivo_visita,
             'problema_principal', p.problema_principal,
             'categoria_problema', p.categoria_problema,
             'nivel_pressao', p.nivel_pressao,
             'urgencia', p.urgencia,
             'risco_produtivo', p.risco_produtivo,
             'necessidade_intervencao', p.necessidade_intervencao,
             'created_at', p.created_at,
             'cliente_id', p.cliente_id,
             'cliente_nome', (SELECT c.nome FROM public.clientes c WHERE c.id = p.cliente_id),
             'fazenda_id', p.fazenda_id,
             'fazenda_nome', (SELECT f.nome FROM public.fazendas f WHERE f.id = p.fazenda_id),
             'talhao_nome', (SELECT t.nome FROM public.talhoes t WHERE t.id = p.talhao_id),
             'can_edit', (public.can_manage_technical_visit(v_uid, p.id)
                          AND public.is_technical_visit_editable_status(p.status::text))
           ))
           FROM pagina p
         ), '[]'::jsonb)
    INTO v_total, v_items;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_size,
    'has_more', (v_page * v_size) < v_total
  );
END;
$function$;

-- 1) Helper de auditoria de status (status anterior/novo, autor, motivo, versão)
CREATE OR REPLACE FUNCTION public._visita_log_status(
  p_registro_id uuid,
  p_acao text,
  p_status_anterior text,
  p_status_novo text,
  p_motivo text,
  p_version integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao, metadata)
  VALUES (
    p_registro_id, auth.uid(), p_acao,
    COALESCE(NULLIF(btrim(p_motivo), ''), p_acao),
    jsonb_build_object(
      'status_anterior', p_status_anterior,
      'status_novo', p_status_novo,
      'motivo', NULLIF(btrim(COALESCE(p_motivo, '')), ''),
      'version', p_version,
      'autor', auth.uid()
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._visita_log_status(uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;

-- 2) Arquivar: exige motivo fora de rascunho + auditoria completa
CREATE OR REPLACE FUNCTION public.rpc_arquivar_visita(p_registro_id uuid, p_expected_version integer, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_new_version integer;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, false);

  IF v_reg.status::text = 'arquivado' THEN
    RETURN jsonb_build_object('ok', true, 'version', v_reg.version, 'status', 'arquivado', 'idempotent', true);
  END IF;

  IF v_reg.status::text <> 'rascunho' AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'motivo_obrigatorio' USING ERRCODE = 'P0001';
  END IF;

  -- a matriz de transições é validada pelo trigger de status do registro
  UPDATE public.registros_consultor
     SET status = 'arquivado', version = COALESCE(version,1)+1, updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_new_version;

  PERFORM public._visita_log_status(
    p_registro_id, 'visita_arquivada', v_reg.status::text, 'arquivado', v_motivo, v_new_version);

  RETURN jsonb_build_object('ok', true, 'version', v_new_version, 'status', 'arquivado');
END;
$function$;

-- 3) Identificação: política explícita de limpeza de campos opcionais
CREATE OR REPLACE FUNCTION public.rpc_atualizar_identificacao_visita(p_registro_id uuid, p_expected_version integer, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_new_version integer;
BEGIN
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, false);

  IF NOT public.is_technical_visit_editable_status(v_reg.status::text) THEN
    RAISE EXCEPTION 'status_nao_editavel' USING ERRCODE = 'P0001';
  END IF;

  -- Política: chave ausente = mantém valor atual; chave presente = aplica valor
  -- (string vazia ou null limpam campos opcionais: safra, fase_fenologica, objetivo_visita).
  UPDATE public.registros_consultor SET
    cultura_id      = CASE WHEN p_payload ? 'cultura_id'
                             THEN NULLIF(p_payload->>'cultura_id','')::uuid ELSE cultura_id END,
    data_vistoria   = CASE WHEN p_payload ? 'data_vistoria'
                             THEN COALESCE(NULLIF(p_payload->>'data_vistoria','')::date, data_vistoria) ELSE data_vistoria END,
    tipo_visita     = CASE WHEN p_payload ? 'tipo_visita'
                             THEN COALESCE(NULLIF(p_payload->>'tipo_visita','')::tipo_visita, tipo_visita) ELSE tipo_visita END,
    objetivo_visita = CASE WHEN p_payload ? 'objetivo_visita'
                             THEN NULLIF(btrim(COALESCE(p_payload->>'objetivo_visita','')),'') ELSE objetivo_visita END,
    safra           = CASE WHEN p_payload ? 'safra'
                             THEN NULLIF(btrim(COALESCE(p_payload->>'safra','')),'') ELSE safra END,
    fase_fenologica = CASE WHEN p_payload ? 'fase_fenologica'
                             THEN NULLIF(btrim(COALESCE(p_payload->>'fase_fenologica','')),'') ELSE fase_fenologica END,
    version         = COALESCE(version, 1) + 1,
    updated_at      = now()
  WHERE id = p_registro_id
  RETURNING version INTO v_new_version;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao, metadata)
  VALUES (p_registro_id, auth.uid(), 'identificacao_atualizada', 'Identificação da visita atualizada',
          jsonb_build_object('version', v_new_version, 'campos', (SELECT jsonb_agg(k) FROM jsonb_object_keys(p_payload) k)));

  RETURN jsonb_build_object('ok', true, 'version', v_new_version);
END;
$function$;

-- 4) Monitoramento: versão esperada + incremento de versão
DROP FUNCTION IF EXISTS public.rpc_ativar_monitoramento_visita(uuid, text, date);

CREATE OR REPLACE FUNCTION public.rpc_ativar_monitoramento_visita(
  p_registro_id uuid,
  p_expected_version integer,
  p_tipo text,
  p_data_referencia date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_reg public.registros_consultor%ROWTYPE;
  v_id uuid;
  v_new_version integer;
BEGIN
  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, false);

  IF p_tipo IS NULL OR btrim(p_tipo) = '' THEN
    RAISE EXCEPTION 'tipo_obrigatorio' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_id FROM public.monitoramento_avisos
   WHERE registro_consultor_id = p_registro_id AND tipo = p_tipo
     AND data_referencia IS NOT DISTINCT FROM p_data_referencia
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'version', v_reg.version, 'idempotent', true);
  END IF;

  INSERT INTO public.monitoramento_avisos (registro_consultor_id, tipo, data_referencia)
  VALUES (p_registro_id, p_tipo, p_data_referencia)
  RETURNING id INTO v_id;

  UPDATE public.registros_consultor
     SET version = COALESCE(version,1)+1, updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_new_version;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao, metadata)
  VALUES (p_registro_id, auth.uid(), 'monitoramento_ativado', 'Plano de monitoramento: ' || p_tipo,
          jsonb_build_object('tipo', p_tipo, 'data_referencia', p_data_referencia, 'version', v_new_version));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'version', v_new_version);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_ativar_monitoramento_visita(uuid, integer, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ativar_monitoramento_visita(uuid, integer, text, date) TO authenticated;

-- 5) Retorno: versão esperada + idempotência canônica por (origem, data prevista)
DROP FUNCTION IF EXISTS public.rpc_programar_retorno_visita(uuid, date, text);

CREATE OR REPLACE FUNCTION public.rpc_programar_retorno_visita(
  p_registro_id uuid,
  p_expected_version integer,
  p_data_prevista date,
  p_descricao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor%ROWTYPE;
  v_sol_id uuid;
  v_new_id uuid;
  v_target_user uuid;
  v_profile uuid;
  v_new_version integer;
BEGIN
  IF p_data_prevista IS NULL THEN
    RAISE EXCEPTION 'data_prevista_obrigatoria' USING ERRCODE = 'P0001';
  END IF;

  v_reg := public._visita_lock_and_check(p_registro_id, p_expected_version, false);

  -- Idempotência canônica: mesma origem + mesma data prevista + rascunho
  SELECT id INTO v_new_id FROM public.registros_consultor
   WHERE registro_origem_id = p_registro_id
     AND status::text = 'rascunho'
     AND data_vistoria = p_data_prevista
   LIMIT 1;

  IF v_new_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'registro_id', v_new_id, 'version', v_reg.version, 'idempotent', true);
  END IF;

  v_target_user := v_uid;
  IF v_reg.solicitacao_id IS NOT NULL THEN
    SELECT user_id INTO v_target_user FROM public.portal_solicitacoes WHERE id = v_reg.solicitacao_id;
    v_target_user := COALESCE(v_target_user, v_uid);
  END IF;
  SELECT id INTO v_profile FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.portal_solicitacoes (
    cliente_id, fazenda_id, talhao_id, tipo_demanda, descricao, status,
    consultor_atribuido, data_prevista_atendimento, registro_origem_id,
    origem_solicitacao, user_id, urgencia
  ) VALUES (
    v_reg.cliente_id, v_reg.fazenda_id, v_reg.talhao_id, 'retorno_tecnico',
    COALESCE(NULLIF(btrim(p_descricao),''), 'Retorno técnico programado'),
    'agendada', COALESCE(v_reg.consultor_responsavel, v_uid), p_data_prevista,
    p_registro_id, 'interna', v_target_user, 'media'
  ) RETURNING id INTO v_sol_id;

  INSERT INTO public.registros_consultor (
    solicitacao_id, registro_origem_id, cliente_id, fazenda_id, talhao_id, cultura_id,
    consultor_responsavel, created_by, consultor_profile_id, status, tipo_visita,
    tipo_demanda, problema_principal, data_vistoria
  ) VALUES (
    v_sol_id, p_registro_id, v_reg.cliente_id, v_reg.fazenda_id, v_reg.talhao_id, v_reg.cultura_id,
    COALESCE(v_reg.consultor_responsavel, v_uid), v_uid, v_profile, 'rascunho', 'retorno',
    'retorno_tecnico', 'Acompanhamento de visita anterior', p_data_prevista
  ) RETURNING id INTO v_new_id;

  UPDATE public.registros_consultor
     SET data_proxima_visita = p_data_prevista,
         version = COALESCE(version,1)+1,
         updated_at = now()
   WHERE id = p_registro_id
   RETURNING version INTO v_new_version;

  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao, metadata)
  VALUES
    (p_registro_id, v_uid, 'retorno_programado', 'Retorno técnico programado para ' || p_data_prevista::text,
     jsonb_build_object('data_prevista', p_data_prevista, 'registro_retorno_id', v_new_id, 'version', v_new_version)),
    (v_new_id, v_uid, 'visita_criada', 'Visita de retorno criada a partir da visita ' || p_registro_id::text,
     jsonb_build_object('registro_origem_id', p_registro_id));

  RETURN jsonb_build_object('ok', true, 'registro_id', v_new_id, 'solicitacao_id', v_sol_id, 'version', v_new_version);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_programar_retorno_visita(uuid, integer, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_programar_retorno_visita(uuid, integer, date, text) TO authenticated;