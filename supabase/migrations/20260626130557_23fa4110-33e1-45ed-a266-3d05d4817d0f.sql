
-- (a) GRANTs faltantes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_campaigns         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_campaign_partners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_campaign_products TO authenticated;
GRANT ALL ON public.commercial_campaigns         TO service_role;
GRANT ALL ON public.commercial_campaign_partners TO service_role;
GRANT ALL ON public.commercial_campaign_products TO service_role;

-- (b) Tipo de público
ALTER TABLE public.commercial_campaigns
  ADD COLUMN IF NOT EXISTS tipo_publico text NOT NULL DEFAULT 'b2b'
    CHECK (tipo_publico IN ('b2b', 'comercial', 'ambos'));

-- (c) Vínculo com clientes diretos
CREATE TABLE IF NOT EXISTS public.commercial_campaign_clientes (
  campaign_id uuid NOT NULL REFERENCES public.commercial_campaigns(id) ON DELETE CASCADE,
  cliente_id  uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, cliente_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercial_campaign_clientes TO authenticated;
GRANT ALL ON public.commercial_campaign_clientes TO service_role;
ALTER TABLE public.commercial_campaign_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS camp_clientes_admin_all ON public.commercial_campaign_clientes;
CREATE POLICY camp_clientes_admin_all ON public.commercial_campaign_clientes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor_comercial'::app_role))
  WITH CHECK (has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor_comercial'::app_role));

-- (d) Atualiza a política do parceiro para respeitar tipo_publico
DROP POLICY IF EXISTS campanhas_partner_select ON public.commercial_campaigns;
CREATE POLICY campanhas_partner_select ON public.commercial_campaigns
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND ativa
    AND tipo_publico IN ('b2b','ambos')
    AND EXISTS (
      SELECT 1 FROM public.commercial_campaign_partners cp
      WHERE cp.campaign_id = commercial_campaigns.id
        AND cp.partner_id = get_user_partner_id()
    )
  );

-- (e) Cliente vê campanhas Comercial
DROP POLICY IF EXISTS campanhas_cliente_select ON public.commercial_campaigns;
CREATE POLICY campanhas_cliente_select ON public.commercial_campaigns
  FOR SELECT TO authenticated
  USING (
    ativa
    AND tipo_publico IN ('comercial','ambos')
    AND EXISTS (
      SELECT 1 FROM public.commercial_campaign_clientes cc
      JOIN public.user_clientes uc ON uc.cliente_id = cc.cliente_id
      WHERE cc.campaign_id = commercial_campaigns.id
        AND uc.user_id = auth.uid()
    )
  );
