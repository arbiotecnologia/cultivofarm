-- H9-D-L4 RETIFICAÇÃO (20261014000000)
-- Contexto: o forward 20261013000000 adicionou pré-gate de papel, o que fecha usuários SEM papel,
-- mas mantinha oráculo de existência ENTRE usuários de domínio (consultor/técnico/gestor/admin):
--   * UUID inexistente  -> void (sucesso)
--   * UUID real alheio  -> 42501 'sem_permissao' vindo de _assert_visita_editavel
-- Retificação: resolução + autorização em UMA ÚNICA consulta escopada ao chamador.
--   * Se nada é resolvido no escopo do chamador (inexistente OU alheio) -> RETURN (void), idêntico.
--   * Estado não editável de recurso PRÓPRIO continua sinalizado ('visita_nao_editavel'), pois já
--     pressupõe autorização comprovada — não revela existência a terceiros.
-- Delete legítimo, contratos, retornos, ACL e search_path preservados. Somente homologação.

CREATE OR REPLACE FUNCTION public.rpc_delete_diagnostico_visita(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_registro_id uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  -- H9-D-L4: capacidade mínima de domínio (uniforme por identidade, sem leitura do recurso).
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'consultor_tecnico'::app_role)
    OR public.has_role(v_uid, 'tecnico_agronomo'::app_role)
  ) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  -- H9-D-L4-R: resolução ESCOPADA ao chamador — inexistente e alheio são indistinguíveis.
  SELECT r.id, r.status::text
    INTO v_registro_id, v_status
  FROM public.visita_diagnosticos d
  JOIN public.registros_consultor r ON r.id = d.registro_id
  WHERE d.id = p_id
    AND (
      COALESCE(public.can_manage_technical_visit(v_uid, r.id), false)
      OR COALESCE(r.created_by = v_uid, false)
      OR COALESCE(r.consultor_responsavel = v_uid, false)
      OR COALESCE(public.is_active_visit_participant(v_uid, r.id), false)
    );

  IF v_registro_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_status) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.visita_diagnosticos WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_recomendacao_visita(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_registro_id uuid;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  -- H9-D-L4: capacidade mínima de domínio (uniforme por identidade, sem leitura do recurso).
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'consultor_tecnico'::app_role)
    OR public.has_role(v_uid, 'tecnico_agronomo'::app_role)
  ) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  -- H9-D-L4-R: resolução ESCOPADA ao chamador — inexistente e alheio são indistinguíveis.
  SELECT r.id, r.status::text
    INTO v_registro_id, v_status
  FROM public.registros_consultor_recomendacoes rec
  JOIN public.registros_consultor r ON r.id = rec.registro_consultor_id
  WHERE rec.id = p_id
    AND (
      COALESCE(public.can_manage_technical_visit(v_uid, r.id), false)
      OR COALESCE(r.created_by = v_uid, false)
      OR COALESCE(r.consultor_responsavel = v_uid, false)
      OR COALESCE(public.is_active_visit_participant(v_uid, r.id), false)
    );

  IF v_registro_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_technical_visit_editable_status(v_status) THEN
    RAISE EXCEPTION 'visita_nao_editavel' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.registros_consultor_recomendacoes WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_delete_diagnostico_visita(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delete_recomendacao_visita(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_delete_diagnostico_visita(uuid) TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_recomendacao_visita(uuid) TO postgres, authenticated, service_role;
