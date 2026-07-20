-- Adiciona restrição de unicidade para cpf_cnpj na tabela clientes
ALTER TABLE public.clientes ADD CONSTRAINT clientes_cpf_cnpj_unique UNIQUE (cpf_cnpj);