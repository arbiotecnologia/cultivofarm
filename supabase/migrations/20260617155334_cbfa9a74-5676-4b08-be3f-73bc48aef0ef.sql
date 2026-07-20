
-- Corrige trigger: usa jsonb para evitar erro de parse PL/pgSQL com NEW.partner_id em partner_accounts
CREATE OR REPLACE FUNCTION public.partner_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner_id uuid;
  v_acao text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_acao := 'create';
    v_new := to_jsonb(NEW);
    v_partner_id := CASE
      WHEN TG_TABLE_NAME = 'partner_accounts' THEN (v_new->>'id')::uuid
      ELSE (v_new->>'partner_id')::uuid
    END;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_partner_id := CASE
      WHEN TG_TABLE_NAME = 'partner_accounts' THEN (v_new->>'id')::uuid
      ELSE (v_new->>'partner_id')::uuid
    END;
    IF TG_TABLE_NAME = 'partner_accounts' AND (v_old->>'ativo')::boolean = true AND (v_new->>'ativo')::boolean = false THEN
      v_acao := 'delete';
    ELSIF TG_TABLE_NAME = 'partner_accounts' AND (v_old->>'ativo')::boolean = false AND (v_new->>'ativo')::boolean = true THEN
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

-- Seed: parceiro de homologação
INSERT INTO public.partner_accounts (
  codigo, razao_social, nome_fantasia, cnpj,
  desconto_padrao, observacoes, ativo
)
VALUES (
  'HOMOL-001',
  'FSF Agro Homologação LTDA',
  'FSF Agro (HOMOL)',
  '12345678000199',
  10,
  'Parceiro criado para homologação operacional E2E do módulo B2B. Não usar em produção real.',
  true
)
ON CONFLICT (codigo) DO NOTHING;

-- Preços por parceiro (10% desconto sobre R$ 100)
WITH p AS (SELECT id FROM public.partner_accounts WHERE codigo = 'HOMOL-001')
INSERT INTO public.partner_product_prices (partner_id, product_id, preco_tabela, desconto_percentual, ativo, is_current)
SELECT p.id, prod.id, 100.00, 10, true, true
FROM p, public.produtos prod
WHERE prod.ativo = true
  AND prod.codigo IN ('SOLO-1','SOLO-2','BIO-INS-01','BIO-INS-02','BIO-INO')
ON CONFLICT DO NOTHING;

-- Configuração financeira (schema real: credit_limit, payment_terms_days)
INSERT INTO public.partner_financial_settings (
  partner_id, billing_trigger, payment_terms_days,
  default_payment_method, credit_limit, active
)
SELECT id, 'na_entrega', 30, 'boleto', 100000, true
FROM public.partner_accounts WHERE codigo = 'HOMOL-001'
ON CONFLICT (partner_id) DO NOTHING;
