
-- Fase 2 + Fase 3: vínculo técnico B2B × cliente com RLS

CREATE TABLE IF NOT EXISTS public.partner_technician_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  technician_user_id uuid NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_technician_clients_unique UNIQUE (partner_id, technician_user_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_ptc_partner ON public.partner_technician_clients(partner_id);
CREATE INDEX IF NOT EXISTS idx_ptc_tech ON public.partner_technician_clients(technician_user_id);
CREATE INDEX IF NOT EXISTS idx_ptc_cliente ON public.partner_technician_clients(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ptc_active ON public.partner_technician_clients(active);
CREATE INDEX IF NOT EXISTS idx_ptc_partner_tech_active ON public.partner_technician_clients(partner_id, technician_user_id, active);
CREATE INDEX IF NOT EXISTS idx_ptc_partner_cliente_active ON public.partner_technician_clients(partner_id, cliente_id, active);

GRANT SELECT, INSERT, UPDATE ON public.partner_technician_clients TO authenticated;
GRANT ALL ON public.partner_technician_clients TO service_role;

ALTER TABLE public.partner_technician_clients ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_ptc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_ptc_updated_at ON public.partner_technician_clients;
CREATE TRIGGER trg_ptc_updated_at
BEFORE UPDATE ON public.partner_technician_clients
FOR EACH ROW EXECUTE FUNCTION public.tg_ptc_updated_at();

-- Policies
DROP POLICY IF EXISTS ptc_select ON public.partner_technician_clients;
CREATE POLICY ptc_select ON public.partner_technician_clients
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND partner_id = public.get_user_partner_id()
  )
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::app_role)
    AND technician_user_id = auth.uid()
    AND active = true
  )
);

DROP POLICY IF EXISTS ptc_insert ON public.partner_technician_clients;
CREATE POLICY ptc_insert ON public.partner_technician_clients
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND partner_id = public.get_user_partner_id()
    AND EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.user_id = partner_technician_clients.technician_user_id
        AND pu.partner_id = partner_technician_clients.partner_id
    )
  )
);

DROP POLICY IF EXISTS ptc_update ON public.partner_technician_clients;
CREATE POLICY ptc_update ON public.partner_technician_clients
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND partner_id = public.get_user_partner_id()
  )
) WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    public.has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND partner_id = public.get_user_partner_id()
  )
);
-- Sem DELETE: usar active=false
