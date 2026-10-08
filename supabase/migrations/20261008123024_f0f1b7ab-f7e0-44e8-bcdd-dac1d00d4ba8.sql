-- NOTIF-3: containment only; canonical project verified swzpzcwiasxmjutrmvkm.
DO $migration$
DECLARE t text; f record; d text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comunicacao_eventos','comunicacao_outbox','comunicacao_audit_log','comunicacao_consent_log','comunicacao_provider_receipts','comunicacao_dlq_replay_audit','comunicacao_regras','comunicacao_templates','communication_provider_settings','communication_provider_settings_audit','communication_provider_settings_rate_limit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=format('public.%I',t)::regclass AND polname='notif3_global_client_containment') THEN
      EXECUTE format('CREATE POLICY notif3_global_client_containment ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',t);
    END IF;
  END LOOP;
  -- Keep signatures/body contracts, prepend denial BEFORE reads/replay/effects.
  FOR f IN SELECT p.oid,p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
      'rpc_activate_communication_template','rpc_archive_communication_template','rpc_create_communication_template','rpc_update_communication_template','rpc_set_communication_template_metadata','rpc_upsert_communication_rule','rpc_preview_administrative_broadcast_count','rpc_publish_communication_event','rpc_publish_communication_event_v2','rpc_admin_set_whatsapp_consent','rpc_verify_communication_channel','rpc_admin_communication_health_snapshot','rpc_admin_communication_outbox_metrics','rpc_admin_list_communication_dead_letter','rpc_admin_replay_communication_dead_letter','rpc_admin_replay_communication_dead_letter_batch']) LOOP
    d:=pg_get_functiondef(f.oid);
    IF position('NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE' IN d)=0 THEN
      d:=regexp_replace(d,'\mBEGIN\M',E'BEGIN\n RAISE EXCEPTION ''NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE'' USING ERRCODE=''42501'';', 'i');
      EXECUTE d;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.sig);
  END LOOP;
END $migration$;
CREATE OR REPLACE FUNCTION public._comunicacao_require_admin() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN RAISE EXCEPTION 'NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE' USING ERRCODE='42501'; END $fn$;
REVOKE ALL ON FUNCTION public._comunicacao_require_admin() FROM PUBLIC,anon,authenticated;
-- Trigger callers retain parent writes but cannot read global/replay/fanout.
CREATE OR REPLACE FUNCTION public._comunicacao_publish_system_event(_event_key text,_source_type text,_source_id uuid,_payload jsonb,_idempotency_key text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN RETURN jsonb_build_object('ok',false,'suppressed',true,'code','NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE'); END $fn$;
REVOKE ALL ON FUNCTION public._comunicacao_publish_system_event(text,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
-- No grants added. service-only provider settings remain specific existing flow;
-- no generic superadmin bypass of global communication is introduced.
