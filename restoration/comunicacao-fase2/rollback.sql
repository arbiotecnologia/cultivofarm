-- Rollback Fase 2 — remove exclusivamente objetos criados pela Fase 2.
-- NÃO toca em objetos da Fase 1.
BEGIN;

-- Triggers primeiro (dependem das funções trg)
DROP TRIGGER IF EXISTS trg_comunicacao_os_pronto_retirada        ON public.ordens_servico;
DROP TRIGGER IF EXISTS trg_comunicacao_os_onfarm_pronto_retirada ON public.ordens_servico_onfarm;

-- Funções trg
DROP FUNCTION IF EXISTS public._comunicacao_trg_os_pronto_retirada();
DROP FUNCTION IF EXISTS public._comunicacao_trg_os_onfarm_pronto_retirada();

-- Publicação por sistema e expansão
DROP FUNCTION IF EXISTS public._comunicacao_publish_system_event(text,text,uuid,jsonb,text);
DROP FUNCTION IF EXISTS public._comunicacao_expand_event(uuid,text,uuid,jsonb);

-- RPCs novas
DROP FUNCTION IF EXISTS public.rpc_set_communication_template_metadata(uuid,text,text,jsonb);
DROP FUNCTION IF EXISTS public.rpc_preview_administrative_broadcast_count(public.app_role);
DROP FUNCTION IF EXISTS public.rpc_resolve_outbox_address(uuid);
DROP FUNCTION IF EXISTS public.rpc_skip_communication_delivery(uuid,text,text);
DROP FUNCTION IF EXISTS public.rpc_cancel_communication_delivery(uuid,text,text);
DROP FUNCTION IF EXISTS public.rpc_create_portal_notification_secure(uuid,text,text,text);
DROP FUNCTION IF EXISTS public.rpc_create_operational_notification_secure(uuid,text,text,text,text);

-- Constraints e colunas de metadados. Só remove se estiver seguro
-- de que nenhum template ativo depende delas.
ALTER TABLE public.comunicacao_templates
  DROP CONSTRAINT IF EXISTS comunicacao_templates_email_assunto_chk,
  DROP CONSTRAINT IF EXISTS comunicacao_templates_whatsapp_meta_chk,
  DROP CONSTRAINT IF EXISTS comunicacao_templates_non_whatsapp_meta_chk;

ALTER TABLE public.comunicacao_templates
  DROP COLUMN IF EXISTS provider_template_name,
  DROP COLUMN IF EXISTS language_code,
  DROP COLUMN IF EXISTS parameter_mapping;

-- Restaura o _comunicacao_build_snapshot da Fase 1 (versão sem UNION on-farm).
-- Se você quer manter a versão ampliada, comente este bloco.
CREATE OR REPLACE FUNCTION public._comunicacao_build_snapshot(
  _event_key text, _source_id uuid, _payload jsonb,
  _user_id uuid, _cliente_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo_os text; v_data_prevista text;
  v_nome_dest text; v_titulo text; v_mensagem text; v_target_role text;
BEGIN
  IF _user_id IS NOT NULL THEN
    SELECT nome INTO v_nome_dest FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  ELSIF _cliente_id IS NOT NULL THEN
    SELECT nome INTO v_nome_dest FROM public.clientes WHERE id = _cliente_id LIMIT 1;
  END IF;
  IF _event_key IN ('produto_pronto_retirada','produto_pronto_aplicacao') THEN
    SELECT o.numero_os, to_char(o.data_programada, 'DD/MM/YYYY')
      INTO v_codigo_os, v_data_prevista
      FROM public.ordens_servico o WHERE o.id = _source_id;
    RETURN jsonb_build_object(
      'nome_destinatario', COALESCE(v_nome_dest,''),
      'codigo_os', COALESCE(v_codigo_os,''),
      'data_prevista', COALESCE(v_data_prevista,''));
  END IF;
  IF _event_key = 'administrative_important_update' THEN
    v_titulo := left(COALESCE(_payload ->> 'titulo',''), 200);
    v_mensagem := left(COALESCE(_payload ->> 'mensagem',''), 2000);
    v_target_role := _payload ->> 'target_role';
    RETURN jsonb_build_object(
      'nome_destinatario', COALESCE(v_nome_dest,''),
      'titulo', v_titulo,
      'mensagem', v_mensagem,
      'target_role', COALESCE(v_target_role,''));
  END IF;
  RETURN '{}'::jsonb;
END$$;
REVOKE ALL ON FUNCTION public._comunicacao_build_snapshot(text,uuid,jsonb,uuid,uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
