-- Rollback Comunicação Fase 0.2.
-- ATENÇÃO: NÃO restaura as policies permissivas vulneráveis anteriores.
-- Prefere deixar escrita bloqueada a reabrir o vetor de ataque.

BEGIN;

-- Drop RPCs canônicas 0.2 (mantém banco funcional pela escrita bloqueada).
DROP FUNCTION IF EXISTS public.rpc_create_notificacao_operacional(
  uuid, text, text, text, text, text, uuid, text
);
DROP FUNCTION IF EXISTS public.rpc_create_portal_notification_secure(
  uuid, text, text, text, text, text, uuid, text
);
DROP FUNCTION IF EXISTS public.rpc_record_aplicacao_email(
  uuid, text, text, text, uuid
);

-- Índices unique / colunas aditivas
DROP INDEX IF EXISTS public.ux_notif_op_idempotency;
DROP INDEX IF EXISTS public.ux_portal_notif_idempotency;
DROP INDEX IF EXISTS public.ux_aplicacao_emails_idempotency;
-- ux_monitoramento_avisos_dia é mantido: ele é a garantia de idempotência
-- diária dos avisos vencidos e deve continuar existindo.

ALTER TABLE public.notificacoes_operacionais
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS source_id,
  DROP COLUMN IF EXISTS idempotency_key;

ALTER TABLE public.portal_notificacoes
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS source_type,
  DROP COLUMN IF EXISTS source_id,
  DROP COLUMN IF EXISTS idempotency_key,
  DROP COLUMN IF EXISTS link;

ALTER TABLE public.aplicacao_emails
  DROP COLUMN IF EXISTS idempotency_key;

ALTER TABLE public.aplicacao_emails
  DROP CONSTRAINT IF EXISTS aplicacao_emails_status_chk;

DROP TRIGGER IF EXISTS trg_monitoramento_avisos_set_dref
  ON public.monitoramento_avisos;
DROP FUNCTION IF EXISTS public.tg_monitoramento_avisos_set_dref();
-- data_referencia é mantida: dado estatístico útil e sem risco.

COMMIT;
