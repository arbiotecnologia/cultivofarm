CREATE OR REPLACE FUNCTION public.admin_provision_user_profile_v1(p_user_id uuid, p_email text, p_nome text, p_roles app_role[], p_cliente_ids uuid[] DEFAULT ARRAY[]::uuid[], p_principal_cliente_id uuid DEFAULT NULL::uuid, p_partner_id uuid DEFAULT NULL::uuid, p_partner_papel text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_cargo text DEFAULT NULL::text, p_cpf_cnpj text DEFAULT NULL::text, p_crea text DEFAULT NULL::text, p_especialidade text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_profile_count integer;
  v_role_count integer;
  v_cliente_count integer;
  v_partner_role_count integer;
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL OR p_nome IS NULL THEN
    RAISE EXCEPTION 'invalid_user_payload' USING ERRCODE = '22023';
  END IF;

  v_role_count := COALESCE(cardinality(p_roles), 0);
  IF v_role_count = 0 OR v_role_count > 13 THEN
    RAISE EXCEPTION 'invalid_roles' USING ERRCODE = '22023';
  END IF;

  IF 'superadmin'::public.app_role = ANY(p_roles) THEN
    RAISE EXCEPTION 'superadmin_role_reserved' USING ERRCODE = '42501';
  END IF;

  IF v_role_count <> (SELECT count(DISTINCT r) FROM unnest(p_roles) AS r) THEN
    RAISE EXCEPTION 'duplicate_roles' USING ERRCODE = '22023';
  END IF;

  p_cliente_ids := COALESCE(p_cliente_ids, ARRAY[]::uuid[]);
  v_cliente_count := cardinality(p_cliente_ids);
  IF v_cliente_count > 100
     OR v_cliente_count <> (SELECT count(DISTINCT c) FROM unnest(p_cliente_ids) AS c) THEN
    RAISE EXCEPTION 'invalid_customer_links' USING ERRCODE = '22023';
  END IF;

  IF 'cliente_produtor'::public.app_role = ANY(p_roles) AND v_cliente_count = 0 THEN
    RAISE EXCEPTION 'producer_requires_customer' USING ERRCODE = '23514';
  END IF;

  IF p_principal_cliente_id IS NOT NULL
     AND NOT (p_principal_cliente_id = ANY(p_cliente_ids)) THEN
    RAISE EXCEPTION 'invalid_primary_customer' USING ERRCODE = '23514';
  END IF;

  IF v_cliente_count > 0 AND (
    SELECT count(*) FROM public.clientes c WHERE c.id = ANY(p_cliente_ids)
  ) <> v_cliente_count THEN
    RAISE EXCEPTION 'customer_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO v_partner_role_count
  FROM unnest(p_roles) AS r
  WHERE r IN ('parceiro_b2b'::public.app_role, 'parceiro_b2b_tecnico'::public.app_role);

  IF v_partner_role_count > 1 THEN
    RAISE EXCEPTION 'conflicting_partner_roles' USING ERRCODE = '23514';
  END IF;

  IF v_partner_role_count = 1 THEN
    IF p_partner_id IS NULL OR p_partner_papel NOT IN ('gestor', 'tecnico') THEN
      RAISE EXCEPTION 'invalid_partner_link' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.partner_accounts pa WHERE pa.id = p_partner_id) THEN
      RAISE EXCEPTION 'partner_not_found' USING ERRCODE = '23503';
    END IF;
  ELSIF p_partner_id IS NOT NULL OR p_partner_papel IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_partner_link' USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_profile_count
  FROM public.profiles p
  WHERE p.user_id = p_user_id;

  IF v_profile_count <> 1
     OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.user_clientes uc WHERE uc.user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_ready_for_provisioning' USING ERRCODE = '23514';
  END IF;

  UPDATE public.profiles
     SET nome = p_nome,
         email = p_email,
         telefone = NULLIF(p_telefone, ''),
         cargo = NULLIF(p_cargo, ''),
         cpf_cnpj = NULLIF(p_cpf_cnpj, ''),
         crea = NULLIF(p_crea, ''),
         especialidade = NULLIF(p_especialidade, '')
   WHERE user_id = p_user_id;

  IF v_cliente_count > 0 THEN
    INSERT INTO public.user_clientes (user_id, cliente_id, principal)
    SELECT p_user_id, c,
           c = COALESCE(p_principal_cliente_id, p_cliente_ids[1])
    FROM unnest(p_cliente_ids) AS c;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  SELECT p_user_id, r FROM unnest(p_roles) AS r;

  IF v_partner_role_count = 1 THEN
    INSERT INTO public.partner_users (user_id, partner_id, papel)
    VALUES (p_user_id, p_partner_id, p_partner_papel);
  END IF;
END;
$function$
