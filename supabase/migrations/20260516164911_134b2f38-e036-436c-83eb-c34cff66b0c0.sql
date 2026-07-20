-- Add new document types
ALTER TYPE public.cliente_doc_tipo ADD VALUE IF NOT EXISTS 'cnh';
ALTER TYPE public.cliente_doc_tipo ADD VALUE IF NOT EXISTS 'cartao_cnpj';
ALTER TYPE public.cliente_doc_tipo ADD VALUE IF NOT EXISTS 'inscricao_produtor';
ALTER TYPE public.cliente_doc_tipo ADD VALUE IF NOT EXISTS 'rg';
ALTER TYPE public.cliente_doc_tipo ADD VALUE IF NOT EXISTS 'comprovante_endereco';