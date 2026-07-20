
CREATE OR REPLACE FUNCTION public.rpc_executivo_listar_relatorios(
  p_filtros jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid, titulo text, tipo text, status text,
  periodo_inicio date, periodo_fim date,
  gerado_por uuid, gerado_por_nome text, gerado_em timestamptz,
  observacoes text, versao integer, ativo boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_f jsonb := COALESCE(p_filtros, '{}'::jsonb);
  v_ativo boolean := COALESCE((v_f->>'ativo')::boolean, true);
BEGIN
  IF v_uid IS NULL OR NOT public.is_executivo(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    r.id, r.titulo, r.tipo, r.status,
    r.periodo_inicio, r.periodo_fim,
    r.gerado_por,
    COALESCE(p.nome, p.email, 'Usuário')::text AS gerado_por_nome,
    r.gerado_em, r.observacoes, r.versao, r.ativo
  FROM public.executivo_relatorios r
  LEFT JOIN public.profiles p ON p.user_id = r.gerado_por
  WHERE r.ativo = v_ativo
    AND (v_f->>'tipo' IS NULL OR r.tipo = v_f->>'tipo')
    AND (v_f->>'status' IS NULL OR r.status = v_f->>'status')
    AND (v_f->>'data_inicio' IS NULL OR r.gerado_em::date >= (v_f->>'data_inicio')::date)
    AND (v_f->>'data_fim' IS NULL OR r.gerado_em::date <= (v_f->>'data_fim')::date)
    AND (v_f->>'gerado_por' IS NULL OR r.gerado_por = (v_f->>'gerado_por')::uuid)
    AND (v_f->>'texto' IS NULL OR r.titulo ILIKE '%' || (v_f->>'texto') || '%')
  ORDER BY r.gerado_em DESC
  LIMIT 200;
END;
$$;
