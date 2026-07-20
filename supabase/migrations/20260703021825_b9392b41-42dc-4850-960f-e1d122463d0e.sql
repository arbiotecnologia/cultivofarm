ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS destinatario_nome text,
  ADD COLUMN IF NOT EXISTS destinatario_telefone text,
  ADD COLUMN IF NOT EXISTS destinatario_whatsapp text,
  ADD COLUMN IF NOT EXISTS endereco_origem text DEFAULT 'cadastro',
  ADD COLUMN IF NOT EXISTS endereco_logradouro text,
  ADD COLUMN IF NOT EXISTS endereco_numero text,
  ADD COLUMN IF NOT EXISTS endereco_complemento text,
  ADD COLUMN IF NOT EXISTS endereco_bairro text,
  ADD COLUMN IF NOT EXISTS endereco_cidade text,
  ADD COLUMN IF NOT EXISTS endereco_uf text,
  ADD COLUMN IF NOT EXISTS endereco_cep text,
  ADD COLUMN IF NOT EXISTS endereco_referencia text;