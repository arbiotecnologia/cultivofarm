
CREATE OR REPLACE FUNCTION public.get_b2b_user_clients_secure(p_user_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text)
 RETURNS TABLE(cliente_id uuid, nome text, razao_social text, nome_fantasia text, tipo_pessoa text, documento_mascarado text, telefone text, cidade text, estado text, assignment_type text, can_create_simulation boolean, can_monitor boolean, assigned_at timestamp with time zone, ultima_simulacao_at timestamp with time zone, total_simulacoes bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_target uuid;
  v_partner uuid;
  v_is_tec boolean := has_role(v_uid, 'parceiro_b2b_tecnico'::app_role);
  v_is_gest boolean := has_role(v_uid, 'parceiro_b2b'::app_role);
  v_is_admin boolean := has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor_comercial'::app_role);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (v_is_tec OR v_is_gest OR v_is_admin) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  IF v_is_tec THEN
    v_target := v_uid;
  ELSIF v_is_gest THEN
    v_target := COALESCE(p_user_id, v_uid);
    v_partner := get_user_partner_id();
    IF v_target <> v_uid THEN
      IF NOT EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = v_target AND pu.partner_id = v_partner) THEN
        RAISE EXCEPTION 'usuario nao pertence ao mesmo parceiro';
      END IF;
    END IF;
  ELSE
    v_target := p_user_id;
  END IF;

  RETURN QUERY
  SELECT
    c.id AS cliente_id,
    c.nome, c.razao_social, c.nome_fantasia, c.tipo_pessoa,
    CASE
      WHEN c.cpf_cnpj IS NULL THEN NULL
      WHEN length(c.cpf_cnpj) >= 4 THEN repeat('*', greatest(length(c.cpf_cnpj)-4,0)) || right(c.cpf_cnpj,4)
      ELSE '****'
    END AS documento_mascarado,
    c.telefone,
    c.endereco_municipio AS cidade,
    c.endereco_estado AS estado,
    puc.assignment_type,
    puc.can_create_simulation,
    puc.can_monitor,
    puc.assigned_at,
    (SELECT max(ps.created_at) FROM public.partner_simulations ps
       WHERE ps.cliente_id = c.id
         AND ps.partner_id = puc.partner_id
         AND (
           v_is_tec = true AND ps.created_by = v_uid
           OR v_is_gest = true AND ps.created_by = v_target
           OR v_is_admin = true AND (v_target IS NULL OR ps.created_by = v_target)
         )
    ) AS ultima_simulacao_at,
    (SELECT count(*) FROM public.partner_simulations ps
       WHERE ps.cliente_id = c.id
         AND ps.partner_id = puc.partner_id
         AND (
           v_is_tec = true AND ps.created_by = v_uid
           OR v_is_gest = true AND ps.created_by = v_target
           OR v_is_admin = true AND (v_target IS NULL OR ps.created_by = v_target)
         )
    ) AS total_simulacoes
  FROM public.partner_user_clients puc
  JOIN public.clientes c ON c.id = puc.cliente_id
  WHERE puc.active = true
    AND (v_target IS NULL OR puc.user_id = v_target)
    AND (p_search IS NULL OR p_search = '' OR
         coalesce(c.nome,'') ILIKE '%'||p_search||'%' OR
         coalesce(c.razao_social,'') ILIKE '%'||p_search||'%' OR
         coalesce(c.nome_fantasia,'') ILIKE '%'||p_search||'%' OR
         coalesce(c.endereco_municipio,'') ILIKE '%'||p_search||'%');
END;
$function$;
