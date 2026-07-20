
CREATE OR REPLACE FUNCTION public.get_b2b_technician_clients_secure(
  p_partner_id uuid DEFAULT NULL,
  p_technician_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  cliente_id uuid,
  nome text,
  razao_social text,
  nome_fantasia text,
  tipo_pessoa text,
  documento_mascarado text,
  telefone text,
  cidade text,
  estado text,
  ultima_simulacao_at timestamptz,
  total_simulacoes bigint,
  assigned_at timestamptz
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  v_is_admin := public.has_role(v_uid, 'administrador'::app_role);
  v_is_comercial := public.has_role(v_uid, 'gestor_comercial'::app_role);
  v_is_gestor := public.has_role(v_uid, 'parceiro_b2b'::app_role);
  v_is_tecnico := public.has_role(v_uid, 'parceiro_b2b_tecnico'::app_role);

  IF NOT (v_is_admin OR v_is_comercial OR v_is_gestor OR v_is_tecnico) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_is_gestor OR v_is_tecnico THEN
    v_user_partner := public.get_user_partner_id();
  END IF;

  RETURN QUERY
  WITH links AS (
    SELECT ptc.cliente_id, ptc.partner_id, ptc.technician_user_id, ptc.assigned_at
    FROM public.partner_technician_clients ptc
    WHERE ptc.active = true
      AND (
        v_is_admin OR v_is_comercial
        OR (v_is_gestor AND ptc.partner_id = v_user_partner)
        OR (v_is_tecnico AND ptc.technician_user_id = v_uid AND ptc.partner_id = v_user_partner)
      )
      AND (p_partner_id IS NULL OR ptc.partner_id = p_partner_id)
      AND (
        p_technician_user_id IS NULL
        OR ptc.technician_user_id = p_technician_user_id
        OR v_is_tecnico -- técnico sempre restrito a si mesmo, ignora filtro externo
      )
      AND (NOT v_is_tecnico OR ptc.technician_user_id = v_uid)
  ),
  agg AS (
    SELECT l.cliente_id,
           MIN(l.assigned_at) AS assigned_at
    FROM links l
    GROUP BY l.cliente_id
  ),
  sims AS (
    SELECT ps.cliente_id,
           COUNT(*) AS total,
           MAX(ps.created_at) AS ultima
    FROM public.partner_simulations ps
    WHERE ps.cliente_id IS NOT NULL
    GROUP BY ps.cliente_id
  )
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
    c.endereco_municipio,
    c.endereco_estado,
    s.ultima,
    COALESCE(s.total, 0),
    a.assigned_at
  FROM agg a
  JOIN public.clientes c ON c.id = a.cliente_id
  LEFT JOIN sims s ON s.cliente_id = c.id
  ORDER BY c.nome NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_b2b_technician_clients_secure(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_b2b_technician_clients_secure(uuid, uuid) TO authenticated, service_role;
