-- H9-D-L7 — forward reversível (homologação ikaauvsflpmamgxmkhoq; ledger 674 -> 675)
-- Assinatura única do lote:
--   public.start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid)
--
-- Exposições comprovadas dinamicamente no staging, antes desta correção:
--   1) Oráculo de existência: registro real alheio -> 'not_visit_owner' (42501);
--      registro inexistente -> 'registro_not_found' (22023). Respostas distinguíveis
--      para identidade autenticada sem escopo.
--   2) BOLA/IDOR na idempotência: o SELECT por p_client_uuid não era escopado ao chamador,
--      de modo que qualquer identidade autenticada obtinha o checkin_id de terceiros
--      (prova: retorno (01a72cfc-…, false) sob sub arbitrário), ANTES de qualquer autorização.
--
-- Correção mínima: autorização de escopo ANTES de qualquer leitura (idempotência inclusive)
-- e idempotência escopada ao autor do check-in (ou administrador).
-- Preservados: assinatura, tipo de retorno, ACL, search_path, regra de negócio,
-- transições, autoria, auditoria e o contrato de idempotência legítima.

BEGIN;

CREATE OR REPLACE FUNCTION public.start_technical_visit_secure(p_registro_id uuid, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_precisao_gps numeric DEFAULT NULL::numeric, p_foto_url text DEFAULT NULL::text, p_foto_path text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_justificativa_sem_gps text DEFAULT NULL::text, p_client_uuid uuid DEFAULT NULL::uuid)
 RETURNS TABLE(checkin_id uuid, is_new boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_reg record;
  v_existing uuid;
  v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT public.has_role(v_uid, 'administrador'::app_role) INTO v_is_admin;

  -- H9-D-L7: autorização de escopo ANTES de qualquer leitura de visita ou de check-in.
  -- Registro inexistente e registro alheio produzem a MESMA resposta (fail-closed em NULL).
  IF NOT COALESCE(v_is_admin, false)
     AND NOT COALESCE(public._visita_scope_ok(v_uid, p_registro_id), false) THEN
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  -- Idempotência por client_uuid, escopada ao autor do check-in (ou administrador).
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_existing
      FROM public.visitas_checkin
     WHERE client_uuid = p_client_uuid
       AND (COALESCE(v_is_admin, false) OR consultor_id = v_uid)
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN QUERY SELECT v_existing, false;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_not_found' USING ERRCODE = '22023';
  END IF;

  -- Só técnico da visita ou admin
  IF NOT v_is_admin AND v_reg.consultor_responsavel IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  -- Status permitido
  IF v_reg.status NOT IN ('rascunho') THEN
    RAISE EXCEPTION 'invalid_status_for_start:%', v_reg.status USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.visitas_checkin(
    registro_consultor_id, solicitacao_id, consultor_id,
    cliente_id, fazenda_id, talhao_id,
    latitude, longitude, precisao_gps,
    foto_url, foto_path, observacoes,
    justificativa_sem_gps, tipo_checkin, status, client_uuid
  ) VALUES (
    v_reg.id, v_reg.solicitacao_id, v_uid,
    v_reg.cliente_id, v_reg.fazenda_id, v_reg.talhao_id,
    p_latitude, p_longitude, p_precisao_gps,
    p_foto_url, p_foto_path, p_observacoes,
    p_justificativa_sem_gps, 'chegada_fazenda', 'realizado', p_client_uuid
  )
  RETURNING id INTO v_new_id;

  UPDATE public.registros_consultor
     SET status = 'em_andamento',
         hora_inicio = COALESCE(hora_inicio, now()),
         updated_at = now()
   WHERE id = v_reg.id;

  INSERT INTO public.visitas_logs(registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES (v_reg.id, v_reg.solicitacao_id, 'checkin', 'Check-in de visita técnica', v_uid,
          jsonb_build_object('checkin_id', v_new_id, 'admin_bypass', v_is_admin));

  RETURN QUERY SELECT v_new_id, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid) TO authenticated, service_role;

COMMIT;
