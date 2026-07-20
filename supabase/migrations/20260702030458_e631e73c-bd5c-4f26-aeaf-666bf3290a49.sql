CREATE TABLE public.partner_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  titulo text,
  observacoes text,
  total_cheio numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_simulations TO authenticated;
GRANT ALL ON public.partner_simulations TO service_role;
ALTER TABLE public.partner_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_simulations_select ON public.partner_simulations
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'administrador'::public.app_role)
  OR public.has_role(auth.uid(), 'gestor_comercial'::public.app_role)
  OR (
    (public.has_role(auth.uid(), 'parceiro_b2b'::public.app_role)
     OR public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role))
    AND partner_id = public.get_user_partner_id()
  )
);
CREATE POLICY partner_simulations_insert ON public.partner_simulations
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role)
  AND created_by = auth.uid()
  AND partner_id = public.get_user_partner_id()
);
CREATE POLICY partner_simulations_update ON public.partner_simulations
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role)
  AND created_by = auth.uid()
) WITH CHECK (
  created_by = auth.uid() AND partner_id = public.get_user_partner_id()
);
CREATE POLICY partner_simulations_delete ON public.partner_simulations
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role)
  AND created_by = auth.uid()
);

CREATE TRIGGER partner_simulations_updated_at
BEFORE UPDATE ON public.partner_simulations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.partner_simulation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.partner_simulations(id) ON DELETE CASCADE,
  item_tipo text NOT NULL CHECK (item_tipo IN ('produto','microrganismo')),
  item_id uuid NOT NULL,
  nome text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 0,
  valor_unitario_cheio numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX partner_simulation_items_sim_idx ON public.partner_simulation_items(simulation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_simulation_items TO authenticated;
GRANT ALL ON public.partner_simulation_items TO service_role;
ALTER TABLE public.partner_simulation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_simulation_items_select ON public.partner_simulation_items
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.partner_simulations s WHERE s.id = simulation_id)
);
CREATE POLICY partner_simulation_items_write ON public.partner_simulation_items
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.partner_simulations s
    WHERE s.id = simulation_id
      AND s.created_by = auth.uid()
      AND public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.partner_simulations s
    WHERE s.id = simulation_id
      AND s.created_by = auth.uid()
      AND public.has_role(auth.uid(), 'parceiro_b2b_tecnico'::public.app_role)
  )
);