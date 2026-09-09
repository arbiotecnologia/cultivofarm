-- H9-E1 (complemento) — forward reversível (homologação ikaauvsflpmamgxmkhoq; ledger 676 -> 677)
-- Objeto único: public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)
-- OID 24597, owner postgres, SECURITY DEFINER, search_path=public,
-- ACL postgres=X,authenticated=X,service_role=X (sem PUBLIC, sem anon).
-- Fingerprint pré-correção (md5 de pg_get_functiondef): 74cab9081642637b1d0bf6f6743e4a01
--
-- Defeito reproduzido em homologação, em transação integralmente revertida, logo após
-- o forward 20261020000000 destravar rascunho -> em_andamento:
--   dono legítimo, visita em_andamento com diagnóstico -> 42702
--   'column reference "registro_id" is ambiguous'
-- Causa-raiz: o parâmetro OUT `registro_id` do RETURNS TABLE colide com a coluna
-- public.visita_diagnosticos.registro_id na contagem de diagnósticos. Sem o alias,
-- o encerramento da visita era impossível e 'em_andamento' virava estado sem saída.
--
-- Correção mínima: qualificar a coluna com o alias `vd`. Nenhuma outra linha alterada.
-- Preservados: assinatura, tipo de retorno, owner, ACL, SECURITY DEFINER, search_path,
-- autorização (dono ou administrador), exigência de diagnóstico, auditoria e transição.
-- Sem BEGIN/COMMIT internos (aplicar em transação externa).

CREATE OR REPLACE FUNCTION public.finish_technical_visit_secure(p_registro_id uuid, p_latitude numeric DEFAULT NULL::numeric, p_longitude numeric DEFAULT NULL::numeric, p_precisao_gps numeric DEFAULT NULL::numeric, p_foto_url text DEFAULT NULL::text, p_foto_path text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text, p_client_uuid uuid DEFAULT NULL::uuid)
 RETURNS TABLE(registro_id uuid, checkout_id uuid, finalized_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_reg record;
  v_diag_count int;
  v_new_checkout uuid;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF v_reg.id IS NULL THEN
    RAISE EXCEPTION 'registro_not_found' USING ERRCODE = '22023';
  END IF;

  SELECT public.has_role(v_uid, 'administrador'::app_role) INTO v_is_admin;

  IF NOT v_is_admin AND v_reg.consultor_responsavel IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_visit_owner' USING ERRCODE = '42501';
  END IF;

  IF v_reg.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'visit_not_in_progress:%', v_reg.status USING ERRCODE = '22023';
  END IF;

  -- Exige ao menos um diagnóstico
  SELECT count(*) INTO v_diag_count
    FROM public.visita_diagnosticos vd WHERE vd.registro_id = v_reg.id;
  IF v_diag_count = 0 THEN
    RAISE EXCEPTION 'diagnostico_required' USING ERRCODE = '22023';
  END IF;

  -- Check-out
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
    'inicio_visita', 'realizado', p_client_uuid
  )
  RETURNING id INTO v_new_checkout;

  UPDATE public.registros_consultor
     SET status = 'finalizado',
         hora_fim = v_now,
         finalized_at = v_now,
         finalized_by = v_uid,
         updated_at = v_now
   WHERE id = v_reg.id;

  INSERT INTO public.visitas_logs(registro_consultor_id, solicitacao_id, acao, descricao, usuario_id, metadata)
  VALUES (v_reg.id, v_reg.solicitacao_id, 'checkout', 'Check-out e finalização da visita', v_uid,
          jsonb_build_object('checkout_id', v_new_checkout, 'admin_bypass', v_is_admin));

  RETURN QUERY SELECT v_reg.id, v_new_checkout, v_now;
END;
$function$;

REVOKE ALL ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid) TO authenticated, service_role;
