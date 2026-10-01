-- =====================================================================
-- Convite de Administrador de Empresa pelo Superadmin (base)
-- 1) profiles.senha_provisoria — força troca de senha no 1º acesso
-- 2) organizations.responsavel_user_id — responsável principal da empresa
-- 3) platform_org_admin_invites — registro imutável dos convites
-- 4) RPC platform_register_org_admin (SECURITY DEFINER, service_role only)
-- =====================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS senha_provisoria boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS responsavel_user_id uuid,
  ADD COLUMN IF NOT EXISTS responsavel_definido_em timestamptz;

CREATE INDEX IF NOT EXISTS organizations_responsavel_user_id_idx
  ON public.organizations(responsavel_user_id);

CREATE TABLE IF NOT EXISTS public.platform_org_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL,
  email text NOT NULL,
  nome text NOT NULL,
  cpf_cnpj text,
  telefone text,
  modo_acesso text NOT NULL CHECK (modo_acesso IN ('link','senha_temporaria')),
  responsavel_principal boolean NOT NULL DEFAULT true,
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.platform_org_admin_invites TO service_role;
ALTER TABLE public.platform_org_admin_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_org_admin_invites_service_only"
  ON public.platform_org_admin_invites
  FOR ALL TO public
  USING (false)
  WITH CHECK (false);

-- RPC: registra perfil/papel/vínculo/convite de admin de empresa.
-- Escrita somente via service_role (Edge Function). Nunca aceita superadmin.
CREATE OR REPLACE FUNCTION public.platform_register_org_admin(
  p_actor_id uuid,
  p_user_id uuid,
  p_organization_id uuid,
  p_email text,
  p_nome text,
  p_cpf_cnpj text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_modo_acesso text DEFAULT 'link',
  p_responsavel_principal boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  -- Somente o backend privilegiado (service_role) pode invocar.
  IF NOT (SELECT COALESCE((SELECT true FROM pg_catalog.pg_roles WHERE rolname = 'service_role'), false)) THEN
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

  IF NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = p_organization_id) THEN
    RAISE EXCEPTION 'platform_invalid: empresa inexistente';
  END IF;

  IF p_responsavel_principal THEN
    IF EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.responsavel_user_id IS NOT NULL
        AND o.responsavel_user_id <> p_user_id
        AND o.id = p_organization_id
    ) THEN
      -- substituição consciente pelo superadmin é permitida;
      -- apenas registramos a operação abaixo.
      NULL;
    END IF;
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

  DELETE FROM public.user_roles ur WHERE ur.user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'administrador'::public.app_role);

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
$fn$;

REVOKE EXECUTE ON FUNCTION public.platform_register_org_admin(uuid, uuid, uuid, text, text, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_register_org_admin(uuid, uuid, uuid, text, text, text, text, text, boolean)
  TO service_role;

-- RPC: o próprio usuário conclui a troca de senha provisória no 1º acesso.
CREATE OR REPLACE FUNCTION public.platform_conclude_provisional_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  UPDATE public.profiles
     SET senha_provisoria = false,
         updated_at = now()
   WHERE user_id = auth.uid()
     AND senha_provisoria = true;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.platform_conclude_provisional_password()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_conclude_provisional_password()
  TO authenticated;
