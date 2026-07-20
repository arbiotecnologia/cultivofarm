
DROP FUNCTION IF EXISTS public.get_b2b_user_client_detail_secure(uuid);

CREATE OR REPLACE FUNCTION public.get_b2b_user_client_detail_secure(
  p_cliente_id uuid,
  p_scope text DEFAULT 'meus_produtores'
)
RETURNS TABLE(
  cliente_id uuid, nome text, razao_social text, nome_fantasia text, tipo_pessoa text,
  documento_mascarado text, telefone text, email text, cidade text, estado text,
  assignment_type text, can_create_simulation boolean, assigned_at timestamp with time zone
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_ok boolean := false;
  v_scope text := COALESCE(p_scope, 'meus_produtores');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF v_scope NOT IN ('meus_produtores','equipe','admin') THEN
    RAISE EXCEPTION 'invalid scope';
  END IF;

  IF has_role(v_uid,'parceiro_b2b_tecnico'::app_role) THEN
    v_scope := 'meus_produtores';
    v_ok := EXISTS(SELECT 1 FROM public.partner_user_clients puc
                   WHERE puc.user_id = v_uid AND puc.cliente_id = p_cliente_id AND puc.active = true);
  ELSIF has_role(v_uid,'parceiro_b2b'::app_role) THEN
    v_partner := get_user_partner_id();
    IF v_scope = 'meus_produtores' THEN
      v_ok := EXISTS(SELECT 1 FROM public.partner_user_clients puc
                     WHERE puc.user_id = v_uid
                       AND puc.cliente_id = p_cliente_id
                       AND puc.partner_id = v_partner
                       AND puc.active = true);
    ELSIF v_scope = 'equipe' THEN
      v_ok := EXISTS(SELECT 1 FROM public.partner_clients pc
                     WHERE pc.partner_id = v_partner AND pc.cliente_id = p_cliente_id AND pc.active = true);
    END IF;
  ELSIF has_role(v_uid,'administrador'::app_role) OR has_role(v_uid,'gestor_comercial'::app_role) THEN
    IF v_scope IN ('admin','equipe') THEN
      v_ok := true;
    END IF;
  END IF;

  IF NOT v_ok THEN RAISE EXCEPTION 'access denied'; END IF;

  RETURN QUERY
  SELECT c.id, c.nome, c.razao_social, c.nome_fantasia, c.tipo_pessoa,
    CASE WHEN c.cpf_cnpj IS NULL THEN NULL
         ELSE repeat('*', greatest(length(c.cpf_cnpj)-4,0)) || right(c.cpf_cnpj,4)
    END,
    c.telefone, c.email,
    c.endereco_municipio, c.endereco_estado,
    (SELECT assignment_type FROM public.partner_user_clients puc
      WHERE puc.cliente_id = c.id AND puc.user_id = v_uid AND puc.active = true LIMIT 1),
    (SELECT can_create_simulation FROM public.partner_user_clients puc
      WHERE puc.cliente_id = c.id AND puc.user_id = v_uid AND puc.active = true LIMIT 1),
    (SELECT assigned_at FROM public.partner_user_clients puc
      WHERE puc.cliente_id = c.id AND puc.user_id = v_uid AND puc.active = true LIMIT 1)
  FROM public.clientes c
  WHERE c.id = p_cliente_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_b2b_user_client_detail_secure(uuid, text) TO authenticated;
