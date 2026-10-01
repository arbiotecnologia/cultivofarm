BEGIN;

-- 1) Tabela de convites: privilégios mínimos
REVOKE ALL ON public.platform_org_admin_invites FROM anon, authenticated;
GRANT SELECT ON public.platform_org_admin_invites TO authenticated;
GRANT ALL ON public.platform_org_admin_invites TO service_role;
ALTER TABLE public.platform_org_admin_invites
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS concluido_em timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='platform_org_admin_invites_status_chk') THEN
    ALTER TABLE public.platform_org_admin_invites
      ADD CONSTRAINT platform_org_admin_invites_status_chk CHECK (status IN ('pendente','ativo'));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS platform_org_admin_invites_email_uidx
  ON public.platform_org_admin_invites (lower(email));
CREATE INDEX IF NOT EXISTS platform_org_admin_invites_org_idx
  ON public.platform_org_admin_invites (organization_id);

-- 2) Estado privado da senha provisória (fora do Data API)
CREATE SCHEMA IF NOT EXISTS platform_private;
REVOKE ALL ON SCHEMA platform_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS platform_private.provisional_password_state (
  user_id uuid PRIMARY KEY,
  pwd_digest text NOT NULL,
  desde timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON platform_private.provisional_password_state FROM PUBLIC, anon, authenticated;
ALTER TABLE platform_private.provisional_password_state ENABLE ROW LEVEL SECURITY;

-- 3) Guarda: senha_provisoria só muda por backend ou pela conclusão controlada
CREATE OR REPLACE FUNCTION public.guard_profile_senha_provisoria()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF current_user IN ('postgres','service_role','supabase_auth_admin') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.senha_provisoria IS TRUE THEN
      RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.senha_provisoria IS DISTINCT FROM OLD.senha_provisoria THEN
    IF NOT (OLD.senha_provisoria IS TRUE AND NEW.senha_provisoria IS FALSE
            AND current_setting('cf.concluir_senha', true) = 'on'
            AND NEW.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'profile_sensitive_fields_forbidden' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profile_senha_provisoria ON public.profiles;
CREATE TRIGGER guard_profile_senha_provisoria BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_senha_provisoria();

-- 4) Conclusão: exige que a senha tenha realmente mudado
DROP FUNCTION IF EXISTS public.platform_conclude_provisional_password();
CREATE OR REPLACE FUNCTION public.platform_conclude_provisional_password()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_uid uuid := auth.uid(); v_digest text; v_atual text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid AND senha_provisoria IS TRUE) THEN
    RETURN true;
  END IF;
  SELECT pwd_digest INTO v_digest FROM platform_private.provisional_password_state WHERE user_id = v_uid;
  SELECT md5(COALESCE(u.encrypted_password,'')) INTO v_atual FROM auth.users u WHERE u.id = v_uid;
  IF v_digest IS NULL OR v_atual IS NULL OR v_atual = v_digest OR v_atual = md5('') THEN
    RAISE EXCEPTION 'platform_senha_nao_alterada' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('cf.concluir_senha','on', true);
  UPDATE public.profiles SET senha_provisoria = false, updated_at = now() WHERE user_id = v_uid;
  PERFORM set_config('cf.concluir_senha','off', true);
  UPDATE public.platform_org_admin_invites SET status='ativo', concluido_em=now()
   WHERE user_id = v_uid AND status='pendente';
  DELETE FROM platform_private.provisional_password_state WHERE user_id = v_uid;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.platform_conclude_provisional_password() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_conclude_provisional_password() TO authenticated, service_role;

-- 5) Registro: somente contas recém-criadas, sem empresa e sem papéis
CREATE OR REPLACE FUNCTION public.platform_register_org_admin(p_actor_id uuid, p_user_id uuid, p_organization_id uuid, p_email text, p_nome text, p_cpf_cnpj text DEFAULT NULL, p_telefone text DEFAULT NULL, p_modo_acesso text DEFAULT 'link', p_responsavel_principal boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
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

  INSERT INTO platform_private.provisional_password_state (user_id, pwd_digest)
  SELECT p_user_id, md5(COALESCE(u.encrypted_password,'')) FROM auth.users u WHERE u.id = p_user_id
  ON CONFLICT (user_id) DO UPDATE SET pwd_digest = EXCLUDED.pwd_digest, desde = now();

  IF p_responsavel_principal THEN
    UPDATE public.organizations SET responsavel_user_id = p_user_id, responsavel_definido_em = now(), updated_at = now()
     WHERE id = p_organization_id;
  END IF;

  INSERT INTO public.platform_org_admin_invites
    (organization_id, user_id, email, nome, cpf_cnpj, telefone, modo_acesso, responsavel_principal, invited_by, status)
  VALUES (p_organization_id, p_user_id, v_email, btrim(p_nome), v_cpf, v_tel, p_modo_acesso, p_responsavel_principal, p_actor_id, 'pendente');
END $$;
REVOKE ALL ON FUNCTION public.platform_register_org_admin(uuid,uuid,uuid,text,text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_register_org_admin(uuid,uuid,uuid,text,text,text,text,text,boolean) TO service_role;

COMMIT;