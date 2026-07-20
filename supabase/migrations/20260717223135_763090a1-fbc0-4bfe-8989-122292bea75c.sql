
-- ============================================================
-- FASE 3+4 · Presença multiprofissional
-- Autorização granular + tabela de participantes + organização
-- ============================================================

-- 1) organizations ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  partner_account_id uuid REFERENCES public.partner_accounts(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_partner_account_uidx
  ON public.organizations(partner_account_id) WHERE partner_account_id IS NOT NULL;

GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select_authenticated" ON public.organizations;
CREATE POLICY "organizations_select_authenticated"
  ON public.organizations FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "organizations_admin_manage" ON public.organizations;
CREATE POLICY "organizations_admin_manage"
  ON public.organizations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

-- Back-fill: 1 organização por partner_account ativo
INSERT INTO public.organizations (nome, partner_account_id, ativo)
SELECT COALESCE(pa.nome_fantasia, pa.razao_social, pa.codigo, 'Organização ' || pa.id::text),
       pa.id, COALESCE(pa.ativo, true)
FROM public.partner_accounts pa
WHERE pa.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.partner_account_id = pa.id
  );

-- 2) profiles.organization_id ------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_organization_id_idx
  ON public.profiles(organization_id);

-- Back-fill a partir de partner_users (primeiro vínculo ativo)
UPDATE public.profiles p
SET organization_id = o.id
FROM public.partner_users pu
JOIN public.organizations o ON o.partner_account_id = pu.partner_id
WHERE p.organization_id IS NULL
  AND p.user_id = pu.user_id;

-- 3) technical_visit_assignments ---------------------------------
CREATE TABLE IF NOT EXISTS public.technical_visit_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registro_consultor_id uuid NOT NULL REFERENCES public.registros_consultor(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'participante',
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removal_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tva_role_chk CHECK (role IN ('responsavel','participante','gestor','observador'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tva_unique_active_participant
  ON public.technical_visit_assignments (registro_consultor_id, user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS tva_registro_idx
  ON public.technical_visit_assignments (registro_consultor_id);
CREATE INDEX IF NOT EXISTS tva_user_idx
  ON public.technical_visit_assignments (user_id);

GRANT SELECT ON public.technical_visit_assignments TO authenticated;
GRANT ALL ON public.technical_visit_assignments TO service_role;
-- Mutations passarão pelas RPCs (Fase 5-6). Nenhum INSERT/UPDATE/DELETE direto para authenticated.

ALTER TABLE public.technical_visit_assignments ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tva_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_tva_updated_at ON public.technical_visit_assignments;
CREATE TRIGGER trg_tva_updated_at
  BEFORE UPDATE ON public.technical_visit_assignments
  FOR EACH ROW EXECUTE FUNCTION public.tva_touch_updated_at();

-- 4) Helpers granulares -----------------------------------------
-- Organização do consultor responsável pela visita
CREATE OR REPLACE FUNCTION public.get_visit_organization_id(p_registro_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.organization_id
  FROM public.registros_consultor r
  LEFT JOIN public.profiles p ON p.user_id = r.consultor_profile_id
  WHERE r.id = p_registro_id
$$;

-- Participante ativo da visita
CREATE OR REPLACE FUNCTION public.is_active_visit_participant(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.technical_visit_assignments
    WHERE registro_consultor_id = p_registro_id
      AND user_id = p_user_id
      AND is_active = true
  )
$$;

-- Gestor ativo da mesma organização do responsável pela visita
CREATE OR REPLACE FUNCTION public.is_visit_org_manager(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.organizations o ON o.id = p.organization_id AND o.ativo = true
    WHERE p.user_id = p_user_id
      AND p.ativo = true
      AND p.organization_id IS NOT NULL
      AND p.organization_id = public.get_visit_organization_id(p_registro_id)
      AND public.has_role(p_user_id, 'gestor')
  )
$$;

-- Consultor responsável
CREATE OR REPLACE FUNCTION public.is_visit_responsible(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.registros_consultor
    WHERE id = p_registro_id AND consultor_profile_id = p_user_id
  )
$$;

-- can_view: admin OR responsável OR participante ativo OR gestor da mesma org
CREATE OR REPLACE FUNCTION public.can_view_technical_visit(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(p_user_id, 'administrador')
    OR public.is_visit_responsible(p_user_id, p_registro_id)
    OR public.is_active_visit_participant(p_user_id, p_registro_id)
    OR public.is_visit_org_manager(p_user_id, p_registro_id)
$$;

-- can_checkin / can_checkout: admin OR responsável OR participante ativo
-- (gestor NÃO faz check-in em nome de terceiro nesta fase)
CREATE OR REPLACE FUNCTION public.can_checkin_technical_visit(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(p_user_id, 'administrador')
    OR public.is_visit_responsible(p_user_id, p_registro_id)
    OR public.is_active_visit_participant(p_user_id, p_registro_id)
$$;

CREATE OR REPLACE FUNCTION public.can_checkout_technical_visit(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_checkin_technical_visit(p_user_id, p_registro_id)
$$;

-- can_manage_technical_visit: substituição semântica → gestão de EQUIPE.
-- admin OR responsável OR gestor da mesma organização.
CREATE OR REPLACE FUNCTION public.can_manage_technical_visit(p_user_id uuid, p_registro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(p_user_id, 'administrador')
    OR public.is_visit_responsible(p_user_id, p_registro_id)
    OR public.is_visit_org_manager(p_user_id, p_registro_id)
$$;

-- 5) RLS technical_visit_assignments -----------------------------
DROP POLICY IF EXISTS "tva_select_visit_authorized" ON public.technical_visit_assignments;
CREATE POLICY "tva_select_visit_authorized"
  ON public.technical_visit_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.can_view_technical_visit(auth.uid(), registro_consultor_id)
  );

-- Não criamos policies INSERT/UPDATE/DELETE: mutations passarão via RPC
-- (Fase 6). Sem policy = negado por RLS.

-- 6) Registrar responsável como participante ativo ---------------
-- Garante que o consultor_profile_id atual de cada visita conste em TVA.
INSERT INTO public.technical_visit_assignments
  (registro_consultor_id, user_id, role, is_active, assigned_by)
SELECT r.id, r.consultor_profile_id, 'responsavel', true, r.consultor_profile_id
FROM public.registros_consultor r
WHERE r.consultor_profile_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.technical_visit_assignments t
    WHERE t.registro_consultor_id = r.id
      AND t.user_id = r.consultor_profile_id
      AND t.is_active = true
  );
