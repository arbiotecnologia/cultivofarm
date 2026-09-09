-- H9-E1R - forward reversivel (homologacao ikaauvsflpmamgxmkhoq; ledger 677 -> 678)
-- Objeto unico: public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)
-- OID 24597, owner postgres, SECURITY DEFINER, search_path=public,
-- ACL postgres=X,authenticated=X,service_role=X (sem PUBLIC, sem anon).
-- Fingerprint pre-H9-E1R (md5 de pg_get_functiondef): 1a23e69ad1909af5b6021d81fb9ed918
--
-- RETIFICACAO. O dossie H9-E1 afirmou que registro alheio e UUID inexistente eram
-- indistinguiveis nesta RPC. A afirmacao era FALSA, e o inventario H9-D classificava
-- esta assinatura como AUTH_COMPROVADA sob justificativa incorreta.
--
-- Defeitos comprovados na definicao viva:
--   D1 ORACULO DE EXISTENCIA. O SELECT em public.registros_consultor ocorria ANTES de
--      qualquer prova de escopo: UUID inexistente -> 22023 'registro_not_found';
--      registro real alheio -> 42501 'not_visit_owner'. Superficies observaveis
--      distintas permitiam enumerar registros de terceiros.
--   D2 SEMANTICA DE CHECKOUT. O encerramento inseria tipo_checkin='inicio_visita'.
--      public.can_checkout_technical_visit e public.has_completed_visit_presence
--      detectam ciclo fechado exclusivamente por tipo_checkin='checkout', assim como
--      public.rpc_realizar_checkout_visita e os consumidores do app
--      (offlineCheckinQueue, PresencaCheckoutButton, useRoteiroEventos). O ciclo
--      permanecia semanticamente ABERTO apos a finalizacao.
--   D3 IDEMPOTENCIA AUSENTE. Sem tratamento de p_client_uuid, duplo clique colidia com
--      o indice unico parcial visitas_checkin_client_uuid_uq (23505) ou, sem
--      client_uuid, duplicava check-outs; corrida nao era serializada.
--
-- Correcao minima, sem fluxo paralelo e sem ampliar superficie:
--   1. Gate de autorizacao ANTES de qualquer leitura sensivel, via helper existente
--      public._visita_scope_ok(auth.uid(), p_registro_id) (fail-closed em NULL),
--      exatamente o modelo ja adotado por public.rpc_realizar_checkout_visita.
--      Administrador continua atendido por public.has_role(...,'administrador').
--      Registro inexistente, registro alheio e p_registro_id NULL passam a produzir
--      a MESMA superficie: SQLSTATE 42501, mensagem 'not_visit_owner'.
--   2. tipo_checkin passa a 'checkout'::public.tipo_checkin no encerramento.
--   3. Idempotencia por client_uuid APOS o gate de escopo, com conflito fail-closed
--      ('idempotency_conflict', 22023) e captura de unique_violation para corrida,
--      espelhando public.rpc_realizar_checkout_visita. Lock de linha
--      (SELECT ... FOR UPDATE) serializa encerramentos concorrentes do mesmo registro.
--
-- Preservados: nome, assinatura, RETURNS TABLE(registro_id, checkout_id, finalized_at),
-- owner, ACL, SECURITY DEFINER, search_path fixo, referencias qualificadas, exigencia de
-- ao menos um diagnostico, exigencia de status 'em_andamento', auditoria em visitas_logs
-- e a transicao 'em_andamento' -> 'finalizado' validada pelo trigger
-- trg_validate_registro_status. Nenhuma permissao ampliada; grants explicitos abaixo.
-- Sem BEGIN/COMMIT internos (aplicar em transacao externa).

CREATE OR REPLACE FUNCTION public.finish_technical_visit_secure(p_registro_id uuid, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_precisao_gps numeric DEFAULT NULL::numeric, p_foto_url text DEFAULT NULL::text, p_foto_path text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_client_uuid uuid DEFAULT NULL::uuid)
 RETURNS TABLE(registro_id uuid, checkout_id uuid, finalized_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_reg public.registros_consultor;
  v_existing public.visitas_checkin;
  v_diag_count int;
  v_new_checkout uuid;
  v_now timestamptz := now();
  v_prev_final timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  v_is_admin := COALESCE(public.has_role(v_uid, 'administrador'::app_role), false);

  -- H9-E1R (1): autorizacao de escopo ANTES de qualquer leitura de registro,
  -- check-in ou client_uuid. Inexistente / alheio / NULL: mesma superficie.
  IF NOT v_is_admin
     AND NOT COALESCE(public._visita_scope_ok(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  -- H9-E1R (3): idempotencia por client_uuid, somente depois do gate de escopo.
  IF p_client_uuid IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.visitas_checkin
     WHERE client_uuid = p_client_uuid
     LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      IF v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
         OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
         OR (v_existing.consultor_id IS DISTINCT FROM v_uid AND NOT v_is_admin) THEN
        RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
      END IF;

      SELECT r.finalized_at INTO v_prev_final
        FROM public.registros_consultor r
       WHERE r.id = p_registro_id;

      RETURN QUERY
        SELECT p_registro_id,
               v_existing.id,
               COALESCE(v_prev_final, v_existing.data_hora_checkin);
      RETURN;
    END IF;
  END IF;

  -- Serializa encerramentos concorrentes do mesmo registro.
  SELECT * INTO v_reg
    FROM public.registros_consultor r
   WHERE r.id = p_registro_id
     FOR UPDATE;

  IF v_reg.id IS NULL THEN
    -- Alcancavel apenas no bypass de administrador; mantem a superficie unica.
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  IF v_reg.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'visit_not_in_progress:%', v_reg.status USING ERRCODE = '22023';
  END IF;

  -- Exige ao menos um diagnostico
  SELECT count(*) INTO v_diag_count
    FROM public.visita_diagnosticos vd WHERE vd.registro_id = v_reg.id;
  IF v_diag_count = 0 THEN
    RAISE EXCEPTION 'diagnostico_required' USING ERRCODE = '22023';
  END IF;

  -- H9-E1R (2): check-out gravado com o tipo canonico 'checkout'.
  BEGIN
    INSERT INTO public.visitas_checkin(
      registro_consultor_id, solicitacao_id, consultor_id,
      cliente_id, fazenda_id, talhao_id,
      latitude, longitude, precisao_gps,
      foto_url, foto_path, observacoes,
      tipo_checkin, status, client_uuid
    ) VALUES (
      v_reg.id, v_reg.solicitacao_id, v_uid,
      v_reg.cliente_id, v_reg.fazenda_id, v_reg.talhao_id,
      p_latitude, p_longitude, p_precisao_gps,
      p_foto_url, p_foto_path, p_observacoes,
      'checkout'::public.tipo_checkin, 'realizado', p_client_uuid
    )
    RETURNING id INTO v_new_checkout;
  EXCEPTION WHEN unique_violation THEN
    -- Corrida no mesmo client_uuid: converge para o vencedor, fail-closed.
    SELECT * INTO v_existing
      FROM public.visitas_checkin
     WHERE client_uuid = p_client_uuid
     LIMIT 1;

    IF v_existing.id IS NULL
       OR v_existing.registro_consultor_id IS DISTINCT FROM p_registro_id
       OR v_existing.tipo_checkin <> 'checkout'::public.tipo_checkin
       OR (v_existing.consultor_id IS DISTINCT FROM v_uid AND NOT v_is_admin) THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = '22023';
    END IF;

    SELECT r.finalized_at INTO v_prev_final
      FROM public.registros_consultor r
     WHERE r.id = p_registro_id;

    RETURN QUERY
      SELECT p_registro_id,
             v_existing.id,
             COALESCE(v_prev_final, v_existing.data_hora_checkin);
    RETURN;
  END;

  UPDATE public.registros_consultor
     SET status = 'finalizado',
         hora_fim = v_now,
         finalized_at = v_now,
         finalized_by = v_uid,
         updated_at = v_now
   WHERE id = v_reg.id;

  INSERT INTO public.visitas_logs(registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES (v_reg.id, v_reg.solicitacao_id, 'checkout', 'Check-out e finalizacao da visita', v_uid,
          jsonb_build_object('checkout_id', v_new_checkout, 'admin_bypass', v_is_admin));

  RETURN QUERY SELECT v_reg.id, v_new_checkout, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) TO authenticated, service_role;
