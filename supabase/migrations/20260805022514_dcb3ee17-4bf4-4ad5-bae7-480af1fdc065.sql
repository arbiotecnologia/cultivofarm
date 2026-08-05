
CREATE OR REPLACE FUNCTION public.rpc_get_visita_workspace(p_registro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_reg public.registros_consultor%ROWTYPE;
  v_result jsonb;
  v_is_admin boolean;
  v_is_manager boolean;
  v_can_manage boolean;
  v_editable boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reg FROM public.registros_consultor WHERE id = p_registro_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registro_inexistente' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.can_view_technical_visit(v_uid, p_registro_id) THEN
    RAISE EXCEPTION 'forbidden_visita' USING ERRCODE = '42501';
  END IF;

  v_is_admin   := public.has_role(v_uid, 'administrador');
  v_is_manager := public.is_visit_org_manager(v_uid, p_registro_id);
  v_can_manage := public.can_manage_technical_visit(v_uid, p_registro_id);
  v_editable   := public.is_technical_visit_editable_status(v_reg.status::text);

  SELECT jsonb_build_object(
    'registro', to_jsonb(v_reg),
    'version', v_reg.version,
    'status', v_reg.status,
    'permissions', jsonb_build_object(
      'can_view', true,
      'can_manage', v_can_manage,
      'can_edit', v_can_manage AND v_editable,
      'can_checkin', public.can_checkin_technical_visit(v_uid, p_registro_id),
      'can_checkout', public.can_checkout_technical_visit(v_uid, p_registro_id),
      'can_approve', (v_is_admin OR v_is_manager),
      'can_manage_team', (v_is_admin OR v_is_manager OR public.is_visit_responsible(v_uid, p_registro_id)),
      'can_convert_os', (v_is_admin OR v_is_manager),
      'is_editable_status', v_editable,
      'is_admin', v_is_admin,
      'is_manager', v_is_manager,
      'is_participant', public.is_active_visit_participant(v_uid, p_registro_id)
    ),
    'cliente', (SELECT to_jsonb(c) - 'observacoes' FROM public.clientes c WHERE c.id = v_reg.cliente_id),
    'fazenda', (SELECT to_jsonb(f) FROM public.fazendas f WHERE f.id = v_reg.fazenda_id),
    'talhao',  (SELECT to_jsonb(t) FROM public.talhoes t WHERE t.id = v_reg.talhao_id),
    'cultura', (SELECT to_jsonb(cu) FROM public.culturas cu WHERE cu.id = v_reg.cultura_id),
    'solicitacao', (SELECT to_jsonb(s) FROM public.portal_solicitacoes s WHERE s.id = v_reg.solicitacao_id),
    'equipe', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.assigned_at)
                        FROM public.technical_visit_assignments a
                        WHERE a.registro_consultor_id = p_registro_id), '[]'::jsonb),
    'checkins', COALESCE((SELECT jsonb_agg(to_jsonb(ck) ORDER BY ck.created_at)
                        FROM public.visitas_checkin ck
                        WHERE ck.registro_consultor_id = p_registro_id), '[]'::jsonb),
    'campo', (SELECT to_jsonb(vc) FROM public.visitas_campo vc WHERE vc.registro_consultor_id = p_registro_id),
    'diagnosticos', COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at)
                        FROM public.visita_diagnosticos d
                        WHERE d.registro_id = p_registro_id), '[]'::jsonb),
    'evidencias', COALESCE((SELECT jsonb_agg(to_jsonb(ar) ORDER BY ar.uploaded_at)
                        FROM public.registros_consultor_arquivos ar
                        WHERE ar.registro_consultor_id = p_registro_id), '[]'::jsonb),
    'recomendacoes', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at)
                        FROM public.registros_consultor_recomendacoes r
                        WHERE r.registro_consultor_id = p_registro_id), '[]'::jsonb),
    'comentarios', COALESCE((SELECT jsonb_agg(to_jsonb(cm) ORDER BY cm.created_at)
                        FROM public.recomendacao_comentarios cm
                        JOIN public.registros_consultor_recomendacoes r2 ON r2.id = cm.recomendacao_id
                        WHERE r2.registro_consultor_id = p_registro_id), '[]'::jsonb),
    'aprovacoes', COALESCE((SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.created_at)
                        FROM public.aprovacoes_tecnicas ap
                        WHERE ap.registro_consultor_id = p_registro_id), '[]'::jsonb),
    'timeline', COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at)
                        FROM public.visitas_logs l
                        WHERE l.registro_consultor_id = p_registro_id), '[]'::jsonb),
    'monitoramento', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.enviado_em)
                        FROM public.monitoramento_avisos m
                        WHERE m.registro_consultor_id = p_registro_id), '[]'::jsonb),
    'ordens_servico', COALESCE((SELECT jsonb_agg(to_jsonb(os) ORDER BY os.created_at)
                        FROM public.ordens_servico_onfarm os
                        WHERE os.registro_consultor_id = p_registro_id), '[]'::jsonb),
    'retornos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', rr.id, 'status', rr.status, 'data_vistoria', rr.data_vistoria, 'tipo_visita', rr.tipo_visita))
                        FROM public.registros_consultor rr
                        WHERE rr.registro_origem_id = p_registro_id), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_visita_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_visita_workspace(uuid) TO authenticated;
