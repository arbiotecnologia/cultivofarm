-- ============================================================
-- Primeiro acesso: conclusão 100% server-side, sem MD5/GUC
-- ============================================================

-- 1) Nova conclusão server-side (chamada apenas pela Edge Function, via service_role).
CREATE OR REPLACE FUNCTION platform_private.conclude_provisional_password_server(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_jwt_role text;
BEGIN
  v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), '');
  IF v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'platform_forbidden: uso restrito ao backend da plataforma' USING ERRCODE='42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: usuário ausente' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = p_user_id AND senha_provisoria IS TRUE
  ) THEN
    RAISE EXCEPTION 'platform_primeiro_acesso_nao_pendente' USING ERRCODE='22023';
  END IF;

  -- Operação lógica única (transação do chamador): libera perfil, ativa convite
  -- e limpa o estado de primeiro acesso. Falha em qualquer passo reverte tudo.
  UPDATE public.profiles
     SET senha_provisoria = false, updated_at = now()
   WHERE user_id = p_user_id AND senha_provisoria IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_primeiro_acesso_nao_pendente' USING ERRCODE='22023';
  END IF;

  UPDATE public.platform_org_admin_invites
     SET status = 'ativo', concluido_em = now()
   WHERE user_id = p_user_id AND status = 'pendente';

  DELETE FROM platform_private.provisional_password_state WHERE user_id = p_user_id;

  RETURN true;
END $function$;

-- Wrapper público: EXECUTE apenas para service_role (nunca cliente).
CREATE OR REPLACE FUNCTION public.platform_conclude_provisional_password_server(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO platform_private, public
AS $function$
  SELECT platform_private.conclude_provisional_password_server(p_user_id)
$function$;

REVOKE ALL ON FUNCTION public.platform_conclude_provisional_password_server(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_conclude_provisional_password_server(uuid) TO service_role;

-- 2) Verificação server-only de primeiro acesso (leitura pela Edge Function).
CREATE OR REPLACE FUNCTION public.platform_first_access_pending(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO platform_private, public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = p_user_id
      AND p.senha_provisoria IS TRUE
      AND EXISTS (SELECT 1 FROM platform_private.provisional_password_state s WHERE s.user_id = p.user_id)
  )
$function$;

REVOKE ALL ON FUNCTION public.platform_first_access_pending(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_first_access_pending(uuid) TO service_role;

-- 3) Fecha o caminho antigo: cliente não pode mais chamar a RPC baseada em MD5.
REVOKE EXECUTE ON FUNCTION public.platform_conclude_provisional_password() FROM PUBLIC, anon, authenticated;

-- 4) Guarda da marca: elimina a fronteira por flag de sessão (GUC).
--    A marca só muda dentro de contexto privilegiado (função SECURITY DEFINER
--    do backend) ou via ticket transacional do padrão da plataforma.
CREATE OR REPLACE FUNCTION public.guard_profile_senha_provisoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.senha_provisoria IS TRUE THEN
      RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria THEN
    RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $function$;

-- 5) Provisionamento: grava apenas o estado de primeiro acesso (sem hash de senha).
CREATE OR REPLACE FUNCTION public.platform_register_org_admin(p_actor_id uuid, p_user_id uuid, p_organization_id uuid, p_email text, p_nome text, p_cpf_cnpj text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_modo_acesso text DEFAULT 'link'::text, p_responsavel_principal boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_jwt_role text; v_cpf text; v_tel text; v_email text; v_auth_email text; v_auth_created timestamptz;
BEGIN
  v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'role'), '');
  IF v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'platform_forbidden: uso restrito ao backend da plataforma';
  END IF;
  IF p_actor_id IS NULL OR NOT public.is_platform_superadmin(p_actor_id) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin de plataforma';
  END IF;
  v_email := lower(btrim(COALESCE(p_email,'')));
  v_cpf := NULLIF(regexp_replace(COALESCE(p_cpf_cnpj,''), '\D', '', 'g'), '');
  v_tel := NULLIF(regexp_replace(COALESCE(p_telefone,''), '\D', '', 'g'), '');
  IF p_user_id IS NULL OR p_organization_id IS NULL OR v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
     OR length(btrim(COALESCE(p_nome,''))) < 3 OR length(btrim(p_nome)) > 200 THEN
    RAISE EXCEPTION 'platform_invalid: dados do administrador incompletos';
  END IF;
  IF v_cpf IS NOT NULL AND length(v_cpf) <> 11 THEN RAISE EXCEPTION 'platform_invalid: cpf'; END IF;
  IF v_tel IS NOT NULL AND length(v_tel) NOT IN (10,11) THEN RAISE EXCEPTION 'platform_invalid: telefone'; END IF;
  IF p_modo_acesso NOT IN ('link','senha_temporaria') THEN RAISE EXCEPTION 'platform_invalid: modo'; END IF;
  IF public.is_platform_superadmin(p_user_id) THEN
    RAISE EXCEPTION 'platform_forbidden: conta de plataforma não pode virar administrador de empresa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id AND o.ativo IS TRUE) THEN
    RAISE EXCEPTION 'platform_invalid: empresa inexistente ou inativa';
  END IF;
  SELECT lower(u.email), u.created_at INTO v_auth_email, v_auth_created FROM auth.users u WHERE u.id = p_user_id;
  IF v_auth_email IS NULL OR v_auth_email <> v_email OR v_auth_created < now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'platform_conflict: conta não é nova';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id AND (organization_id IS NOT NULL OR cliente_id IS NOT NULL))
     OR EXISTS (SELECT 1 FROM public.platform_org_admin_invites WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'platform_conflict: usuário já existente';
  END IF;

  INSERT INTO public.profiles AS prof (user_id, nome, email, telefone, cargo, cpf_cnpj, ativo, organization_id, senha_provisoria)
  VALUES (p_user_id, btrim(p_nome), v_email, v_tel,
          CASE WHEN p_responsavel_principal THEN 'Responsável Principal' ELSE 'Administrador' END,
          v_cpf, true, p_organization_id, true)
  ON CONFLICT (user_id) DO UPDATE SET nome = EXCLUDED.nome, email = EXCLUDED.email, telefone = EXCLUDED.telefone,
    cargo = EXCLUDED.cargo, cpf_cnpj = EXCLUDED.cpf_cnpj, ativo = true,
    organization_id = EXCLUDED.organization_id, senha_provisoria = true, updated_at = now();

  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'administrador'::public.app_role);

  INSERT INTO platform_private.provisional_password_state (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO UPDATE SET desde = now(), pwd_digest = NULL;

  IF p_responsavel_principal THEN
    UPDATE public.organizations SET responsavel_user_id = p_user_id, responsavel_definido_em = now(), updated_at = now()
     WHERE id = p_organization_id;
  END IF;

  INSERT INTO public.platform_org_admin_invites
    (organization_id, user_id, email, nome, cpf_cnpj, telefone, modo_acesso, responsavel_principal, invited_by, status)
  VALUES (p_organization_id, p_user_id, v_email, btrim(p_nome), v_cpf, v_tel, p_modo_acesso, p_responsavel_principal, p_actor_id, 'pendente');
END $function$;

-- 6) Acesso de leitura server-only ao estado de primeiro acesso.
GRANT SELECT ON platform_private.provisional_password_state TO service_role;