CREATE OR REPLACE FUNCTION public.platform_register_org_admin(
  p_actor_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_email text,
  p_nome text,
  p_cpf_cnpj text DEFAULT NULL::text,
  p_telefone text DEFAULT NULL::text,
  p_modo_acesso text DEFAULT 'link'::text,
  p_responsavel_principal boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  -- Identidade real de execução: apenas o backend privilegiado.
  v_jwt_role := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'role'),
    ''
  );
  IF v_jwt_role <> 'service_role' AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'platform_forbidden: uso restrito ao backend da plataforma';
  END IF;

  IF p_actor_id IS NULL OR NOT public.is_platform_superadmin(p_actor_id) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin de plataforma';
  END IF;

  IF p_user_id IS NULL OR p_organization_id IS NULL
     OR p_email IS NULL OR lower(btrim(p_email)) = ''
     OR p_nome IS NULL OR btrim(p_nome) = '' THEN
    RAISE EXCEPTION 'platform_invalid: dados do administrador incompletos';
  END IF;

  IF p_modo_acesso NOT IN ('link','senha_temporaria') THEN
    RAISE EXCEPTION 'platform_invalid: modo de acesso inválido';
  END IF;

  -- Nunca converter uma conta de plataforma em administrador operacional.
  IF public.is_platform_superadmin(p_user_id) THEN
    RAISE EXCEPTION 'platform_forbidden: conta de plataforma não pode virar administrador de empresa';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id) THEN
    RAISE EXCEPTION 'platform_invalid: empresa inexistente';
  END IF;

  INSERT INTO public.profiles AS prof
    (user_id, nome, email, telefone, cargo, cpf_cnpj, ativo, organization_id, senha_provisoria)
  VALUES
    (p_user_id, btrim(p_nome), lower(btrim(p_email)),
     NULLIF(btrim(COALESCE(p_telefone,'')), ''),
     CASE WHEN p_responsavel_principal THEN 'Responsável Principal' ELSE 'Administrador' END,
     NULLIF(btrim(COALESCE(p_cpf_cnpj,'')), ''),
     true, p_organization_id, true)
  ON CONFLICT (user_id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    telefone = EXCLUDED.telefone,
    cargo = EXCLUDED.cargo,
    cpf_cnpj = EXCLUDED.cpf_cnpj,
    ativo = true,
    organization_id = EXCLUDED.organization_id,
    senha_provisoria = EXCLUDED.senha_provisoria,
    updated_at = now();

  -- Acrescenta o papel sem destruir papéis já existentes do usuário.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'administrador'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF p_responsavel_principal THEN
    UPDATE public.organizations
       SET responsavel_user_id = p_user_id,
           responsavel_definido_em = now(),
           updated_at = now()
     WHERE id = p_organization_id;
  END IF;

  INSERT INTO public.platform_org_admin_invites
    (organization_id, user_id, email, nome, cpf_cnpj, telefone, modo_acesso, responsavel_principal, invited_by)
  VALUES
    (p_organization_id, p_user_id, lower(btrim(p_email)), btrim(p_nome),
     NULLIF(btrim(COALESCE(p_cpf_cnpj,'')), ''),
     NULLIF(btrim(COALESCE(p_telefone,'')), ''),
     p_modo_acesso, p_responsavel_principal, p_actor_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_register_org_admin(uuid,uuid,uuid,text,text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_register_org_admin(uuid,uuid,uuid,text,text,text,text,text,boolean) TO service_role;
