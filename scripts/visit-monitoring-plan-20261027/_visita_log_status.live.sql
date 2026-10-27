CREATE OR REPLACE FUNCTION public._visita_log_status(p_registro_id uuid, p_acao text, p_status_anterior text, p_status_novo text, p_motivo text, p_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.visitas_logs (registro_consultor_id, usuario_id, acao, descricao, metadata)
  VALUES (
    p_registro_id, auth.uid(), p_acao,
    COALESCE(NULLIF(btrim(p_motivo), ''), p_acao),
    jsonb_build_object(
      'status_anterior', p_status_anterior,
      'status_novo', p_status_novo,
      'motivo', NULLIF(btrim(COALESCE(p_motivo, '')), ''),
      'version', p_version,
      'autor', auth.uid()
    )
  );
END;
$function$
