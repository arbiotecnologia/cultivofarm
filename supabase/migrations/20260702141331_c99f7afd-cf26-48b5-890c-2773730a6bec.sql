
CREATE OR REPLACE FUNCTION public.get_b2b_technician_client_detail_secure(p_cliente_id uuid)
RETURNS TABLE (
  cliente_id uuid,
  nome text,
  razao_social text,
  nome_fantasia text,
  tipo_pessoa text,
  documento_mascarado text,
  telefone text,
  email text,
  cidade text,
  estado text,
  bairro text,
  logradouro text,
  observacoes text,
  total_simulacoes bigint,
  ultima_simulacao_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_comercial boolean;
  v_is_gestor boolean;
  v_is_tecnico boolean;
  v_user_partner uuid;
  v_allowed boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_is_comercial := public.has_role(v_uid, 'gestor_comercial'::app_role);
  v_is_gestor := public.has_role(v_uid, 'parceiro_b2b'::app_role);
  v_is_tecnico := public.has_role(v_uid, 'parceiro_b2b_tecnico'::app_role);

  IF v_is_admin OR v_is_comercial THEN
    v_allowed := true;
  ELSIF v_is_gestor THEN
    v_user_partner := public.get_user_partner_id();
    SELECT EXISTS(
      SELECT 1 FROM public.partner_technician_clients ptc
      WHERE ptc.cliente_id = p_cliente_id AND ptc.partner_id = v_user_partner AND ptc.active = true
    ) INTO v_allowed;
  ELSIF v_is_tecnico THEN
    v_user_partner := public.get_user_partner_id();
    SELECT EXISTS(
      SELECT 1 FROM public.partner_technician_clients ptc
      WHERE ptc.cliente_id = p_cliente_id
        AND ptc.technician_user_id = v_uid
        AND ptc.partner_id = v_user_partner
        AND ptc.active = true
    ) INTO v_allowed;
  END IF;

  IF NOT v_allowed THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.nome,
    c.razao_social,
    c.nome_fantasia,
    c.tipo_pessoa,
    CASE
      WHEN c.cpf_cnpj IS NULL THEN NULL
      WHEN length(regexp_replace(c.cpf_cnpj, '\D', '', 'g')) = 11
        THEN '***.' || substring(regexp_replace(c.cpf_cnpj, '\D', '', 'g'), 4, 3) || '.***-**'
      WHEN length(regexp_replace(c.cpf_cnpj, '\D', '', 'g')) = 14
        THEN '**.' || substring(regexp_replace(c.cpf_cnpj, '\D', '', 'g'), 3, 3) || '.***/****-**'
      ELSE '***'
    END,
    c.telefone,
    c.email,
    c.endereco_municipio,
    c.endereco_estado,
    c.endereco_bairro,
    c.endereco_logradouro,
    c.observacoes,
    COALESCE((SELECT COUNT(*) FROM public.partner_simulations ps WHERE ps.cliente_id = c.id), 0),
    (SELECT MAX(ps.created_at) FROM public.partner_simulations ps WHERE ps.cliente_id = c.id)
  FROM public.clientes c
  WHERE c.id = p_cliente_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_b2b_technician_client_detail_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_b2b_technician_client_detail_secure(uuid) TO authenticated, service_role;
