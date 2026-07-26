-- Rollback Fase 1 — SEGURO: só drop se tabelas estiverem vazias.
BEGIN;

DO $$
DECLARE t text; n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'comunicacao_outbox','comunicacao_eventos','comunicacao_audit_log',
    'comunicacao_regras','comunicacao_templates','comunicacao_preferencias'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'rollback abortado: tabela % contém % linhas', t, n;
    END IF;
  END LOOP;
END$$;

DROP FUNCTION IF EXISTS public.rpc_fail_communication_delivery(uuid,text,text);
DROP FUNCTION IF EXISTS public.rpc_complete_communication_delivery(uuid,text);
DROP FUNCTION IF EXISTS public.rpc_claim_communication_outbox(integer,text,integer);
DROP FUNCTION IF EXISTS public.rpc_update_communication_preferences(public.comunicacao_canal,boolean,boolean,boolean,boolean);
DROP FUNCTION IF EXISTS public.rpc_publish_communication_event(text,text,uuid,jsonb,text);
DROP FUNCTION IF EXISTS public.rpc_upsert_communication_rule(uuid,text,public.app_role,text,public.comunicacao_canal,text,integer,jsonb,integer,boolean,integer);
DROP FUNCTION IF EXISTS public.rpc_activate_communication_template(uuid);
DROP FUNCTION IF EXISTS public.rpc_update_communication_template(uuid,text,text,text,jsonb);
DROP FUNCTION IF EXISTS public.rpc_create_communication_template(text,text,public.comunicacao_canal,text,text,jsonb);
DROP FUNCTION IF EXISTS public._comunicacao_write_audit(text,text,uuid,jsonb,jsonb);

DROP TABLE IF EXISTS public.comunicacao_outbox;
DROP TABLE IF EXISTS public.comunicacao_eventos;
DROP TABLE IF EXISTS public.comunicacao_audit_log;
DROP TABLE IF EXISTS public.comunicacao_regras;
DROP TABLE IF EXISTS public.comunicacao_templates;
DROP TABLE IF EXISTS public.comunicacao_preferencias;

DROP TYPE IF EXISTS public.comunicacao_evento_status;
DROP TYPE IF EXISTS public.comunicacao_outbox_status;
DROP TYPE IF EXISTS public.comunicacao_template_status;
DROP TYPE IF EXISTS public.comunicacao_canal;

COMMIT;
