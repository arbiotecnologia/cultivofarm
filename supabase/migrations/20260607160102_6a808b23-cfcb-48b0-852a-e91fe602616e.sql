-- 1. Diferenciar matérias-primas de produtos finais
ALTER TABLE public.produtos ADD COLUMN e_insumo boolean DEFAULT false;
ALTER TABLE public.produtos ADD COLUMN estoque_minimo numeric DEFAULT 0;

-- 2. Expandir formulações para incluir nutrientes/insumos (não apenas microrganismos)
ALTER TABLE public.formulacoes ADD COLUMN component_insumo_id uuid REFERENCES public.produtos(id);
ALTER TABLE public.formulacoes ADD COLUMN proporcao numeric DEFAULT 0; -- ex: 0.1 (10% do volume final) ou volume fixo
ALTER TABLE public.formulacoes ADD COLUMN e_volume_fixo boolean DEFAULT false;

-- 3. Garantir permissões
GRANT ALL ON public.produtos TO authenticated;
GRANT ALL ON public.formulacoes TO authenticated;

-- 4. Função para baixa automática de insumos (opcionalmente via trigger ou chamada direta)
-- Por enquanto, faremos via lógica no frontend para dar visibilidade ao usuário, 
-- mas deixamos a coluna preparada.

-- Atualizar alguns produtos existentes como insumos se necessário (exemplo genérico)
UPDATE public.produtos SET e_insumo = true WHERE tipo IN ('solo', 'inoculante') AND nome ILIKE '%meio%' OR nome ILIKE '%nutriente%';
