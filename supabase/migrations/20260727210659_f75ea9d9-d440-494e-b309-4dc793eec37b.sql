
-- Subfase 1C — Templates + Regras + Estratégias para eventos solicitacao_*
-- Staging ikaauvsflpmamgxmkhoq. Aditivo/idempotente. Sem envio.

-- 1) CHECK de estratégia estendido
ALTER TABLE public.comunicacao_regras
  DROP CONSTRAINT IF EXISTS comunicacao_regras_estrategia_check;
ALTER TABLE public.comunicacao_regras
  DROP CONSTRAINT IF EXISTS comunicacao_regras_estrategia_chk;
ALTER TABLE public.comunicacao_regras
  ADD CONSTRAINT comunicacao_regras_estrategia_chk
  CHECK (estrategia = ANY (ARRAY[
    'by_role','source_participants','broadcast_role',
    'source_cliente','assigned_consultant'
  ]));

-- 2) Idempotência de regras via dois índices únicos parciais (evita cast de enum em expressão)
CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_regras_evt_canal_estr_tpl_np
  ON public.comunicacao_regras (event_key, canal, estrategia, template_chave)
  WHERE perfil IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_comunicacao_regras_evt_canal_estr_perfil_tpl_wp
  ON public.comunicacao_regras (event_key, canal, estrategia, perfil, template_chave)
  WHERE perfil IS NOT NULL;

-- 3) Resolver v2 estendido (source_cliente + assigned_consultant, fail-closed)
CREATE OR REPLACE FUNCTION public._comunicacao_resolve_recipients_v2(
  _event_key text, _rule public.comunicacao_regras, _source_type text, _source_id uuid
) RETURNS TABLE(recipient_user_id uuid, recipient_cliente_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_os_cliente uuid;
  v_sol RECORD;
BEGIN
  IF _event_key = 'administrative_important_update' THEN
    IF _rule.estrategia <> 'broadcast_role' OR _rule.perfil IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT DISTINCT pr.user_id, NULL::uuid
        FROM public.user_roles ur JOIN public.profiles pr ON pr.user_id = ur.user_id
       WHERE ur.role = _rule.perfil AND COALESCE(pr.ativo, true) = true;
    RETURN;
  END IF;

  IF _event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    IF _source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
      RAISE EXCEPTION 'source_type inválido: %', _source_type; END IF;
    CASE _source_type
      WHEN 'ordens_servico' THEN
        SELECT o.cliente_id INTO v_os_cliente FROM public.ordens_servico o WHERE o.id = _source_id;
      WHEN 'ordens_servico_onfarm' THEN
        SELECT o.cliente_id INTO v_os_cliente FROM public.ordens_servico_onfarm o WHERE o.id = _source_id;
    END CASE;
    IF v_os_cliente IS NULL THEN RETURN; END IF;
    IF _rule.estrategia = 'source_participants' THEN
      RETURN QUERY
        SELECT NULL::uuid, v_os_cliente
        UNION
        SELECT DISTINCT pr.user_id, NULL::uuid
          FROM public.profiles pr
         WHERE pr.cliente_id = v_os_cliente AND COALESCE(pr.ativo,true) = true;
      RETURN;
    ELSIF _rule.estrategia = 'by_role' THEN
      IF _rule.perfil IS NULL THEN RETURN; END IF;
      RETURN QUERY
        SELECT DISTINCT pr.user_id, NULL::uuid
          FROM public.user_roles ur JOIN public.profiles pr ON pr.user_id = ur.user_id
         WHERE ur.role = _rule.perfil AND pr.cliente_id = v_os_cliente
           AND COALESCE(pr.ativo,true) = true;
      RETURN;
    ELSE RETURN;
    END IF;
  END IF;

  IF _event_key IN (
    'solicitacao_criada','solicitacao_atribuida','solicitacao_checkin_realizado',
    'solicitacao_em_visita','solicitacao_aguardando_os','solicitacao_concluida',
    'solicitacao_cancelada','solicitacao_urgencia_critica'
  ) THEN
    IF _source_type <> 'portal_solicitacoes' THEN
      RAISE EXCEPTION 'source_type inválido: %', _source_type; END IF;
    SELECT s.cliente_id, s.consultor_atribuido INTO v_sol
      FROM public.portal_solicitacoes s WHERE s.id = _source_id;
    IF v_sol IS NULL THEN RETURN; END IF;

    IF _rule.estrategia = 'source_cliente' THEN
      IF v_sol.cliente_id IS NULL THEN RETURN; END IF;
      RETURN QUERY SELECT NULL::uuid, v_sol.cliente_id;
      RETURN;
    ELSIF _rule.estrategia = 'assigned_consultant' THEN
      IF v_sol.consultor_atribuido IS NULL THEN RETURN; END IF;
      RETURN QUERY
        SELECT pr.user_id, NULL::uuid
          FROM public.profiles pr
         WHERE pr.user_id = v_sol.consultor_atribuido
           AND COALESCE(pr.ativo, true) = true;
      RETURN;
    ELSIF _rule.estrategia = 'source_participants' THEN
      RETURN QUERY SELECT NULL::uuid, v_sol.cliente_id;
      IF v_sol.consultor_atribuido IS NOT NULL THEN
        RETURN QUERY SELECT v_sol.consultor_atribuido, NULL::uuid;
      END IF;
      RETURN;
    ELSIF _rule.estrategia = 'by_role' THEN
      IF _rule.perfil IS NULL THEN RETURN; END IF;
      IF _rule.perfil <> 'administrador'::public.app_role THEN RETURN; END IF;
      RETURN QUERY
        SELECT DISTINCT pr.user_id, NULL::uuid
          FROM public.user_roles ur
          JOIN public.profiles pr ON pr.user_id = ur.user_id
         WHERE ur.role = _rule.perfil
           AND COALESCE(pr.ativo,true) = true;
      RETURN;
    ELSE
      RETURN;
    END IF;
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public._comunicacao_resolve_recipients_v2(text, public.comunicacao_regras, text, uuid)
  FROM PUBLIC, anon, authenticated;

-- 4) Snapshot v2 estendido para solicitacao_*
CREATE OR REPLACE FUNCTION public._comunicacao_build_snapshot_v2(
  _event_key text, _source_type text, _source_id uuid, _payload jsonb,
  _user_id uuid, _cliente_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  v_codigo_os text; v_data_prevista text; v_nome_dest text;
  v_titulo text; v_mensagem text; v_target_role text;
  v_sol RECORD;
BEGIN
  IF _user_id IS NOT NULL THEN
    SELECT nome INTO v_nome_dest FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  ELSIF _cliente_id IS NOT NULL THEN
    SELECT nome INTO v_nome_dest FROM public.clientes WHERE id = _cliente_id LIMIT 1;
  END IF;

  IF _event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    IF _source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
      RAISE EXCEPTION 'source_type inválido: %', _source_type; END IF;
    CASE _source_type
      WHEN 'ordens_servico' THEN
        SELECT o.numero_os, to_char(o.data_programada,'DD/MM/YYYY')
          INTO v_codigo_os, v_data_prevista
          FROM public.ordens_servico o WHERE o.id = _source_id;
      WHEN 'ordens_servico_onfarm' THEN
        SELECT o.numero_os, to_char(o.data_recomendada,'DD/MM/YYYY')
          INTO v_codigo_os, v_data_prevista
          FROM public.ordens_servico_onfarm o WHERE o.id = _source_id;
    END CASE;
    RETURN jsonb_build_object(
      'nome_destinatario', COALESCE(v_nome_dest,''),
      'codigo_os', COALESCE(v_codigo_os,''),
      'data_prevista', COALESCE(v_data_prevista,''));
  END IF;

  IF _event_key = 'administrative_important_update' THEN
    v_titulo := left(COALESCE(_payload->>'titulo',''), 200);
    v_mensagem := left(COALESCE(_payload->>'mensagem',''), 2000);
    v_target_role := _payload->>'target_role';
    RETURN jsonb_build_object(
      'nome_destinatario', COALESCE(v_nome_dest,''),
      'titulo', v_titulo, 'mensagem', v_mensagem,
      'target_role', COALESCE(v_target_role,''));
  END IF;

  IF _event_key IN (
    'solicitacao_criada','solicitacao_atribuida','solicitacao_checkin_realizado',
    'solicitacao_em_visita','solicitacao_aguardando_os','solicitacao_concluida',
    'solicitacao_cancelada','solicitacao_urgencia_critica'
  ) THEN
    IF _source_type <> 'portal_solicitacoes' THEN
      RAISE EXCEPTION 'source_type inválido: %', _source_type; END IF;
    SELECT s.numero_solicitacao, s.tipo_demanda::text, s.urgencia::text, s.status::text
      INTO v_sol
      FROM public.portal_solicitacoes s WHERE s.id = _source_id;
    IF v_sol IS NULL THEN RETURN '{}'::jsonb; END IF;
    RETURN jsonb_build_object(
      'nome_destinatario', COALESCE(v_nome_dest,''),
      'numero', COALESCE(v_sol.numero_solicitacao,''),
      'tipo_demanda', COALESCE(v_sol.tipo_demanda,''),
      'urgencia', COALESCE(v_sol.urgencia,''),
      'status_novo', COALESCE(v_sol.status,''),
      'solicitacao_id', _source_id::text
    );
  END IF;

  RETURN '{}'::jsonb;
END $function$;

REVOKE ALL ON FUNCTION public._comunicacao_build_snapshot_v2(text, text, uuid, jsonb, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- 5) SEEDS — templates (26 linhas: 11 in_app active + 11 email draft + 4 whatsapp draft)
DO $seed$
DECLARE
  r RECORD;
  v_vars jsonb := '["nome_destinatario","numero","tipo_demanda","urgencia","status_novo","solicitacao_id"]'::jsonb;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('solic_produtor_criada','in_app','active',NULL,'Sua solicitação {{numero}} foi registrada ({{tipo_demanda}}, urgência {{urgencia}}). Acompanhe pelo portal.'),
      ('solic_produtor_atribuida','in_app','active',NULL,'Sua solicitação {{numero}} foi atribuída a um consultor. Status: {{status_novo}}.'),
      ('solic_produtor_checkin','in_app','active',NULL,'O consultor realizou check-in para atender sua solicitação {{numero}}.'),
      ('solic_produtor_em_visita','in_app','active',NULL,'O atendimento da sua solicitação {{numero}} está em andamento.'),
      ('solic_produtor_aguardando_os','in_app','active',NULL,'Sua solicitação {{numero}} está aguardando geração de ordem de serviço.'),
      ('solic_produtor_concluida','in_app','active',NULL,'Sua solicitação {{numero}} foi concluída.'),
      ('solic_produtor_cancelada','in_app','active',NULL,'Sua solicitação {{numero}} foi cancelada.'),
      ('solic_consultor_atribuida','in_app','active',NULL,'Solicitação {{numero}} atribuída a você ({{tipo_demanda}}, urgência {{urgencia}}).'),
      ('solic_consultor_cancelada','in_app','active',NULL,'Solicitação {{numero}} atribuída a você foi cancelada.'),
      ('solic_admin_criada','in_app','active',NULL,'Nova solicitação {{numero}} registrada ({{tipo_demanda}}, urgência {{urgencia}}).'),
      ('solic_admin_urgencia_critica','in_app','active',NULL,'Solicitação {{numero}} está em URGÊNCIA CRÍTICA. Ação imediata.'),
      ('solic_produtor_criada','email','draft','Solicitação {{numero}} registrada','Olá {{nome_destinatario}}, sua solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) foi registrada.'),
      ('solic_produtor_atribuida','email','draft','Solicitação {{numero}} atribuída','Olá {{nome_destinatario}}, sua solicitação {{numero}} foi atribuída. Status: {{status_novo}}.'),
      ('solic_produtor_checkin','email','draft','Consultor a caminho — {{numero}}','Olá {{nome_destinatario}}, o consultor realizou check-in para atender sua solicitação {{numero}}.'),
      ('solic_produtor_em_visita','email','draft','Atendimento em andamento — {{numero}}','Olá {{nome_destinatario}}, o atendimento da solicitação {{numero}} está em andamento.'),
      ('solic_produtor_aguardando_os','email','draft','Aguardando ordem de serviço — {{numero}}','Olá {{nome_destinatario}}, sua solicitação {{numero}} está aguardando geração de OS.'),
      ('solic_produtor_concluida','email','draft','Solicitação {{numero}} concluída','Olá {{nome_destinatario}}, sua solicitação {{numero}} foi concluída.'),
      ('solic_produtor_cancelada','email','draft','Solicitação {{numero}} cancelada','Olá {{nome_destinatario}}, sua solicitação {{numero}} foi cancelada.'),
      ('solic_consultor_atribuida','email','draft','Nova atribuição — {{numero}}','Olá {{nome_destinatario}}, a solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) foi atribuída a você.'),
      ('solic_consultor_cancelada','email','draft','Atribuição cancelada — {{numero}}','Olá {{nome_destinatario}}, a solicitação {{numero}} atribuída a você foi cancelada.'),
      ('solic_admin_criada','email','draft','Nova solicitação — {{numero}}','Nova solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) registrada.'),
      ('solic_admin_urgencia_critica','email','draft','URGÊNCIA CRÍTICA — {{numero}}','Solicitação {{numero}} em urgência crítica. Ação imediata.'),
      ('solic_produtor_atribuida','whatsapp','draft',NULL,'AR Bio: sua solicitação {{numero}} foi atribuída a um consultor.'),
      ('solic_produtor_checkin','whatsapp','draft',NULL,'AR Bio: consultor a caminho para atender sua solicitação {{numero}}.'),
      ('solic_produtor_concluida','whatsapp','draft',NULL,'AR Bio: sua solicitação {{numero}} foi concluída.'),
      ('solic_produtor_cancelada','whatsapp','draft',NULL,'AR Bio: sua solicitação {{numero}} foi cancelada.')
    ) AS t(chave, canal, status, assunto, corpo)
  LOOP
    INSERT INTO public.comunicacao_templates(
      chave, canal, versao, status, locale, nome, assunto, corpo, variaveis
    ) VALUES (
      r.chave, r.canal::public.comunicacao_canal, 1,
      r.status::public.comunicacao_template_status,
      'pt-BR', r.chave || ' (' || r.canal || ')', r.assunto, r.corpo, v_vars
    )
    ON CONFLICT (chave, canal, versao) DO NOTHING;
  END LOOP;
END $seed$;

-- 6) SEEDS — regras (todas enabled=false)
DO $rules$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('solicitacao_criada',              'in_app','source_cliente',      NULL::text,      'solic_produtor_criada',         100),
      ('solicitacao_atribuida',           'in_app','source_cliente',      NULL,            'solic_produtor_atribuida',      100),
      ('solicitacao_checkin_realizado',   'in_app','source_cliente',      NULL,            'solic_produtor_checkin',        100),
      ('solicitacao_em_visita',           'in_app','source_cliente',      NULL,            'solic_produtor_em_visita',      100),
      ('solicitacao_aguardando_os',       'in_app','source_cliente',      NULL,            'solic_produtor_aguardando_os',  100),
      ('solicitacao_concluida',           'in_app','source_cliente',      NULL,            'solic_produtor_concluida',      100),
      ('solicitacao_cancelada',           'in_app','source_cliente',      NULL,            'solic_produtor_cancelada',      100),
      ('solicitacao_atribuida',           'in_app','assigned_consultant', NULL,            'solic_consultor_atribuida',     110),
      ('solicitacao_cancelada',           'in_app','assigned_consultant', NULL,            'solic_consultor_cancelada',     110),
      ('solicitacao_criada',              'in_app','by_role',             'administrador', 'solic_admin_criada',            120),
      ('solicitacao_urgencia_critica',    'in_app','by_role',             'administrador', 'solic_admin_urgencia_critica',  120)
    ) AS t(event_key, canal, estrategia, perfil, template_chave, prioridade)
  LOOP
    IF r.perfil IS NULL THEN
      INSERT INTO public.comunicacao_regras(
        event_key, canal, estrategia, perfil, template_chave,
        template_versao, condicoes, prioridade, enabled, cooldown_seconds
      )
      SELECT r.event_key, r.canal::public.comunicacao_canal, r.estrategia,
             NULL, r.template_chave, 1, '{}'::jsonb, r.prioridade, false, 0
      WHERE NOT EXISTS (
        SELECT 1 FROM public.comunicacao_regras g
         WHERE g.event_key = r.event_key
           AND g.canal = r.canal::public.comunicacao_canal
           AND g.estrategia = r.estrategia
           AND g.template_chave = r.template_chave
           AND g.perfil IS NULL
      );
    ELSE
      INSERT INTO public.comunicacao_regras(
        event_key, canal, estrategia, perfil, template_chave,
        template_versao, condicoes, prioridade, enabled, cooldown_seconds
      )
      SELECT r.event_key, r.canal::public.comunicacao_canal, r.estrategia,
             r.perfil::public.app_role, r.template_chave, 1, '{}'::jsonb, r.prioridade, false, 0
      WHERE NOT EXISTS (
        SELECT 1 FROM public.comunicacao_regras g
         WHERE g.event_key = r.event_key
           AND g.canal = r.canal::public.comunicacao_canal
           AND g.estrategia = r.estrategia
           AND g.template_chave = r.template_chave
           AND g.perfil = r.perfil::public.app_role
      );
    END IF;
  END LOOP;
END $rules$;
