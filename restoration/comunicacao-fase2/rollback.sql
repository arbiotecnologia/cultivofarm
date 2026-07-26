-- Rollback Fase 2 v2 — remove exclusivamente objetos criados pela Fase 2.
-- NÃO toca em objetos da Fase 1.
BEGIN;

-- Triggers primeiro
DROP TRIGGER IF EXISTS trg_comunicacao_os_pronto_retirada        ON public.ordens_servico;
DROP TRIGGER IF EXISTS trg_comunicacao_os_onfarm_pronto_retirada ON public.ordens_servico_onfarm;

DROP FUNCTION IF EXISTS public._comunicacao_trg_os_pronto_retirada();
DROP FUNCTION IF EXISTS public._comunicacao_trg_os_onfarm_pronto_retirada();

-- Expansão/publicação system-side (v2 com source_type)
DROP FUNCTION IF EXISTS public._comunicacao_publish_system_event(text,text,uuid,jsonb,text);
DROP FUNCTION IF EXISTS public._comunicacao_expand_event(uuid,text,text,uuid,jsonb);
DROP FUNCTION IF EXISTS public._comunicacao_resolve_recipients_v2(text,public.comunicacao_regras,text,uuid);
DROP FUNCTION IF EXISTS public._comunicacao_build_snapshot_v2(text,text,uuid,jsonb,uuid,uuid);

-- RPCs novas
DROP FUNCTION IF EXISTS public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text);
DROP FUNCTION IF EXISTS public.rpc_set_communication_template_metadata(uuid,text,text,jsonb,text);
DROP FUNCTION IF EXISTS public.rpc_preview_administrative_broadcast_count(public.app_role);
DROP FUNCTION IF EXISTS public.rpc_resolve_outbox_address(uuid);
DROP FUNCTION IF EXISTS public.rpc_skip_communication_delivery(uuid,text,text);
DROP FUNCTION IF EXISTS public.rpc_cancel_communication_delivery(uuid,text,text);
DROP FUNCTION IF EXISTS public.rpc_defer_communication_delivery(uuid,text,text,integer);
DROP FUNCTION IF EXISTS public.rpc_fail_communication_delivery_v2(uuid,text,text,text,boolean);
DROP FUNCTION IF EXISTS public.rpc_dispatch_inapp_notification(uuid,uuid,uuid,text,text);
DROP FUNCTION IF EXISTS public.rpc_create_portal_notification_secure(uuid,text,text,text);
DROP FUNCTION IF EXISTS public.rpc_create_operational_notification_secure(uuid,text,text,text,text);

DROP TABLE IF EXISTS public.comunicacao_inapp_dispatch;

-- Constraints e colunas
ALTER TABLE public.comunicacao_templates
  DROP CONSTRAINT IF EXISTS comunicacao_templates_email_assunto_chk,
  DROP CONSTRAINT IF EXISTS comunicacao_templates_whatsapp_meta_chk,
  DROP CONSTRAINT IF EXISTS comunicacao_templates_non_whatsapp_meta_chk,
  DROP CONSTRAINT IF EXISTS comunicacao_templates_provider_status_chk;

ALTER TABLE public.comunicacao_templates
  DROP COLUMN IF EXISTS provider_template_name,
  DROP COLUMN IF EXISTS language_code,
  DROP COLUMN IF EXISTS parameter_mapping,
  DROP COLUMN IF EXISTS provider_template_status;

COMMIT;
