-- ============================================================================
-- MIGRATION CANÔNICA — Fluxo unificado de atendimento técnico (visitas)
-- Substitui integralmente as migrations intermediárias staging-only que usavam
-- pg_get_functiondef + replace/regexp_replace. Nenhum patch textual aqui:
-- todas as definições são CREATE OR REPLACE completos e idempotentes.
-- Forward-only. Não altera dados.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) is_visit_responsible — autorização correta
--    Responsável = consultor_responsavel (user_id) OU created_by (user_id)
--    OU consultor_profile_id pertencente ao profile do user_id.
--    A comparação consultor_profile_id = p_user_id (profile.id vs auth user id)
--    era logicamente incorreta e foi REMOVIDA.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_visit_responsible(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM public.registros_consultor r
     WHERE r.id = p_registro_id
       AND (
         r.consultor_responsavel = p_user_id
         OR r.created_by = p_user_id
         OR r.consultor_profile_id IN (
              SELECT pr.id FROM public.profiles pr WHERE pr.user_id = p_user_id
            )
       )
  )
$function$;

-- ----------------------------------------------------------------------------
-- 2) rpc_criar_visita_idempotente — motor único de criação
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_criar_visita_idempotente(
  p_client_uuid uuid,
  p_cliente_id uuid,
  p_fazenda_id uuid,
  p_talhao_id uuid,
  p_cultura_id uuid DEFAULT NULL::uuid,
  p_data_vistoria date DEFAULT CURRENT_DATE,
  p_tipo_visita tipo_visita DEFAULT 'vistoria_inicial'::tipo_visita,
  p_objetivo_visita text DEFAULT NULL::text,
  p_safra text DEFAULT NULL::text,
  p_fase_fenologica text DEFAULT NULL::text,
  p_solicitacao_id uuid DEFAULT NULL::uuid,
  p_origem text DEFAULT 'visita_avulsa'::text,
  p_categoria_problema categoria_problema_consultor DEFAULT NULL::categoria_problema_consultor,
  p_nivel_pressao nivel_pressao DEFAULT NULL::nivel_pressao,
  p_percentual_area_afetada numeric DEFAULT NULL::numeric,
  p_urgencia urgencia_consultor DEFAULT NULL::urgencia_consultor,
  p_localizacao_na_area text DEFAULT NULL::text,
  p_observacoes_tecnicas text DEFAULT NULL::text,
  p_problema_principal text DEFAULT NULL::text,
  p_area_hectares numeric DEFAULT NULL::numeric,
  p_latitude numeric DEFAULT NULL::numeric,
  p_longitude numeric DEFAULT NULL::numeric,
  p_registro_origem_id uuid DEFAULT NULL::uuid
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
  v_cultura uuid := p_cultura_id;
  v_safra text := p_safra;
  v_missing text[] := ARRAY[]::text[];
  c_cultura_opcional constant text[] := ARRAY['ocorrencia_campo','solicitacao_produtor'];
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
      'cultura_id', v_existing.cultura_id,
      'missing_fields', CASE WHEN v_existing.cultura_id IS NULL
                             THEN jsonb_build_array('cultura_id') ELSE '[]'::jsonb END,
      'next_step', CASE WHEN v_existing.cultura_id IS NULL THEN 'identificacao' ELSE 'continuar' END,
      'can_edit', v_existing.status IN ('rascunho','em_andamento','reprovado'),
      'next_route', '/app/visita/' || v_existing.id::text,
      'pdf_status', v_existing.pdf_status
    );
  END IF;

  IF NOT public.has_active_user_cliente_access(v_uid, p_cliente_id, ARRAY['execute','manage']) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'technical_access_required');
  END IF;

  SELECT cliente_id INTO v_fazenda_cliente FROM public.fazendas WHERE id = p_fazenda_id;
  IF v_fazenda_cliente IS NULL OR v_fazenda_cliente <> p_cliente_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_farm');
  END IF;

  SELECT fazenda_id INTO v_talhao_fazenda FROM public.talhoes WHERE id = p_talhao_id;
  IF v_talhao_fazenda IS NULL OR v_talhao_fazenda <> p_fazenda_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_plot');
  END IF;

  IF v_cultura IS NULL THEN
    WITH cand AS (
      SELECT DISTINCT ts.cultura_id, ts.safra
        FROM public.talhao_safras ts
       WHERE ts.talhao_id = p_talhao_id
         AND ts.cultura_id IS NOT NULL
         AND COALESCE(ts.status,'ativa') IN ('ativa','em_andamento','plantada')
    )
    SELECT c.cultura_id, c.safra
      INTO v_cultura, v_safra
      FROM cand c
     WHERE (SELECT count(*) FROM cand) = 1;

    IF NOT FOUND THEN
      v_cultura := NULL;
      v_safra := p_safra;
    END IF;
  END IF;

  IF v_cultura IS NULL AND NOT (v_origem = ANY (c_cultura_opcional)) THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'invalid_request',
      'missing_fields', jsonb_build_array('cultura_id'),
      'next_step', 'identificacao'
    );
  END IF;

  IF v_cultura IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.culturas WHERE id = v_cultura) THEN
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

  IF v_cultura IS NULL THEN
    v_missing := array_append(v_missing, 'cultura_id');
  END IF;

  INSERT INTO public.registros_consultor (
    client_uuid,
    cliente_id, fazenda_id, talhao_id, cultura_id,
    data_vistoria, tipo_visita, objetivo_visita, safra, fase_fenologica,
    solicitacao_id, registro_origem_id, origem_atendimento,
    categoria_problema, nivel_pressao, percentual_area_afetada, urgencia,
    localizacao_na_area, observacoes_tecnicas, problema_principal,
    area_hectares, latitude, longitude,
    consultor_responsavel, consultor_profile_id, created_by,
    natureza_registro, status, version, pdf_status
  ) VALUES (
    p_client_uuid,
    p_cliente_id, p_fazenda_id, p_talhao_id, v_cultura,
    p_data_vistoria, p_tipo_visita, p_objetivo_visita, v_safra, p_fase_fenologica,
    p_solicitacao_id, p_registro_origem_id, v_origem,
    p_categoria_problema, COALESCE(p_nivel_pressao,'medio'), p_percentual_area_afetada,
    COALESCE(p_urgencia,'media'),
    p_localizacao_na_area, p_observacoes_tecnicas, p_problema_principal,
    p_area_hectares, p_latitude, p_longitude,
    v_uid, (SELECT pr.id FROM public.profiles pr WHERE pr.user_id = v_uid LIMIT 1), v_uid,
    v_natureza, 'rascunho', 1, 'pending'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true, 'created', true, 'idempotent', false,
    'registro_id', v_new_id,
    'client_uuid', p_client_uuid,
    'status', 'rascunho',
    'origem', v_origem,
    'version', 1,
    'cultura_id', v_cultura,
    'missing_fields', to_jsonb(v_missing),
    'next_step', CASE WHEN array_length(v_missing,1) IS NULL THEN 'continuar' ELSE 'identificacao' END,
    'can_edit', true,
    'next_route', '/app/visita/' || v_new_id::text,
    'pdf_status', 'pending'
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM public.registros_consultor WHERE client_uuid = p_client_uuid LIMIT 1;
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
        'cultura_id', v_existing.cultura_id,
        'missing_fields', CASE WHEN v_existing.cultura_id IS NULL
                               THEN jsonb_build_array('cultura_id') ELSE '[]'::jsonb END,
        'next_step', CASE WHEN v_existing.cultura_id IS NULL THEN 'identificacao' ELSE 'continuar' END,
        'can_edit', v_existing.status IN ('rascunho','em_andamento','reprovado'),
        'next_route', '/app/visita/' || v_existing.id::text,
        'pdf_status', v_existing.pdf_status
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_conflict');
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3) rpc_iniciar_atendimento_solicitacao_v1 — aceite da demanda
--    Removida a referência ao status inexistente 'ajuste_solicitado'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_iniciar_atendimento_solicitacao_v1(
  p_solicitacao_id uuid,
  p_client_uuid uuid DEFAULT NULL::uuid
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

  SELECT id INTO v_existing_id
    FROM public.registros_consultor
   WHERE solicitacao_id = p_solicitacao_id
   ORDER BY created_at DESC LIMIT 1;

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
      'cultura_id', r.cultura_id,
      'missing_fields', CASE WHEN r.cultura_id IS NULL THEN jsonb_build_array('cultura_id') ELSE '[]'::jsonb END,
      'next_step', CASE WHEN r.cultura_id IS NULL THEN 'identificacao' ELSE 'continuar' END,
      'can_edit', r.status IN ('rascunho','em_andamento','reprovado'),
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

-- ----------------------------------------------------------------------------
-- 4) rpc_listar_atendimentos_tecnicos_v1 — listagem paginada (relacional pura)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_listar_atendimentos_tecnicos_v1(
  p_aba text DEFAULT 'todos'::text,
  p_search text DEFAULT NULL::text,
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
  v_aba text := lower(COALESCE(NULLIF(btrim(p_aba),''),'todos'));
  v_q text := NULLIF(btrim(COALESCE(p_search,'')),'');
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
  c_abas constant text[] := ARRAY['todos','demandas','ocorrencias','andamento','aguardando','monitoramento','concluidos'];
BEGIN
  IF NOT (v_aba = ANY (c_abas)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_tab',
      'items','[]'::jsonb,'total',0,'page',v_page,'page_size',v_size,'has_more',false);
  END IF;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error','unauthenticated',
      'items','[]'::jsonb,'total',0,'page',v_page,'page_size',v_size,'has_more',false);
  END IF;

  v_is_admin := public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor');
  v_is_tech := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role IN ('tecnico_agronomo','consultor_tecnico')
  );

  IF NOT (v_is_admin OR v_is_tech) THEN
    RETURN jsonb_build_object('ok', false, 'error','forbidden',
      'items','[]'::jsonb,'total',0,'page',v_page,'page_size',v_size,'has_more',false);
  END IF;

  WITH base AS (
    SELECT
      'visita'::text AS kind,
      r.id,
      r.codigo_visita AS codigo,
      COALESCE(NULLIF(r.objetivo_visita,''), NULLIF(r.problema_principal,''), 'Atendimento técnico') AS titulo,
      r.status::text AS status,
      r.origem_atendimento AS origem,
      c.nome AS cliente_nome,
      f.nome AS fazenda_nome,
      t.nome AS talhao_nome,
      cu.nome AS cultura_nome,
      r.tipo_visita::text AS tipo,
      r.urgencia::text AS urgencia,
      pr.nome AS responsavel_nome,
      r.data_proxima_visita::timestamptz AS data_prevista,
      CASE
        WHEN r.status = 'rascunho' AND r.cultura_id IS NULL THEN 'Informar cultura'
        WHEN r.status IN ('rascunho','em_andamento') THEN 'Continuar preenchimento'
        WHEN r.status = 'enviado_aprovacao' THEN 'Aguardando aprovação'
        WHEN r.status = 'reprovado' THEN 'Revisar e reenviar'
        WHEN r.status IN ('aprovado','convertido_os') AND r.data_proxima_visita IS NOT NULL THEN 'Retorno programado'
        ELSE 'Sem ação pendente'
      END AS proxima_acao,
      COALESCE(r.data_vistoria::timestamptz, r.created_at) AS data_ref,
      (r.status IN ('rascunho','em_andamento','reprovado')
        AND public.can_manage_technical_visit(v_uid, r.id)) AS can_edit,
      '/app/visita/' || r.id::text AS next_route,
      CASE
        WHEN r.status IN ('rascunho','em_andamento') THEN 'andamento'
        WHEN r.status IN ('enviado_aprovacao','reprovado') THEN 'aguardando'
        WHEN r.status IN ('aprovado','convertido_os') AND r.data_proxima_visita IS NOT NULL THEN 'monitoramento'
        ELSE 'concluidos'
      END AS bucket
    FROM public.registros_consultor r
    LEFT JOIN public.clientes c  ON c.id = r.cliente_id
    LEFT JOIN public.fazendas f  ON f.id = r.fazenda_id
    LEFT JOIN public.talhoes  t  ON t.id = r.talhao_id
    LEFT JOIN public.culturas cu ON cu.id = r.cultura_id
    LEFT JOIN public.profiles pr ON pr.user_id = r.consultor_responsavel
    WHERE public.can_view_technical_visit(v_uid, r.id)
      AND (v_q IS NULL OR (
        COALESCE(r.codigo_visita,'') ILIKE '%'||v_q||'%'
        OR COALESCE(r.objetivo_visita,'') ILIKE '%'||v_q||'%'
        OR COALESCE(r.problema_principal,'') ILIKE '%'||v_q||'%'
        OR COALESCE(c.nome,'') ILIKE '%'||v_q||'%'
        OR COALESCE(f.nome,'') ILIKE '%'||v_q||'%'
      ))

    UNION ALL

    SELECT
      'demanda'::text,
      s.id,
      s.numero_solicitacao,
      COALESCE(NULLIF(s.descricao,''), s.tipo_demanda, 'Demanda do produtor'),
      s.status,
      'solicitacao_produtor',
      c.nome, f.nome, t.nome, NULL::text,
      s.tipo_demanda,
      s.urgencia,
      pr.nome,
      s.data_prevista_atendimento,
      'Abrir atendimento'::text,
      COALESCE(s.data_prevista_atendimento, s.created_at),
      true,
      '/app/atendimentos?demanda=' || s.id::text,
      'demandas'
    FROM public.portal_solicitacoes s
    LEFT JOIN public.clientes c  ON c.id = s.cliente_id
    LEFT JOIN public.fazendas f  ON f.id = s.fazenda_id
    LEFT JOIN public.talhoes  t  ON t.id = s.talhao_id
    LEFT JOIN public.profiles pr ON pr.user_id = s.consultor_atribuido
    WHERE s.status NOT IN ('concluida','cancelada')
      AND NOT EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.solicitacao_id = s.id)
      AND (v_is_admin OR s.consultor_atribuido = v_uid)
      AND (v_q IS NULL OR (
        COALESCE(s.numero_solicitacao,'') ILIKE '%'||v_q||'%'
        OR COALESCE(s.descricao,'') ILIKE '%'||v_q||'%'
        OR COALESCE(c.nome,'') ILIKE '%'||v_q||'%'
        OR COALESCE(f.nome,'') ILIKE '%'||v_q||'%'
      ))
  ),
  filtrado AS (
    SELECT * FROM base b
     WHERE v_aba = 'todos'
        OR (v_aba = 'ocorrencias' AND b.kind = 'visita' AND b.origem = 'ocorrencia_campo')
        OR (v_aba <> 'ocorrencias' AND v_aba = b.bucket)
  ),
  contagem AS (SELECT count(*) AS n FROM filtrado),
  pagina AS (
    SELECT * FROM filtrado ORDER BY data_ref DESC NULLS LAST LIMIT v_size OFFSET (v_page-1)*v_size
  )
  SELECT (SELECT n FROM contagem),
         COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.data_ref DESC NULLS LAST) FROM pagina p), '[]'::jsonb)
    INTO v_total, v_items;

  RETURN jsonb_build_object(
    'ok', true,
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_size,
    'has_more', (v_page * v_size) < v_total
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 5) rpc_resumo_atendimentos_tecnicos_v1 — resumo coerente com a listagem
-- ----------------------------------------------------------------------------
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
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error','unauthenticated');
  END IF;

  v_is_admin := public.has_role(v_uid,'administrador') OR public.has_role(v_uid,'gestor');
  v_is_tech := EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid AND ur.role IN ('tecnico_agronomo','consultor_tecnico')
  );
  IF NOT (v_is_admin OR v_is_tech) THEN
    RETURN jsonb_build_object('ok', false, 'error','forbidden');
  END IF;

  WITH visitas AS (
    SELECT r.id, r.status::text AS status, r.origem_atendimento AS origem,
           r.data_proxima_visita, r.fazenda_id
      FROM public.registros_consultor r
     WHERE public.can_view_technical_visit(v_uid, r.id)
  ),
  demandas AS (
    SELECT s.id
      FROM public.portal_solicitacoes s
     WHERE s.status NOT IN ('concluida','cancelada')
       AND NOT EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.solicitacao_id = s.id)
       AND (v_is_admin OR s.consultor_atribuido = v_uid)
  )
  SELECT jsonb_build_object(
    'ok', true,
    'demandas', (SELECT count(*) FROM demandas),
    'em_andamento', (SELECT count(*) FROM visitas WHERE status IN ('rascunho','em_andamento')),
    'aguardando', (SELECT count(*) FROM visitas WHERE status IN ('enviado_aprovacao','reprovado')),
    'monitoramento', (SELECT count(*) FROM visitas WHERE status IN ('aprovado','convertido_os') AND data_proxima_visita IS NOT NULL),
    'ocorrencias', (SELECT count(*) FROM visitas WHERE origem = 'ocorrencia_campo'),
    'concluidos', (SELECT count(*) FROM visitas
                    WHERE status NOT IN ('rascunho','em_andamento','enviado_aprovacao','reprovado')
                      AND NOT (status IN ('aprovado','convertido_os') AND data_proxima_visita IS NOT NULL)),
    'todos', (SELECT count(*) FROM visitas) + (SELECT count(*) FROM demandas),
    'os_ativas', (SELECT count(*) FROM public.ordens_servico_onfarm os
                   WHERE os.status NOT IN ('finalizada','entregue','cancelada')
                     AND os.registro_consultor_id IN (SELECT id FROM visitas)),
    'fazendas', (SELECT count(DISTINCT fazenda_id) FROM visitas WHERE fazenda_id IS NOT NULL)
  ) INTO v_res;

  RETURN v_res;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 6) Grants canônicos — somente authenticated; anon/PUBLIC sem EXECUTE
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.rpc_criar_visita_idempotente(uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,text,text,text,numeric,numeric,numeric,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_iniciar_atendimento_solicitacao_v1(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_listar_atendimentos_tecnicos_v1(text,text,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_resumo_atendimentos_tecnicos_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_visit_responsible(uuid,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.rpc_criar_visita_idempotente(uuid,uuid,uuid,uuid,uuid,date,tipo_visita,text,text,text,uuid,text,categoria_problema_consultor,nivel_pressao,numeric,urgencia_consultor,text,text,text,numeric,numeric,numeric,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_iniciar_atendimento_solicitacao_v1(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_listar_atendimentos_tecnicos_v1(text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_resumo_atendimentos_tecnicos_v1() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_visit_responsible(uuid,uuid) TO authenticated;