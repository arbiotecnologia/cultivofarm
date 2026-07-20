
-- Enums novos
DO $$ BEGIN
  CREATE TYPE public.partner_regime_tributario AS ENUM ('simples','lucro_presumido','lucro_real','mei','isento');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_segmento AS ENUM ('cooperativa','revenda_agro','consultoria','industria','produtor_direto','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_porte AS ENUM ('pequeno','medio','grande');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.partner_contact_setor AS ENUM ('comercial','financeiro','operacional','tecnico','administrativo','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- partner_accounts: novas colunas
ALTER TABLE public.partner_accounts
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS inscricao_municipal text,
  ADD COLUMN IF NOT EXISTS regime_tributario public.partner_regime_tributario,
  ADD COLUMN IF NOT EXISTS suframa text,
  ADD COLUMN IF NOT EXISTS segmento public.partner_segmento,
  ADD COLUMN IF NOT EXISTS porte public.partner_porte,
  ADD COLUMN IF NOT EXISTS data_inicio_parceria date,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS endereco_logradouro text,
  ADD COLUMN IF NOT EXISTS endereco_numero text,
  ADD COLUMN IF NOT EXISTS endereco_complemento text,
  ADD COLUMN IF NOT EXISTS endereco_bairro text,
  ADD COLUMN IF NOT EXISTS email_comercial text,
  ADD COLUMN IF NOT EXISTS email_financeiro text,
  ADD COLUMN IF NOT EXISTS email_nfe text,
  ADD COLUMN IF NOT EXISTS telefone_comercial text,
  ADD COLUMN IF NOT EXISTS whatsapp_comercial text,
  ADD COLUMN IF NOT EXISTS site text,
  ADD COLUMN IF NOT EXISTS limite_credito_brl numeric(14,2),
  ADD COLUMN IF NOT EXISTS prazo_pagamento_padrao_dias integer,
  ADD COLUMN IF NOT EXISTS condicao_pagamento_padrao text,
  ADD COLUMN IF NOT EXISTS forma_pagamento_preferida text,
  ADD COLUMN IF NOT EXISTS dados_bancarios jsonb,
  ADD COLUMN IF NOT EXISTS comissao_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS meta_mensal_brl numeric(14,2),
  ADD COLUMN IF NOT EXISTS endereco_entrega_igual_comercial boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS entrega_cep text,
  ADD COLUMN IF NOT EXISTS entrega_logradouro text,
  ADD COLUMN IF NOT EXISTS entrega_numero text,
  ADD COLUMN IF NOT EXISTS entrega_complemento text,
  ADD COLUMN IF NOT EXISTS entrega_bairro text,
  ADD COLUMN IF NOT EXISTS entrega_cidade text,
  ADD COLUMN IF NOT EXISTS entrega_estado text,
  ADD COLUMN IF NOT EXISTS transportadora_preferida text,
  ADD COLUMN IF NOT EXISTS incoterm text;

-- Constraints range
DO $$ BEGIN
  ALTER TABLE public.partner_accounts
    ADD CONSTRAINT partner_accounts_comissao_range CHECK (comissao_percentual IS NULL OR (comissao_percentual >= 0 AND comissao_percentual <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.partner_accounts
    ADD CONSTRAINT partner_accounts_limite_credito_pos CHECK (limite_credito_brl IS NULL OR limite_credito_brl >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- partner_contacts
CREATE TABLE IF NOT EXISTS public.partner_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cargo text,
  setor public.partner_contact_setor,
  email text,
  telefone text,
  whatsapp text,
  is_principal boolean NOT NULL DEFAULT false,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_contacts_partner ON public.partner_contacts(partner_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_contacts_principal
  ON public.partner_contacts(partner_id) WHERE is_principal = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_contacts TO authenticated;
GRANT ALL ON public.partner_contacts TO service_role;

ALTER TABLE public.partner_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin e gestor comercial gerenciam contatos de parceiro"
  ON public.partner_contacts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'));

CREATE POLICY "Financeiro pode ler contatos de parceiro"
  ON public.partner_contacts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'financeiro'));

CREATE TRIGGER trg_partner_contacts_updated_at
  BEFORE UPDATE ON public.partner_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- partner_documents
CREATE TABLE IF NOT EXISTS public.partner_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  nome text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  tamanho_bytes bigint,
  observacoes text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_documents_partner ON public.partner_documents(partner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_documents TO authenticated;
GRANT ALL ON public.partner_documents TO service_role;

ALTER TABLE public.partner_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin e gestor comercial gerenciam documentos de parceiro"
  ON public.partner_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor_comercial'));

CREATE POLICY "Financeiro pode ler documentos de parceiro"
  ON public.partner_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'financeiro'));

CREATE TRIGGER trg_partner_documents_updated_at
  BEFORE UPDATE ON public.partner_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
