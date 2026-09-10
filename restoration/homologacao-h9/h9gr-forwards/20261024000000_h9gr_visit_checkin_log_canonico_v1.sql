-- H9-GR — forward-only (homologação ikaauvsflpmamgxmkhoq; ledger 679 -> 680)
--
-- DEFEITO REAL COMPROVADO NO SMOKE AUTENTICADO (registro 9fa57957-5fcb-4ff0-a9e6-dd0a4df53931):
--   um único INSERT em public.visitas_checkin produziu DOIS registros em
--   public.visitas_logs com acao='checkin_realizado', mesmo registro, mesmo usuário
--   e mesmo timestamp:
--     (a) trigger trg_log_checkin -> log_visita_checkin(): descrição + metadata
--         (lat/lng/precisão) — log MAIS COMPLETO;
--     (b) INSERT redundante dentro de rpc_realizar_checkin_visita, sem metadata.
--   O mesmo padrão existia no encerramento: o trigger gravava 'checkin_realizado'
--   para uma linha de tipo 'checkout' enquanto a RPC gravava 'checkout_realizado'.
--
-- CORREÇÃO MÍNIMA (sem remover auditoria):
--   1. log_visita_checkin() passa a ser a ÚNICA fonte canônica de log por evento de
--      presença, com ação derivada do tipo real da linha ('checkout_realizado' para
--      checkout, 'checkin_realizado' caso contrário) e metadata enriquecida
--      (lat/lng/precisão + tipo_checkin, checkin_id, client_uuid, status).
--   2. rpc_realizar_checkin_visita e rpc_realizar_checkout_visita deixam de inserir
--      o log redundante. Nada mais muda: assinatura, retorno, ACL, search_path,
--      gate de escopo antes de qualquer leitura, lock por registro, idempotência
--      pós-lock, ausência de oráculo, validações e efeitos em portal_solicitacoes /
--      solicitacoes_timeline permanecem equivalentes.
--
-- NÃO ALTERA: start_technical_visit_secure, finish_technical_visit_secure,
-- rpc_finalizar_visita_v2 (já grava status/finalized_at/finalized_by/version
-- atomicamente) nem qualquer política RLS.

BEGIN;

-- 1) Fonte canônica única de log de presença.
CREATE OR REPLACE FUNCTION public.log_visita_checkin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_acao text;
BEGIN
  v_acao := CASE
              WHEN NEW.tipo_checkin = 'checkout'::public.tipo_checkin THEN 'checkout_realizado'
              ELSE 'checkin_realizado'
            END;

  INSERT INTO public.visitas_logs (
    registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata
  ) VALUES (
    NEW.registro_consultor_id,
    NEW.solicitacao_id,
    v_acao,
    CASE
      WHEN NEW.tipo_checkin = 'checkout'::public.tipo_checkin
        THEN 'Checkout (' || NEW.tipo_checkin || ') registrado'
      ELSE 'Check-in (' || NEW.tipo_checkin || ') registrado'
    END,
    NEW.consultor_id,
    jsonb_build_object(
      'lat', NEW.latitude,
      'lng', NEW.longitude,
      'precisao', NEW.precisao_gps,
      'tipo_checkin', NEW.tipo_checkin,
      'checkin_id', NEW.id,
      'client_uuid', NEW.client_uuid,
      'status', NEW.status
    )
  );
  RETURN NEW;
END;
$function$;

-- 2) Check-in: idêntico ao vigente, SEM o INSERT redundante em visitas_logs.
CREATE OR REPLACE FUNCTION public.rpc_realizar_checkin_visita(p_registro_id uuid, p_client_uuid uuid, p_tipo tipo_checkin, p_latitude numeric, p_longitude numeric, p_precisao numeric, p_justificativa_sem_gps text, p_observacoes text, p_captured_at_local timestamp with time zone, p_solicitacao_id uuid, p_cliente_id uuid, p_fazenda_id uuid, p_talhao_id uuid, p_foto_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_existing public.visitas_checkin;
  v_new public.visitas_checkin;
  v_obs text;
  v_can_manage boolean;
  v_is_participant boolean;
  v_cliente_id uuid;
  v_fazenda_id uuid;
  v_talhao_id uuid;
  v_solicitacao_id uuid;
  v_last_checkout timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501'; END IF;
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE = '22023'; END IF;
  IF p_tipo = 'checkout'::public.tipo_checkin THEN RAISE EXCEPTION 'use_rpc_realizar_checkout_visita' USING ERRCODE = '22023'; END IF;
  IF p_registro_id IS NULL THEN RAISE EXCEPTION 'registro_obrigatorio' USING ERRCODE = '22023'; END IF;

  -- H9-E2 (A): gate de escopo fail-closed ANTES de qualquer leitura sensivel,
  -- inclusive do lookup por client_uuid. Registro inexistente, registro alheio
  -- e qualquer client_uuid convergem para o mesmo erro.
  IF NOT COALESCE(public._visita_scope_ok(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE = '42501';
  END IF;

  -- Derivacoes de papel somente apos o gate.
  v_can_manage := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false);
  v_is_participant := COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);

  -- H9-E2 (B): lock por registro antes da busca idempotente determinante.
  PERFORM 1 FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE;

  -- H9-E2 (B): busca idempotente POS-lock, ANTES de qualquer rejeicao por
  -- estado ou por duplicidade de ciclo.
  SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> p_tipo
       OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
  END IF;

  v_reg := public._assert_visita_editavel(p_registro_id);

  IF NOT v_can_manage AND NOT v_is_participant
     AND (v_reg.consultor_profile_id IS NULL OR v_reg.consultor_profile_id <> v_uid) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE = '42501';
  END IF;

  v_cliente_id := v_reg.cliente_id;
  v_fazenda_id := v_reg.fazenda_id;
  v_talhao_id  := v_reg.talhao_id;
  v_solicitacao_id := v_reg.solicitacao_id;

  IF p_cliente_id IS NOT NULL AND v_cliente_id IS NOT NULL AND p_cliente_id <> v_cliente_id THEN
    RAISE EXCEPTION 'relacional_divergente_cliente' USING ERRCODE = '22023'; END IF;
  IF p_fazenda_id IS NOT NULL AND v_fazenda_id IS NOT NULL AND p_fazenda_id <> v_fazenda_id THEN
    RAISE EXCEPTION 'relacional_divergente_fazenda' USING ERRCODE = '22023'; END IF;
  IF p_talhao_id IS NOT NULL AND v_talhao_id IS NOT NULL AND p_talhao_id <> v_talhao_id THEN
    RAISE EXCEPTION 'relacional_divergente_talhao' USING ERRCODE = '22023'; END IF;
  IF p_solicitacao_id IS NOT NULL AND v_solicitacao_id IS NOT NULL AND p_solicitacao_id <> v_solicitacao_id THEN
    RAISE EXCEPTION 'relacional_divergente_solicitacao' USING ERRCODE = '22023'; END IF;

  IF (p_latitude IS NULL OR p_longitude IS NULL)
     AND (p_justificativa_sem_gps IS NULL OR btrim(p_justificativa_sem_gps) = '') THEN
    RAISE EXCEPTION 'gps_ou_justificativa_obrigatorio' USING ERRCODE = '22023';
  END IF;

  SELECT MAX(data_hora_checkin) INTO v_last_checkout
    FROM public.visitas_checkin
   WHERE registro_consultor_id = p_registro_id
     AND consultor_id = v_uid
     AND tipo_checkin = 'checkout'::public.tipo_checkin;

  IF EXISTS (
    SELECT 1 FROM public.visitas_checkin
     WHERE registro_consultor_id = p_registro_id
       AND consultor_id = v_uid
       AND tipo_checkin = p_tipo
       AND status <> 'inconsistente'::public.status_checkin
       AND data_hora_checkin > COALESCE(v_last_checkout, '-infinity'::timestamptz)
  ) THEN
    RAISE EXCEPTION 'checkin_duplicado_para_tipo_no_ciclo' USING ERRCODE = '22023';
  END IF;

  v_obs := p_observacoes;
  IF p_captured_at_local IS NOT NULL THEN
    v_obs := COALESCE(v_obs,'') ||
             CASE WHEN v_obs IS NULL OR v_obs = '' THEN '' ELSE E'\n' END ||
             '[captured_at_local=' || p_captured_at_local::text || ']';
  END IF;

  INSERT INTO public.visitas_checkin (
    registro_consultor_id, solicitacao_id, cliente_id, fazenda_id, talhao_id,
    consultor_id, tipo_checkin, latitude, longitude, precisao_gps,
    justificativa_sem_gps, observacoes, foto_path, client_uuid,
    data_hora_checkin, status
  ) VALUES (
    p_registro_id, v_solicitacao_id, v_cliente_id, v_fazenda_id, v_talhao_id,
    v_uid, p_tipo, p_latitude, p_longitude, p_precisao,
    NULLIF(btrim(COALESCE(p_justificativa_sem_gps,'')), ''),
    v_obs, p_foto_path, p_client_uuid,
    now(), 'realizado'::public.status_checkin
  ) RETURNING * INTO v_new;

  -- H9-GR: log de presenca gravado exclusivamente pelo trigger canonico
  -- trg_log_checkin -> public.log_visita_checkin() (uma linha por evento).

  IF v_solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes SET status='checkin_realizado', updated_at=now()
     WHERE id = v_solicitacao_id
       AND (cliente_id IS NULL OR v_cliente_id IS NULL OR cliente_id = v_cliente_id);
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_solicitacao_id, 'checkin_realizado',
            COALESCE(p_observacoes,'Check-in realizado via visita técnica'), v_uid);
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'data_hora_checkin', v_new.data_hora_checkin, 'idempotent', false);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
         OR v_existing.tipo_checkin <> p_tipo
         OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
      END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
    END IF;
    RAISE;
END; $function$;

-- 3) Checkout: idêntico ao vigente, SEM o INSERT redundante em visitas_logs.
CREATE OR REPLACE FUNCTION public.rpc_realizar_checkout_visita(p_registro_id uuid, p_client_uuid uuid, p_latitude numeric, p_longitude numeric, p_precisao numeric, p_justificativa_sem_gps text, p_observacoes text, p_captured_at_local timestamp with time zone, p_foto_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor;
  v_existing public.visitas_checkin;
  v_last_event public.visitas_checkin;
  v_new public.visitas_checkin;
  v_obs text;
  v_can_manage boolean;
  v_is_participant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid_obrigatorio' USING ERRCODE='22023'; END IF;
  IF p_registro_id IS NULL THEN RAISE EXCEPTION 'registro_obrigatorio' USING ERRCODE='22023'; END IF;

  -- H9-E2 (A): gate de escopo fail-closed ANTES de qualquer leitura sensivel,
  -- inclusive do lookup por client_uuid (oraculo remanescente da H9-D-L6).
  IF NOT COALESCE(public._visita_scope_ok(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE = '42501';
  END IF;

  -- Derivacoes de papel somente apos o gate.
  v_can_manage := COALESCE(public.can_manage_technical_visit(v_uid, p_registro_id), false);
  v_is_participant := COALESCE(public.is_active_visit_participant(v_uid, p_registro_id), false);

  -- H9-E2 (B): lock por registro antes da busca idempotente determinante.
  PERFORM 1 FROM public.registros_consultor WHERE id = p_registro_id FOR UPDATE;

  -- H9-E2 (B): busca idempotente POS-lock, ANTES da duplicidade de encerramento e das
  -- demais rejeicoes de ciclo. A sessao perdedora converge para o vencedor.
  SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
       OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
  END IF;

  v_reg := public._assert_visita_editavel(p_registro_id);

  IF NOT v_can_manage AND NOT v_is_participant
     AND (v_reg.consultor_profile_id IS NULL OR v_reg.consultor_profile_id <> v_uid) THEN
    RAISE EXCEPTION 'forbidden_visita_nao_atribuido' USING ERRCODE='42501';
  END IF;

  IF (p_latitude IS NULL OR p_longitude IS NULL)
     AND (p_justificativa_sem_gps IS NULL OR btrim(p_justificativa_sem_gps) = '') THEN
    RAISE EXCEPTION 'gps_ou_justificativa_obrigatorio' USING ERRCODE='22023';
  END IF;

  SELECT * INTO v_last_event FROM public.visitas_checkin
   WHERE registro_consultor_id = p_registro_id AND consultor_id = v_uid
   ORDER BY data_hora_checkin DESC, created_at DESC, id DESC LIMIT 1;

  IF v_last_event.id IS NULL THEN RAISE EXCEPTION 'checkout_sem_checkin' USING ERRCODE='22023'; END IF;
  IF v_last_event.tipo_checkin = 'checkout'::public.tipo_checkin THEN RAISE EXCEPTION 'checkout_duplicado' USING ERRCODE='22023'; END IF;
  IF v_last_event.data_hora_checkin > now() THEN RAISE EXCEPTION 'checkin_no_futuro' USING ERRCODE='22023'; END IF;

  v_obs := p_observacoes;
  IF p_captured_at_local IS NOT NULL THEN
    v_obs := COALESCE(v_obs,'') ||
             CASE WHEN v_obs IS NULL OR v_obs='' THEN '' ELSE E'\n' END ||
             '[captured_at_local=' || p_captured_at_local::text || ']';
  END IF;

  INSERT INTO public.visitas_checkin (
    registro_consultor_id, solicitacao_id, cliente_id, fazenda_id, talhao_id,
    consultor_id, tipo_checkin, latitude, longitude, precisao_gps,
    justificativa_sem_gps, observacoes, foto_path, client_uuid,
    data_hora_checkin, status
  ) VALUES (
    p_registro_id, v_last_event.solicitacao_id, v_last_event.cliente_id,
    v_last_event.fazenda_id, v_last_event.talhao_id,
    v_uid, 'checkout'::public.tipo_checkin, p_latitude, p_longitude, p_precisao,
    NULLIF(btrim(COALESCE(p_justificativa_sem_gps,'')), ''),
    v_obs, p_foto_path, p_client_uuid,
    now(), 'realizado'::public.status_checkin
  ) RETURNING * INTO v_new;

  -- H9-GR: log de presenca gravado exclusivamente pelo trigger canonico
  -- trg_log_checkin -> public.log_visita_checkin() (acao 'checkout_realizado').

  IF v_last_event.solicitacao_id IS NOT NULL THEN
    INSERT INTO public.solicitacoes_timeline (solicitacao_id, tipo_evento, descricao, usuario_id)
    VALUES (v_last_event.solicitacao_id, 'checkout_realizado',
            COALESCE(p_observacoes,'Presença encerrada com sucesso'), v_uid);
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'data_hora_checkin', v_new.data_hora_checkin, 'idempotent', false);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.visitas_checkin WHERE client_uuid = p_client_uuid LIMIT 1;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
         OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
         OR (v_existing.consultor_id <> v_uid AND NOT v_can_manage) THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE='22023';
      END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'data_hora_checkin', v_existing.data_hora_checkin, 'idempotent', true);
    END IF;
    RAISE;
END; $function$;

REVOKE ALL ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,tipo_checkin,numeric,numeric,numeric,text,text,timestamp with time zone,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,tipo_checkin,numeric,numeric,numeric,text,text,timestamp with time zone,uuid,uuid,uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamp with time zone,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamp with time zone,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_realizar_checkin_visita(uuid,uuid,tipo_checkin,numeric,numeric,numeric,text,text,timestamp with time zone,uuid,uuid,uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_realizar_checkout_visita(uuid,uuid,numeric,numeric,numeric,text,text,timestamp with time zone,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.log_visita_checkin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_visita_checkin() FROM anon;
REVOKE ALL ON FUNCTION public.log_visita_checkin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_visita_checkin() TO service_role;

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20261024000000', 'h9gr_visit_checkin_log_canonico_v1')
ON CONFLICT (version) DO NOTHING;

COMMIT;
