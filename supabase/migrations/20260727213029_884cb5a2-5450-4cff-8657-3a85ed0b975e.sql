
-- Reaplicação: snapshot v2 já foi corrigido no attempt anterior; reafirmar idempotente.
CREATE OR REPLACE FUNCTION public._comunicacao_build_snapshot_v2(
  _event_key text, _source_type text, _source_id uuid, _payload jsonb,
  _user_id uuid, _cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_codigo_os text; v_data_prevista text; v_nome_dest text;
  v_titulo text; v_mensagem text; v_target_role text;
  v_sol RECORD;
BEGIN
  IF _event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao','administrative_important_update') THEN
    IF _user_id IS NOT NULL THEN
      SELECT nome INTO v_nome_dest FROM public.profiles WHERE user_id = _user_id LIMIT 1;
    ELSIF _cliente_id IS NOT NULL THEN
      SELECT nome INTO v_nome_dest FROM public.clientes WHERE id = _cliente_id LIMIT 1;
    END IF;
  END IF;
  IF _event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    IF _source_type NOT IN ('ordens_servico','ordens_servico_onfarm') THEN
      RAISE EXCEPTION 'source_type inválido: %', _source_type; END IF;
    CASE _source_type
      WHEN 'ordens_servico' THEN
        SELECT o.numero_os, to_char(o.data_programada,'DD/MM/YYYY')
          INTO v_codigo_os, v_data_prevista FROM public.ordens_servico o WHERE o.id = _source_id;
      WHEN 'ordens_servico_onfarm' THEN
        SELECT o.numero_os, to_char(o.data_recomendada,'DD/MM/YYYY')
          INTO v_codigo_os, v_data_prevista FROM public.ordens_servico_onfarm o WHERE o.id = _source_id;
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
      INTO v_sol FROM public.portal_solicitacoes s WHERE s.id = _source_id;
    IF v_sol IS NULL THEN RETURN '{}'::jsonb; END IF;
    RETURN jsonb_build_object(
      'numero', COALESCE(v_sol.numero_solicitacao,''),
      'tipo_demanda', COALESCE(v_sol.tipo_demanda,''),
      'urgencia', COALESCE(v_sol.urgencia,''),
      'status_novo', COALESCE(v_sol.status,''),
      'solicitacao_id', _source_id::text);
  END IF;
  RETURN '{}'::jsonb;
END $function$;
REVOKE ALL ON FUNCTION public._comunicacao_build_snapshot_v2(text,text,uuid,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated;

-- Emitir v2 in_app corrigido (parameter_mapping como array vazio).
DO $do$
DECLARE
  r record;
  new_map jsonb := '[
    {"chave":"solic_admin_criada","corpo":"Nova solicitação {{numero}} registrada ({{tipo_demanda}}, urgência {{urgencia}}).","vars":["numero","tipo_demanda","urgencia"]},
    {"chave":"solic_admin_urgencia_critica","corpo":"Solicitação {{numero}} está em URGÊNCIA CRÍTICA. Ação imediata.","vars":["numero"]},
    {"chave":"solic_consultor_atribuida","corpo":"Solicitação {{numero}} atribuída a você ({{tipo_demanda}}, urgência {{urgencia}}).","vars":["numero","tipo_demanda","urgencia"]},
    {"chave":"solic_consultor_cancelada","corpo":"Solicitação {{numero}} atribuída a você foi cancelada.","vars":["numero"]},
    {"chave":"solic_produtor_criada","corpo":"Sua solicitação {{numero}} foi registrada. Status: {{status_novo}}.","vars":["numero","status_novo"]},
    {"chave":"solic_produtor_atribuida","corpo":"Sua solicitação {{numero}} foi atribuída a um consultor. Status: {{status_novo}}.","vars":["numero","status_novo"]},
    {"chave":"solic_produtor_checkin","corpo":"O consultor realizou check-in para atender sua solicitação {{numero}}.","vars":["numero"]},
    {"chave":"solic_produtor_em_visita","corpo":"O consultor iniciou o atendimento da sua solicitação {{numero}}.","vars":["numero"]},
    {"chave":"solic_produtor_aguardando_os","corpo":"Sua solicitação {{numero}} está aguardando geração de ordem de serviço.","vars":["numero"]},
    {"chave":"solic_produtor_concluida","corpo":"Sua solicitação {{numero}} foi concluída.","vars":["numero"]},
    {"chave":"solic_produtor_cancelada","corpo":"Sua solicitação {{numero}} foi cancelada.","vars":["numero"]}
  ]'::jsonb;
BEGIN
  FOR r IN SELECT elem FROM jsonb_array_elements(new_map) AS elem LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.comunicacao_templates
       WHERE chave = r.elem->>'chave' AND canal='in_app' AND versao=2
    ) THEN
      UPDATE public.comunicacao_templates
         SET status='archived', archived_at=now()
       WHERE chave = r.elem->>'chave' AND canal='in_app' AND versao=1 AND status='active';
      INSERT INTO public.comunicacao_templates(
        chave, nome, canal, versao, status, locale, assunto, corpo, variaveis, parameter_mapping)
      VALUES (
        r.elem->>'chave',
        (r.elem->>'chave') || ' (in_app v2)',
        'in_app', 2, 'active', 'pt-BR', NULL,
        r.elem->>'corpo',
        r.elem->'vars',
        '[]'::jsonb);
    END IF;
  END LOOP;
END $do$;

-- Drafts (idempotente).
UPDATE public.comunicacao_templates SET
  assunto = 'Nova solicitação — {{numero}}',
  corpo = 'Nova solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) registrada.',
  variaveis = '["numero","tipo_demanda","urgencia"]'::jsonb, updated_at = now()
 WHERE chave='solic_admin_criada' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'URGÊNCIA CRÍTICA — {{numero}}',
  corpo = 'Solicitação {{numero}} em urgência crítica. Ação imediata.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_admin_urgencia_critica' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'Nova atribuição — {{numero}}',
  corpo = 'A solicitação {{numero}} ({{tipo_demanda}}, urgência {{urgencia}}) foi atribuída a você.',
  variaveis = '["numero","tipo_demanda","urgencia"]'::jsonb, updated_at = now()
 WHERE chave='solic_consultor_atribuida' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'Atribuição cancelada — {{numero}}',
  corpo = 'A solicitação {{numero}} atribuída a você foi cancelada.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_consultor_cancelada' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'Solicitação {{numero}} registrada',
  corpo = 'Sua solicitação {{numero}} foi registrada. Status: {{status_novo}}.',
  variaveis = '["numero","status_novo"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_criada' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'Solicitação {{numero}} atribuída',
  corpo = 'Sua solicitação {{numero}} foi atribuída. Status: {{status_novo}}.',
  variaveis = '["numero","status_novo"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_atribuida' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'Consultor a caminho — {{numero}}',
  corpo = 'O consultor realizou check-in para atender sua solicitação {{numero}}.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_checkin' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'Atendimento iniciado — {{numero}}',
  corpo = 'O consultor iniciou o atendimento da sua solicitação {{numero}}.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_em_visita' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'Aguardando ordem de serviço — {{numero}}',
  corpo = 'Sua solicitação {{numero}} está aguardando geração de OS.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_aguardando_os' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'Solicitação {{numero}} concluída',
  corpo = 'Sua solicitação {{numero}} foi concluída.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_concluida' AND canal='email';
UPDATE public.comunicacao_templates SET
  assunto = 'Solicitação {{numero}} cancelada',
  corpo = 'Sua solicitação {{numero}} foi cancelada.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_cancelada' AND canal='email';
UPDATE public.comunicacao_templates SET
  corpo = 'AR Bio: sua solicitação {{numero}} foi atribuída a um consultor.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_atribuida' AND canal='whatsapp';
UPDATE public.comunicacao_templates SET
  corpo = 'AR Bio: consultor a caminho para atender sua solicitação {{numero}}.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_checkin' AND canal='whatsapp';
UPDATE public.comunicacao_templates SET
  corpo = 'AR Bio: sua solicitação {{numero}} foi concluída.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_concluida' AND canal='whatsapp';
UPDATE public.comunicacao_templates SET
  corpo = 'AR Bio: sua solicitação {{numero}} foi cancelada.',
  variaveis = '["numero"]'::jsonb, updated_at = now()
 WHERE chave='solic_produtor_cancelada' AND canal='whatsapp';
