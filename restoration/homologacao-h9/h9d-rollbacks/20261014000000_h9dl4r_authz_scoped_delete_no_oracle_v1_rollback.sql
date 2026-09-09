-- ROLLBACK simétrico de 20261014000000_h9dl4r_authz_scoped_delete_no_oracle_v1
-- Restaura EXATAMENTE os corpos vigentes após 20261013000000 (pré-gate de papel + leitura + _assert_visita_editavel).
-- Atenção: restaurar reintroduz o oráculo de existência entre usuários de domínio.

CREATE OR REPLACE FUNCTION public.rpc_delete_diagnostico_visita(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_diag public.visita_diagnosticos;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  -- H9-D-L4: capacidade verificada ANTES de qualquer leitura do recurso.
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'consultor_tecnico'::app_role)
    OR public.has_role(v_uid, 'tecnico_agronomo'::app_role)
  ) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_diag FROM public.visita_diagnosticos WHERE id = p_id;
  IF v_diag.id IS NULL THEN RETURN; END IF;
  PERFORM public._assert_visita_editavel(v_diag.registro_id);
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
  v_rec public.registros_consultor_recomendacoes;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  -- H9-D-L4: capacidade verificada ANTES de qualquer leitura do recurso.
  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'consultor_tecnico'::app_role)
    OR public.has_role(v_uid, 'tecnico_agronomo'::app_role)
  ) THEN
    RAISE EXCEPTION 'sem_permissao' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rec FROM public.registros_consultor_recomendacoes WHERE id = p_id;
  IF v_rec.id IS NULL THEN RETURN; END IF;
  PERFORM public._assert_visita_editavel(v_rec.registro_consultor_id);
  DELETE FROM public.registros_consultor_recomendacoes WHERE id = p_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_delete_diagnostico_visita(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delete_recomendacao_visita(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_delete_diagnostico_visita(uuid) TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_recomendacao_visita(uuid) TO postgres, authenticated, service_role;
