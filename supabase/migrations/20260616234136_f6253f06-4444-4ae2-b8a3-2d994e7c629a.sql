
CREATE TABLE public.partner_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  codigo text UNIQUE,
  razao_social text NOT NULL,
  nome_fantasia text,
  cnpj text,
  desconto_padrao numeric(5,2) NOT NULL DEFAULT 0 CHECK (desconto_padrao >= 0 AND desconto_padrao <= 100),
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_accounts TO authenticated;
GRANT ALL ON public.partner_accounts TO service_role;
CREATE INDEX idx_partner_accounts_client ON public.partner_accounts(client_id);
CREATE INDEX idx_partner_accounts_ativo ON public.partner_accounts(ativo);
CREATE INDEX idx_partner_accounts_codigo ON public.partner_accounts(codigo);
ALTER TABLE public.partner_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_accounts_select" ON public.partner_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'));
CREATE POLICY "partner_accounts_insert" ON public.partner_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'));
CREATE POLICY "partner_accounts_update" ON public.partner_accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'));

CREATE TABLE public.partner_product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.produtos(id),
  preco_tabela numeric(12,2) NOT NULL DEFAULT 0,
  desconto_percentual numeric(5,2) NOT NULL DEFAULT 0 CHECK (desconto_percentual >= 0 AND desconto_percentual <= 100),
  preco_final numeric(12,2),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_product_prices TO authenticated;
GRANT ALL ON public.partner_product_prices TO service_role;
CREATE INDEX idx_ppp_partner ON public.partner_product_prices(partner_id);
CREATE INDEX idx_ppp_product ON public.partner_product_prices(product_id);
CREATE INDEX idx_ppp_ativo ON public.partner_product_prices(ativo);
CREATE UNIQUE INDEX idx_ppp_partner_product_active
  ON public.partner_product_prices(partner_id, product_id) WHERE ativo = true;
ALTER TABLE public.partner_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppp_select" ON public.partner_product_prices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'));
CREATE POLICY "ppp_insert" ON public.partner_product_prices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'));
CREATE POLICY "ppp_update" ON public.partner_product_prices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'));

CREATE TABLE public.partner_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid,
  usuario_id uuid,
  acao text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.partner_audit_logs TO authenticated;
GRANT ALL ON public.partner_audit_logs TO service_role;
CREATE INDEX idx_pal_partner ON public.partner_audit_logs(partner_id, created_at DESC);
ALTER TABLE public.partner_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pal_select" ON public.partner_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'));

CREATE TRIGGER trg_partner_accounts_updated_at
  BEFORE UPDATE ON public.partner_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.partner_ppp_compute_final()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.preco_final IS NULL THEN
    NEW.preco_final := ROUND(NEW.preco_tabela * (1 - COALESCE(NEW.desconto_percentual,0)/100.0), 2);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ppp_compute_final
  BEFORE INSERT OR UPDATE ON public.partner_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.partner_ppp_compute_final();

CREATE OR REPLACE FUNCTION public.partner_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_partner_id uuid;
  v_acao text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'create';
    v_new := to_jsonb(NEW);
    v_partner_id := CASE WHEN TG_TABLE_NAME = 'partner_accounts' THEN NEW.id ELSE NEW.partner_id END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_partner_id := CASE WHEN TG_TABLE_NAME = 'partner_accounts' THEN NEW.id ELSE NEW.partner_id END;
    IF TG_TABLE_NAME = 'partner_accounts' AND OLD.ativo = true AND NEW.ativo = false THEN
      v_acao := 'delete';
    ELSIF TG_TABLE_NAME = 'partner_accounts' AND OLD.ativo = false AND NEW.ativo = true THEN
      v_acao := 'restore';
    ELSIF TG_TABLE_NAME = 'partner_product_prices' THEN
      v_acao := 'price_change';
    ELSE
      v_acao := 'update';
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  INSERT INTO public.partner_audit_logs(partner_id, usuario_id, acao, dados_anteriores, dados_novos)
  VALUES (v_partner_id, auth.uid(), v_acao, v_old, v_new);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_partner_accounts_audit
  AFTER INSERT OR UPDATE ON public.partner_accounts
  FOR EACH ROW EXECUTE FUNCTION public.partner_audit_trigger();

CREATE TRIGGER trg_ppp_audit
  AFTER INSERT OR UPDATE ON public.partner_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.partner_audit_trigger();
