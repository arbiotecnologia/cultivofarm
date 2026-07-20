
-- =========================================================
-- FASE B2B: partner_clients + partner_user_clients + RPCs
-- =========================================================

-- Trigger util genérico (idempotente)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================
-- 1) partner_clients
-- =========================================================
CREATE TABLE IF NOT EXISTS public.partner_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_clients_unique UNIQUE (partner_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_clients_partner ON public.partner_clients(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_clients_cliente ON public.partner_clients(cliente_id);
CREATE INDEX IF NOT EXISTS idx_partner_clients_active  ON public.partner_clients(active);
CREATE INDEX IF NOT EXISTS idx_partner_clients_partner_active  ON public.partner_clients(partner_id, active);
CREATE INDEX IF NOT EXISTS idx_partner_clients_partner_cliente_active ON public.partner_clients(partner_id, cliente_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_clients TO authenticated;
GRANT ALL ON public.partner_clients TO service_role;

ALTER TABLE public.partner_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pc_select ON public.partner_clients;
CREATE POLICY pc_select ON public.partner_clients FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR ((has_role(auth.uid(), 'parceiro_b2b'::app_role) OR has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role))
      AND partner_id = get_user_partner_id())
);

DROP POLICY IF EXISTS pc_insert ON public.partner_clients;
CREATE POLICY pc_insert ON public.partner_clients FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND partner_id = get_user_partner_id())
);

DROP POLICY IF EXISTS pc_update ON public.partner_clients;
CREATE POLICY pc_update ON public.partner_clients FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND partner_id = get_user_partner_id())
) WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND partner_id = get_user_partner_id())
);

DROP TRIGGER IF EXISTS trg_partner_clients_updated ON public.partner_clients;
CREATE TRIGGER trg_partner_clients_updated
BEFORE UPDATE ON public.partner_clients
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- 2) partner_user_clients
-- =========================================================
CREATE TABLE IF NOT EXISTS public.partner_user_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_role text,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  assignment_type text NOT NULL DEFAULT 'monitoramento'
    CHECK (assignment_type IN ('monitoramento','tecnico','comercial','gestao')),
  can_create_simulation boolean NOT NULL DEFAULT true,
  can_monitor boolean NOT NULL DEFAULT true,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_user_clients_unique UNIQUE (partner_id, user_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_puc_partner ON public.partner_user_clients(partner_id);
CREATE INDEX IF NOT EXISTS idx_puc_user ON public.partner_user_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_puc_cliente ON public.partner_user_clients(cliente_id);
CREATE INDEX IF NOT EXISTS idx_puc_active ON public.partner_user_clients(active);
CREATE INDEX IF NOT EXISTS idx_puc_partner_user_active ON public.partner_user_clients(partner_id, user_id, active);
CREATE INDEX IF NOT EXISTS idx_puc_partner_cliente_active ON public.partner_user_clients(partner_id, cliente_id, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_user_clients TO authenticated;
GRANT ALL ON public.partner_user_clients TO service_role;

ALTER TABLE public.partner_user_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS puc_select ON public.partner_user_clients;
CREATE POLICY puc_select ON public.partner_user_clients FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND partner_id = get_user_partner_id())
  OR (has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role) AND user_id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS puc_insert ON public.partner_user_clients;
CREATE POLICY puc_insert ON public.partner_user_clients FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND partner_id = get_user_partner_id())
);

DROP POLICY IF EXISTS puc_update ON public.partner_user_clients;
CREATE POLICY puc_update ON public.partner_user_clients FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND partner_id = get_user_partner_id())
) WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND partner_id = get_user_partner_id())
);

DROP TRIGGER IF EXISTS trg_puc_updated ON public.partner_user_clients;
CREATE TRIGGER trg_puc_updated
BEFORE UPDATE ON public.partner_user_clients
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- 3) Helper: is_valid_b2b_partner_user
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_valid_b2b_partner_user(p_user_id uuid, p_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_users pu
    JOIN public.partner_accounts pa ON pa.id = pu.partner_id
    WHERE pu.user_id = p_user_id
      AND pu.partner_id = p_partner_id
      AND pa.ativo = true
      AND (
        public.has_role(p_user_id, 'parceiro_b2b'::app_role)
        OR public.has_role(p_user_id, 'parceiro_b2b_tecnico'::app_role)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_b2b_user_role_for_partner(p_user_id uuid, p_partner_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(p_user_id, 'parceiro_b2b_tecnico'::app_role) THEN 'parceiro_b2b_tecnico'
    WHEN public.has_role(p_user_id, 'parceiro_b2b'::app_role) THEN 'parceiro_b2b'
    ELSE NULL
  END
  FROM public.partner_users pu
  WHERE pu.user_id = p_user_id AND pu.partner_id = p_partner_id
  LIMIT 1;
$$;

-- =========================================================
-- 4) Trigger de validação em partner_user_clients
-- =========================================================
CREATE OR REPLACE FUNCTION public.validate_partner_user_client_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Preenche user_role automaticamente se vazio
  IF NEW.user_role IS NULL THEN
    NEW.user_role := public.get_b2b_user_role_for_partner(NEW.user_id, NEW.partner_id);
  END IF;

  -- Usuário deve pertencer ao parceiro
  IF NOT public.is_valid_b2b_partner_user(NEW.user_id, NEW.partner_id) THEN
    RAISE EXCEPTION 'Usuário % não é um usuário B2B válido do parceiro %', NEW.user_id, NEW.partner_id;
  END IF;

  -- Cliente deve estar vinculado ao parceiro (ativo) em partner_clients
  IF NOT EXISTS (
    SELECT 1 FROM public.partner_clients pc
    WHERE pc.partner_id = NEW.partner_id
      AND pc.cliente_id = NEW.cliente_id
      AND pc.active = true
  ) THEN
    RAISE EXCEPTION 'Cliente % não está vinculado ao parceiro %', NEW.cliente_id, NEW.partner_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_puc ON public.partner_user_clients;
CREATE TRIGGER trg_validate_puc
BEFORE INSERT OR UPDATE ON public.partner_user_clients
FOR EACH ROW EXECUTE FUNCTION public.validate_partner_user_client_fn();

-- =========================================================
-- 5) Trigger de sincronização com partner_technician_clients
--    Mantém compatibilidade com código legado
-- =========================================================
CREATE OR REPLACE FUNCTION public.sync_puc_to_ptc_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.assignment_type = 'tecnico'
     AND (NEW.user_role = 'parceiro_b2b_tecnico' OR public.has_role(NEW.user_id, 'parceiro_b2b_tecnico'::app_role))
  THEN
    INSERT INTO public.partner_technician_clients (partner_id, technician_user_id, cliente_id, assigned_by, active, notes)
    VALUES (NEW.partner_id, NEW.user_id, NEW.cliente_id, NEW.assigned_by, NEW.active, NEW.notes)
    ON CONFLICT (partner_id, technician_user_id, cliente_id)
    DO UPDATE SET active = EXCLUDED.active, updated_at = now(), notes = EXCLUDED.notes;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_puc_to_ptc ON public.partner_user_clients;
CREATE TRIGGER trg_sync_puc_to_ptc
AFTER INSERT OR UPDATE ON public.partner_user_clients
FOR EACH ROW EXECUTE FUNCTION public.sync_puc_to_ptc_fn();

-- =========================================================
-- 6) BACKFILL a partir de partner_technician_clients
-- =========================================================
-- 6a) parceiro × cliente
INSERT INTO public.partner_clients (partner_id, cliente_id, assigned_by, active)
SELECT DISTINCT ptc.partner_id, ptc.cliente_id, ptc.assigned_by, true
FROM public.partner_technician_clients ptc
WHERE ptc.active = true
ON CONFLICT (partner_id, cliente_id) DO NOTHING;

-- 6b) usuário × cliente (para técnicos)
INSERT INTO public.partner_user_clients
  (partner_id, user_id, user_role, cliente_id, assignment_type, can_create_simulation, can_monitor, assigned_by, active, notes)
SELECT
  ptc.partner_id,
  ptc.technician_user_id,
  'parceiro_b2b_tecnico',
  ptc.cliente_id,
  'tecnico',
  true, true,
  ptc.assigned_by,
  ptc.active,
  ptc.notes
FROM public.partner_technician_clients ptc
WHERE ptc.active = true
  AND EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.user_id = ptc.technician_user_id AND pu.partner_id = ptc.partner_id)
ON CONFLICT (partner_id, user_id, cliente_id) DO NOTHING;

-- =========================================================
-- 7) partner_catalog_access_logs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.partner_catalog_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  role text,
  action text NOT NULL,
  partner_id uuid,
  cliente_id uuid,
  simulation_id uuid,
  order_id uuid,
  target_user_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcal_user ON public.partner_catalog_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pcal_partner ON public.partner_catalog_access_logs(partner_id);
CREATE INDEX IF NOT EXISTS idx_pcal_action ON public.partner_catalog_access_logs(action);
CREATE INDEX IF NOT EXISTS idx_pcal_created ON public.partner_catalog_access_logs(created_at DESC);

GRANT SELECT, INSERT ON public.partner_catalog_access_logs TO authenticated;
GRANT ALL ON public.partner_catalog_access_logs TO service_role;

ALTER TABLE public.partner_catalog_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcal_insert ON public.partner_catalog_access_logs;
CREATE POLICY pcal_insert ON public.partner_catalog_access_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS pcal_select ON public.partner_catalog_access_logs;
CREATE POLICY pcal_select ON public.partner_catalog_access_logs FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (has_role(auth.uid(), 'parceiro_b2b'::app_role) AND partner_id = get_user_partner_id())
);

-- =========================================================
-- 8) RPC: get_b2b_user_clients_secure
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_b2b_user_clients_secure(
  p_user_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
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
  assignment_type text,
  can_create_simulation boolean,
  can_monitor boolean,
  assigned_at timestamptz,
  ultima_simulacao_at timestamptz,
  total_simulacoes bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
         AND (v_is_tec = false OR ps.created_by = v_uid)) AS ultima_simulacao_at,
    (SELECT count(*) FROM public.partner_simulations ps
       WHERE ps.cliente_id = c.id
         AND ps.partner_id = puc.partner_id
         AND (v_is_tec = false OR ps.created_by = v_uid)
         AND (v_is_gest = false OR ps.created_by = v_target OR v_target = v_uid)) AS total_simulacoes
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
$$;

GRANT EXECUTE ON FUNCTION public.get_b2b_user_clients_secure(uuid,text) TO authenticated;

-- =========================================================
-- 9) RPC: get_b2b_partner_clients_for_assignment_secure
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_b2b_partner_clients_for_assignment_secure(
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  cliente_id uuid,
  nome text,
  razao_social text,
  nome_fantasia text,
  cidade text,
  estado text,
  documento_mascarado text,
  active boolean,
  ja_vinculado_ao_parceiro boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_is_gest boolean := has_role(v_uid, 'parceiro_b2b'::app_role);
  v_is_admin boolean := has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor_comercial'::app_role);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (v_is_gest OR v_is_admin) THEN RAISE EXCEPTION 'access denied'; END IF;

  IF v_is_gest THEN
    v_partner := get_user_partner_id();
    RETURN QUERY
    SELECT c.id, c.nome, c.razao_social, c.nome_fantasia,
           c.endereco_municipio, c.endereco_estado,
           CASE WHEN c.cpf_cnpj IS NULL THEN NULL
                ELSE repeat('*', greatest(length(c.cpf_cnpj)-4,0)) || right(c.cpf_cnpj,4)
           END,
           pc.active,
           true
    FROM public.partner_clients pc
    JOIN public.clientes c ON c.id = pc.cliente_id
    WHERE pc.partner_id = v_partner
      AND (p_search IS NULL OR p_search='' OR
           coalesce(c.nome,'') ILIKE '%'||p_search||'%' OR
           coalesce(c.razao_social,'') ILIKE '%'||p_search||'%' OR
           coalesce(c.nome_fantasia,'') ILIKE '%'||p_search||'%');
  ELSE
    RETURN QUERY
    SELECT c.id, c.nome, c.razao_social, c.nome_fantasia,
           c.endereco_municipio, c.endereco_estado,
           CASE WHEN c.cpf_cnpj IS NULL THEN NULL
                ELSE repeat('*', greatest(length(c.cpf_cnpj)-4,0)) || right(c.cpf_cnpj,4)
           END,
           true,
           EXISTS(SELECT 1 FROM public.partner_clients pc WHERE pc.cliente_id = c.id AND pc.active = true)
    FROM public.clientes c
    WHERE (p_search IS NULL OR p_search='' OR
           coalesce(c.nome,'') ILIKE '%'||p_search||'%' OR
           coalesce(c.razao_social,'') ILIKE '%'||p_search||'%' OR
           coalesce(c.nome_fantasia,'') ILIKE '%'||p_search||'%')
    LIMIT 500;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_b2b_partner_clients_for_assignment_secure(text) TO authenticated;

-- =========================================================
-- 10) RPC: assign_b2b_user_client_secure
-- =========================================================
CREATE OR REPLACE FUNCTION public.assign_b2b_user_client_secure(
  p_user_id uuid,
  p_cliente_id uuid,
  p_assignment_type text DEFAULT 'monitoramento',
  p_can_create_simulation boolean DEFAULT true,
  p_can_monitor boolean DEFAULT true,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_id uuid;
  v_is_gest boolean := has_role(v_uid, 'parceiro_b2b'::app_role);
  v_is_admin boolean := has_role(v_uid, 'administrador'::app_role) OR has_role(v_uid, 'gestor_comercial'::app_role);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF has_role(v_uid,'parceiro_b2b_tecnico'::app_role) THEN RAISE EXCEPTION 'access denied'; END IF;
  IF NOT (v_is_gest OR v_is_admin) THEN RAISE EXCEPTION 'access denied'; END IF;

  IF v_is_gest THEN
    v_partner := get_user_partner_id();
  ELSE
    SELECT partner_id INTO v_partner FROM public.partner_users WHERE user_id = p_user_id LIMIT 1;
  END IF;

  IF v_partner IS NULL THEN RAISE EXCEPTION 'partner nao identificado'; END IF;

  -- Garante partner_clients ativo
  INSERT INTO public.partner_clients (partner_id, cliente_id, assigned_by, active)
  VALUES (v_partner, p_cliente_id, v_uid, true)
  ON CONFLICT (partner_id, cliente_id) DO UPDATE SET active = true, updated_at = now();

  INSERT INTO public.partner_user_clients
    (partner_id, user_id, cliente_id, assignment_type, can_create_simulation, can_monitor, notes, assigned_by, active)
  VALUES
    (v_partner, p_user_id, p_cliente_id, p_assignment_type, p_can_create_simulation, p_can_monitor, p_notes, v_uid, true)
  ON CONFLICT (partner_id, user_id, cliente_id) DO UPDATE
    SET active = true,
        assignment_type = EXCLUDED.assignment_type,
        can_create_simulation = EXCLUDED.can_create_simulation,
        can_monitor = EXCLUDED.can_monitor,
        notes = EXCLUDED.notes,
        updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.partner_catalog_access_logs(user_id, role, action, partner_id, cliente_id, target_user_id, details)
  VALUES (v_uid, (SELECT role::text FROM public.user_roles WHERE user_id = v_uid LIMIT 1),
          'b2b_user_client_assigned', v_partner, p_cliente_id, p_user_id,
          jsonb_build_object('assignment_type', p_assignment_type));

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_b2b_user_client_secure(uuid,uuid,text,boolean,boolean,text) TO authenticated;

-- =========================================================
-- 11) RPC: unassign_b2b_user_client_secure
-- =========================================================
CREATE OR REPLACE FUNCTION public.unassign_b2b_user_client_secure(
  p_user_id uuid,
  p_cliente_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF has_role(v_uid,'parceiro_b2b_tecnico'::app_role) THEN RAISE EXCEPTION 'access denied'; END IF;

  IF has_role(v_uid,'parceiro_b2b'::app_role) THEN
    v_partner := get_user_partner_id();
  ELSIF has_role(v_uid,'administrador'::app_role) OR has_role(v_uid,'gestor_comercial'::app_role) THEN
    SELECT partner_id INTO v_partner FROM public.partner_user_clients
      WHERE user_id = p_user_id AND cliente_id = p_cliente_id LIMIT 1;
  ELSE
    RAISE EXCEPTION 'access denied';
  END IF;

  UPDATE public.partner_user_clients
     SET active = false, updated_at = now()
   WHERE user_id = p_user_id AND cliente_id = p_cliente_id
     AND (v_partner IS NULL OR partner_id = v_partner);

  -- espelha no legado
  UPDATE public.partner_technician_clients
     SET active = false, updated_at = now()
   WHERE technician_user_id = p_user_id AND cliente_id = p_cliente_id
     AND (v_partner IS NULL OR partner_id = v_partner);

  INSERT INTO public.partner_catalog_access_logs(user_id, action, partner_id, cliente_id, target_user_id, details)
  VALUES (v_uid, 'b2b_user_client_unassigned', v_partner, p_cliente_id, p_user_id,
          jsonb_build_object('reason', p_reason));

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unassign_b2b_user_client_secure(uuid,uuid,text) TO authenticated;

-- =========================================================
-- 12) RPC: get_b2b_user_client_detail_secure
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_b2b_user_client_detail_secure(p_cliente_id uuid)
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
  assignment_type text,
  can_create_simulation boolean,
  assigned_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner uuid;
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF has_role(v_uid,'administrador'::app_role) OR has_role(v_uid,'gestor_comercial'::app_role) THEN
    v_ok := true;
  ELSIF has_role(v_uid,'parceiro_b2b_tecnico'::app_role) THEN
    v_ok := EXISTS(SELECT 1 FROM public.partner_user_clients puc
                   WHERE puc.user_id = v_uid AND puc.cliente_id = p_cliente_id AND puc.active = true);
  ELSIF has_role(v_uid,'parceiro_b2b'::app_role) THEN
    v_partner := get_user_partner_id();
    v_ok := EXISTS(SELECT 1 FROM public.partner_clients pc
                   WHERE pc.partner_id = v_partner AND pc.cliente_id = p_cliente_id AND pc.active = true);
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

GRANT EXECUTE ON FUNCTION public.get_b2b_user_client_detail_secure(uuid) TO authenticated;

-- =========================================================
-- 13) Ajuste RLS partner_simulations INSERT: aceita novo vínculo
-- =========================================================
DROP POLICY IF EXISTS partner_simulations_insert ON public.partner_simulations;
CREATE POLICY partner_simulations_insert ON public.partner_simulations FOR INSERT
WITH CHECK (
  (
    has_role(auth.uid(),'parceiro_b2b_tecnico'::app_role)
    AND created_by = auth.uid()
    AND partner_id = get_user_partner_id()
    AND status <> 'convertida_pedido'
    AND (
      cliente_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.partner_user_clients puc
        WHERE puc.cliente_id = partner_simulations.cliente_id
          AND puc.user_id = auth.uid()
          AND puc.partner_id = partner_simulations.partner_id
          AND puc.active = true
      )
      OR EXISTS (
        SELECT 1 FROM public.partner_technician_clients ptc
        WHERE ptc.cliente_id = partner_simulations.cliente_id
          AND ptc.technician_user_id = auth.uid()
          AND ptc.partner_id = partner_simulations.partner_id
          AND ptc.active = true
      )
    )
  )
  OR (
    has_role(auth.uid(),'parceiro_b2b'::app_role)
    AND partner_id = get_user_partner_id()
    AND (
      cliente_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.partner_clients pc
        WHERE pc.partner_id = partner_simulations.partner_id
          AND pc.cliente_id = partner_simulations.cliente_id
          AND pc.active = true
      )
    )
  )
  OR has_role(auth.uid(),'administrador'::app_role)
  OR has_role(auth.uid(),'gestor_comercial'::app_role)
);

-- =========================================================
-- 14) can_user_access_cliente: reconhecer partner_user_clients
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_user_id uuid, _cliente_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(_user_id,'administrador'::app_role)
     OR public.has_role(_user_id,'gestor_comercial'::app_role)
     OR public.has_role(_user_id,'gestor'::app_role)
     OR public.has_role(_user_id,'tecnico_agronomo'::app_role)
     OR public.has_role(_user_id,'consultor_tecnico'::app_role)
  THEN
    RETURN true;
  END IF;

  IF public.has_role(_user_id,'parceiro_b2b'::app_role) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.partner_clients pc
      JOIN public.partner_users pu ON pu.partner_id = pc.partner_id
      WHERE pu.user_id = _user_id AND pc.cliente_id = _cliente_id AND pc.active = true
    );
  END IF;

  IF public.has_role(_user_id,'parceiro_b2b_tecnico'::app_role) THEN
    RETURN EXISTS (
      SELECT 1 FROM public.partner_user_clients puc
      WHERE puc.user_id = _user_id AND puc.cliente_id = _cliente_id AND puc.active = true
    ) OR EXISTS (
      SELECT 1 FROM public.partner_technician_clients ptc
      WHERE ptc.technician_user_id = _user_id AND ptc.cliente_id = _cliente_id AND ptc.active = true
    );
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_clientes uc
    WHERE uc.user_id = _user_id AND uc.cliente_id = _cliente_id
  );
END;
$$;
