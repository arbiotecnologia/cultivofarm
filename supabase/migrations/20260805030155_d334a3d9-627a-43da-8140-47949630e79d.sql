-- ============================================================================
-- Fluxo unificado de atendimento técnico (staging ikaauvsflpmamgxmkhoq)
-- Idempotente. Rollback lógico em restoration/visita-portais-tecnicos/rollback.sql
-- ============================================================================

-- Guard de ambiente: recusa execução fora de staging
DO $guard$
BEGIN
  IF current_setting('request.jwt.claim.iss', true) LIKE '%navfzbwgwzruipouyfnk%' THEN
    RAISE EXCEPTION 'producao_bloqueada';
  END IF;
END
$guard$;

-- ── A. Origem do atendimento ────────────────────────────────────────────────
ALTER TABLE public.registros_consultor
  ADD COLUMN IF NOT EXISTS origem_atendimento text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.registros_consultor'::regclass
      AND conname = 'registros_consultor_origem_atendimento_chk'
  ) THEN
    ALTER TABLE public.registros_consultor
      ADD CONSTRAINT registros_consultor_origem_atendimento_chk
      CHECK (origem_atendimento IS NULL OR origem_atendimento IN (
        'ocorrencia_campo','solicitacao_produtor','agenda','retorno_monitoramento','visita_avulsa'
      ));
  END IF;
END
$$;

-- Backfill somente quando a inferência é inequívoca
UPDATE public.registros_consultor
   SET origem_atendimento = 'solicitacao_produtor'
 WHERE origem_atendimento IS NULL AND solicitacao_id IS NOT NULL;

UPDATE public.registros_consultor
   SET origem_atendimento = 'retorno_monitoramento'
 WHERE origem_atendimento IS NULL AND registro_origem_id IS NOT NULL;

UPDATE public.registros_consultor
   SET origem_atendimento = 'ocorrencia_campo'
 WHERE origem_atendimento IS NULL AND natureza_registro = 'ocorrencia';

CREATE INDEX IF NOT EXISTS idx_registros_consultor_origem
  ON public.registros_consultor (origem_atendimento);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_resp_status
  ON public.registros_consultor (consultor_responsavel, status);
CREATE INDEX IF NOT EXISTS idx_portal_solicitacoes_consultor_status
  ON public.portal_solicitacoes (consultor_atribuido, status);

-- ── B. Motor canônico de criação (evolução, sem segundo motor) ──────────────
DROP FUNCTION IF EXISTS public.rpc_criar_visita_idempotente(uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid);

CREATE OR REPLACE FUNCTION public.rpc_criar_visita_idempotente(
  p_client_uuid uuid,
  p_cliente_id uuid,
  p_fazenda_id uuid,
  p_talhao_id uuid,
  p_cultura_id uuid DEFAULT NULL,
  p_data_vistoria date DEFAULT CURRENT_DATE,
  p_tipo_visita tipo_visita DEFAULT 'vistoria_inicial',
  p_objetivo_visita text DEFAULT NULL,
  p_safra text DEFAULT NULL,
  p_fase_fenologica text DEFAULT NULL,
  p_solicitacao_id uuid DEFAULT NULL,
  p_origem text DEFAULT 'visita_avulsa',
  p_categoria_problema categoria_problema_consultor DEFAULT NULL,
  p_nivel_pressao nivel_pressao DEFAULT NULL,
  p_percentual_area_afetada numeric DEFAULT NULL,
  p_urgencia urgencia_consultor DEFAULT NULL,
  p_localizacao_na_area text DEFAULT NULL,
  p_observacoes_tecnicas text DEFAULT NULL,
  p_problema_principal text DEFAULT NULL,
  p_area_hectares numeric DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_registro_origem_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.registros_consultor%ROWTYPE;
  v_new_id uuid;
  v_fazenda_cliente uuid;
  v_talhao_fazenda uuid;
  v_origem text := COALESCE(NULLIF(p_origem,''), 'visita_avulsa');
  v_natureza natureza_registro_consultor;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  IF v_origem NOT IN ('ocorrencia_campo','solicitacao_produtor','agenda','retorno_monitoramento','visita_avulsa') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_origin');
  END IF;

  v_natureza := CASE WHEN v_origem = 'ocorrencia_campo' THEN 'ocorrencia'::natureza_registro_consultor
                     ELSE 'visita'::natureza_registro_consultor END;

  IF p_client_uuid IS NULL
     OR p_cliente_id IS NULL
     OR p_fazenda_id IS NULL
     OR p_talhao_id IS NULL
     OR p_data_vistoria IS NULL
     OR p_tipo_visita IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  -- Cultura é obrigatória em visitas; dispensada na ocorrência de campo
  IF p_cultura_id IS NULL AND v_origem <> 'ocorrencia_campo' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  SELECT * INTO v_existing
    FROM public.registros_consultor
    WHERE client_uuid = p_client_uuid
    LIMIT 1;

  IF FOUND THEN
    IF v_existing.consultor_responsavel <> v_uid
       AND NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'idempotent', true,
      'registro_id', v_existing.id,
      'client_uuid', v_existing.client_uuid,
      'status', v_existing.status::text,
      'origem', v_existing.origem_atendimento,
      'version', v_existing.version,
      'can_edit', v_existing.status IN ('rascunho','em_andamento','ajuste_solicitado','reprovado'),
      'next_route', '/app/visita/' || v_existing.id::text,
      'pdf_status', v_existing.pdf_status
    );
  END IF;

  IF NOT public.has_active_user_cliente_access(v_uid, p_cliente_id, ARRAY['execute','manage']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'technical_access_required');
  END IF;

  SELECT cliente_id INTO v_fazenda_cliente
    FROM public.fazendas WHERE id = p_fazenda_id;
  IF v_fazenda_cliente IS NULL OR v_fazenda_cliente <> p_cliente_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_farm');
  END IF;

  SELECT fazenda_id INTO v_talhao_fazenda
    FROM public.talhoes WHERE id = p_talhao_id;
  IF v_talhao_fazenda IS NULL OR v_talhao_fazenda <> p_fazenda_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_plot');
  END IF;

  IF p_cultura_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.culturas WHERE id = p_cultura_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_crop');
  END IF;

  IF p_solicitacao_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.portal_solicitacoes
        WHERE id = p_solicitacao_id AND cliente_id = p_cliente_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
    END IF;
  END IF;

  INSERT INTO public.registros_consultor (
    client_uuid,
    cliente_id, fazenda_id, talhao_id, cultura_id,
    data_vistoria, tipo_visita, objetivo_visita, safra, fase_fenologica,
    solicitacao_id, registro_origem_id, origem_atendimento,
    categoria_problema, nivel_pressao, percentual_area_afetada, urgencia,
    localizacao_na_area, observacoes_tecnicas, problema_principal,
    area_hectares, latitude, longitude,
    consultor_responsavel, created_by,
    natureza_registro, status, version, pdf_status
  ) VALUES (
    p_client_uuid,
    p_cliente_id, p_fazenda_id, p_talhao_id, p_cultura_id,
    p_data_vistoria, p_tipo_visita, p_objetivo_visita, p_safra, p_fase_fenologica,
    p_solicitacao_id, p_registro_origem_id, v_origem,
    p_categoria_problema, COALESCE(p_nivel_pressao,'medio'), p_percentual_area_afetada,
    COALESCE(p_urgencia,'media'),
    p_localizacao_na_area, p_observacoes_tecnicas, p_problema_principal,
    p_area_hectares, p_latitude, p_longitude,
    v_uid, v_uid,
    v_natureza, 'rascunho', 1, 'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'idempotent', false,
    'registro_id', v_new_id,
    'client_uuid', p_client_uuid,
    'status', 'rascunho',
    'origem', v_origem,
    'version', 1,
    'can_edit', true,
    'next_route', '/app/visita/' || v_new_id::text,
    'pdf_status', 'pending'
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM public.registros_consultor
      WHERE client_uuid = p_client_uuid
      LIMIT 1;
    IF FOUND THEN
      IF v_existing.consultor_responsavel <> v_uid
         AND NOT (public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor')) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
      END IF;
      RETURN jsonb_build_object(
        'ok', true, 'created', false, 'idempotent', true,
        'registro_id', v_existing.id,
        'client_uuid', v_existing.client_uuid,
        'status', v_existing.status::text,
        'origem', v_existing.origem_atendimento,
        'version', v_existing.version,
        'can_edit', v_existing.status IN ('rascunho','em_andamento','ajuste_solicitado','reprovado'),
        'next_route', '/app/visita/' || v_existing.id::text,
        'pdf_status', v_existing.pdf_status
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_criar_visita_idempotente(uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,text,text,text,numeric,numeric,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_criar_visita_idempotente(uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,text,text,text,numeric,numeric,numeric,uuid) TO authenticated;

-- ── C. Início de atendimento a partir de demanda (aceite atômico) ───────────
CREATE OR REPLACE FUNCTION public.rpc_iniciar_atendimento_solicitacao_v1(
  p_solicitacao_id uuid,
  p_client_uuid uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_s public.portal_solicitacoes%ROWTYPE;
  v_is_admin boolean;
  v_is_tech boolean;
  v_existing_id uuid;
  v_res jsonb;
  v_cuuid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  v_is_admin := public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor');
  v_is_tech := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role IN ('tecnico_agronomo','consultor_tecnico')
  );

  IF NOT (v_is_admin OR v_is_tech) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- Serializa a disputa pela mesma demanda
  PERFORM pg_advisory_xact_lock(hashtextextended('solic_atend:' || p_solicitacao_id::text, 0));

  SELECT * INTO v_s FROM public.portal_solicitacoes WHERE id = p_solicitacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_s.consultor_atribuido IS NOT NULL
     AND v_s.consultor_atribuido <> v_uid
     AND NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_assigned');
  END IF;

  IF NOT public.has_active_user_cliente_access(v_uid, v_s.cliente_id, ARRAY['execute','manage']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'technical_access_required');
  END IF;

  -- Visita já vinculada? devolve idempotente
  SELECT id INTO v_existing_id
    FROM public.registros_consultor
   WHERE solicitacao_id = p_solicitacao_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_s.consultor_atribuido IS NULL THEN
    UPDATE public.portal_solicitacoes
       SET consultor_atribuido = v_uid,
           status = CASE WHEN status IN ('pendente','aberta','em_triagem') THEN 'atribuida' ELSE status END,
           updated_at = now()
     WHERE id = p_solicitacao_id;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'ok', true, 'created', false, 'idempotent', true,
      'registro_id', r.id, 'status', r.status::text, 'version', r.version,
      'origem', r.origem_atendimento,
      'can_edit', r.status IN ('rascunho','em_andamento','ajuste_solicitado','reprovado'),
      'next_route', '/app/visita/' || r.id::text
    ) INTO v_res
    FROM public.registros_consultor r WHERE r.id = v_existing_id;
    RETURN v_res;
  END IF;

  v_cuuid := COALESCE(p_client_uuid, gen_random_uuid());

  v_res := public.rpc_criar_visita_idempotente(
    p_client_uuid := v_cuuid,
    p_cliente_id := v_s.cliente_id,
    p_fazenda_id := v_s.fazenda_id,
    p_talhao_id := v_s.talhao_id,
    p_cultura_id := NULL,
    p_data_vistoria := CURRENT_DATE,
    p_tipo_visita := 'vistoria_inicial',
    p_objetivo_visita := v_s.descricao,
    p_solicitacao_id := p_solicitacao_id,
    p_origem := 'solicitacao_produtor',
    p_urgencia := NULLIF(v_s.urgencia,'')::urgencia_consultor,
    p_problema_principal := v_s.descricao
  );

  IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN
    RETURN v_res;
  END IF;

  UPDATE public.portal_solicitacoes
     SET status = CASE WHEN status IN ('pendente','aberta','em_triagem','atribuida') THEN 'em_visita' ELSE status END,
         updated_at = now()
   WHERE id = p_solicitacao_id;

  INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
  VALUES (p_solicitacao_id, 'visita_iniciada', 'Atendimento técnico iniciado a partir da demanda', v_uid);

  RETURN v_res;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_iniciar_atendimento_solicitacao_v1(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_iniciar_atendimento_solicitacao_v1(uuid,uuid) TO authenticated;

-- ── D. Listagem única do workspace de atendimentos ──────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_listar_atendimentos_tecnicos_v1(
  p_aba text DEFAULT 'todos',
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_tech boolean;
  v_page integer := GREATEST(COALESCE(p_page,1),1);
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size,20),1),100);
  v_aba text := COALESCE(NULLIF(p_aba,''),'todos');
  v_q text := NULLIF(btrim(COALESCE(p_search,'')),'');
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('items','[]'::jsonb,'total',0,'page',v_page,'page_size',v_size,'has_more',false);
  END IF;

  v_is_admin := public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor');
  v_is_tech := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role IN ('tecnico_agronomo','consultor_tecnico')
  );

  IF NOT (v_is_admin OR v_is_tech) THEN
    RETURN jsonb_build_object('items','[]'::jsonb,'total',0,'page',v_page,'page_size',v_size,'has_more',false);
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _tmp_atend (
    kind text, id uuid, codigo text, titulo text, status text, origem text,
    cliente_nome text, fazenda_nome text, talhao_nome text, cultura_nome text,
    tipo text, urgencia text, data_ref timestamptz, can_edit boolean,
    next_route text, bucket text
  ) ON COMMIT DROP;
  DELETE FROM _tmp_atend;

  -- Visitas/ocorrências visíveis ao usuário
  INSERT INTO _tmp_atend
  SELECT
    'visita',
    r.id,
    r.codigo_visita,
    COALESCE(NULLIF(r.objetivo_visita,''), NULLIF(r.problema_principal,''), 'Atendimento técnico'),
    r.status::text,
    r.origem_atendimento,
    c.nome, f.nome, t.nome, cu.nome,
    r.tipo_visita::text,
    r.urgencia::text,
    COALESCE(r.data_vistoria::timestamptz, r.created_at),
    (r.status IN ('rascunho','em_andamento','ajuste_solicitado','reprovado')
      AND public.can_manage_technical_visit(v_uid, r.id)),
    '/app/visita/' || r.id::text,
    CASE
      WHEN r.status IN ('rascunho','em_andamento') THEN 'andamento'
      WHEN r.status IN ('enviado_aprovacao','ajuste_solicitado','reprovado') THEN 'aguardando'
      WHEN r.status IN ('aprovado','convertido_os') AND r.data_proxima_visita IS NOT NULL THEN 'monitoramento'
      ELSE 'concluidos'
    END
  FROM public.registros_consultor r
  LEFT JOIN public.clientes c ON c.id = r.cliente_id
  LEFT JOIN public.fazendas f ON f.id = r.fazenda_id
  LEFT JOIN public.talhoes  t ON t.id = r.talhao_id
  LEFT JOIN public.culturas cu ON cu.id = r.cultura_id
  WHERE public.can_view_technical_visit(v_uid, r.id)
    AND (v_q IS NULL OR (
      COALESCE(r.codigo_visita,'') ILIKE '%'||v_q||'%'
      OR COALESCE(r.objetivo_visita,'') ILIKE '%'||v_q||'%'
      OR COALESCE(r.problema_principal,'') ILIKE '%'||v_q||'%'
      OR COALESCE(c.nome,'') ILIKE '%'||v_q||'%'
      OR COALESCE(f.nome,'') ILIKE '%'||v_q||'%'
    ));

  -- Demandas sem visita vinculada: apenas atribuídas a mim (ou admin/gestor)
  INSERT INTO _tmp_atend
  SELECT
    'demanda',
    s.id,
    s.numero_solicitacao,
    COALESCE(NULLIF(s.descricao,''), s.tipo_demanda::text, 'Demanda do produtor'),
    s.status,
    'solicitacao_produtor',
    c.nome, f.nome, t.nome, NULL,
    s.tipo_demanda::text,
    s.urgencia,
    COALESCE(s.data_prevista_atendimento, s.created_at),
    true,
    '/app/atendimentos?demanda=' || s.id::text,
    'demandas'
  FROM public.portal_solicitacoes s
  LEFT JOIN public.clientes c ON c.id = s.cliente_id
  LEFT JOIN public.fazendas f ON f.id = s.fazenda_id
  LEFT JOIN public.talhoes  t ON t.id = s.talhao_id
  WHERE s.status NOT IN ('concluida','cancelada')
    AND NOT EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.solicitacao_id = s.id)
    AND (v_is_admin OR s.consultor_atribuido = v_uid)
    AND (v_q IS NULL OR (
      COALESCE(s.numero_solicitacao,'') ILIKE '%'||v_q||'%'
      OR COALESCE(s.descricao,'') ILIKE '%'||v_q||'%'
      OR COALESCE(c.nome,'') ILIKE '%'||v_q||'%'
      OR COALESCE(f.nome,'') ILIKE '%'||v_q||'%'
    ));

  SELECT count(*) INTO v_total FROM _tmp_atend a
   WHERE v_aba = 'todos'
      OR (v_aba = 'ocorrencias' AND a.kind='visita' AND a.origem = 'ocorrencia_campo')
      OR (v_aba = a.bucket);

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.data_ref DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT * FROM _tmp_atend a
     WHERE v_aba = 'todos'
        OR (v_aba = 'ocorrencias' AND a.kind='visita' AND a.origem = 'ocorrencia_campo')
        OR (v_aba = a.bucket)
     ORDER BY a.data_ref DESC
     LIMIT v_size OFFSET (v_page-1)*v_size
  ) x;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_size,
    'has_more', (v_page * v_size) < v_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_listar_atendimentos_tecnicos_v1(text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_listar_atendimentos_tecnicos_v1(text,text,integer,integer) TO authenticated;

-- ── E. Resumo do painel técnico ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_resumo_atendimentos_tecnicos_v1()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_tech boolean;
  v_demandas int := 0; v_andamento int := 0; v_aguardando int := 0;
  v_monitoramento int := 0; v_ocorrencias int := 0; v_concluidos int := 0;
  v_os int := 0; v_fazendas int := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  v_is_admin := public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor');
  v_is_tech := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role IN ('tecnico_agronomo','consultor_tecnico')
  );
  IF NOT (v_is_admin OR v_is_tech) THEN RETURN '{}'::jsonb; END IF;

  SELECT count(*) INTO v_demandas
    FROM public.portal_solicitacoes s
   WHERE s.status NOT IN ('concluida','cancelada')
     AND NOT EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.solicitacao_id = s.id)
     AND (v_is_admin OR s.consultor_atribuido = v_uid);

  SELECT
    count(*) FILTER (WHERE r.status IN ('rascunho','em_andamento')),
    count(*) FILTER (WHERE r.status IN ('enviado_aprovacao','ajuste_solicitado','reprovado')),
    count(*) FILTER (WHERE r.status IN ('aprovado','convertido_os') AND r.data_proxima_visita IS NOT NULL),
    count(*) FILTER (WHERE r.origem_atendimento = 'ocorrencia_campo'),
    count(*) FILTER (WHERE r.status IN ('aprovado','convertido_os','arquivado'))
  INTO v_andamento, v_aguardando, v_monitoramento, v_ocorrencias, v_concluidos
  FROM public.registros_consultor r
  WHERE public.can_view_technical_visit(v_uid, r.id);

  SELECT count(*) INTO v_os
    FROM public.ordens_servico o
   WHERE o.status NOT IN ('finalizada','entregue')
     AND (v_is_admin OR o.created_by = v_uid);

  SELECT count(*) INTO v_fazendas FROM public.fazendas;

  RETURN jsonb_build_object(
    'demandas', v_demandas,
    'em_andamento', v_andamento,
    'aguardando', v_aguardando,
    'monitoramento', v_monitoramento,
    'ocorrencias', v_ocorrencias,
    'concluidos', v_concluidos,
    'os_ativas', v_os,
    'fazendas', v_fazendas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_resumo_atendimentos_tecnicos_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_resumo_atendimentos_tecnicos_v1() TO authenticated;
