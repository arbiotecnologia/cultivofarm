-- Add missing FKs so PostgREST embeds work in FluxoTecnico and Relatorios
ALTER TABLE public.entregas
  ADD CONSTRAINT entregas_produto_id_fkey
  FOREIGN KEY (produto_id) REFERENCES public.produtos(id) ON DELETE SET NULL;

ALTER TABLE public.estoque_produto
  ADD CONSTRAINT estoque_produto_reservado_para_cliente_id_fkey
  FOREIGN KEY (reservado_para_cliente_id) REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.aprovacoes_tecnicas
  ADD CONSTRAINT aprovacoes_tecnicas_aprovado_por_fkey
  FOREIGN KEY (aprovado_por) REFERENCES public.profiles(user_id) ON DELETE SET NULL;