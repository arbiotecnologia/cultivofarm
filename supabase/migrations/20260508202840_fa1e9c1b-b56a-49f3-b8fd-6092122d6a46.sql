-- Tabela de catálogo de problemas
CREATE TABLE public.catalogo_problemas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    categoria TEXT NOT NULL,
    nome TEXT NOT NULL,
    nome_cientifico TEXT,
    cultura_alvo TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(categoria, nome)
);

-- Enable RLS
ALTER TABLE public.catalogo_problemas ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Leitura pública para usuários autenticados" 
ON public.catalogo_problemas FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Inserção para equipe técnica e gestores" 
ON public.catalogo_problemas FOR INSERT 
TO authenticated 
WITH CHECK (
    public.has_role(auth.uid(), 'consultor_tecnico') OR 
    public.has_role(auth.uid(), 'tecnico_agronomo') OR 
    public.has_role(auth.uid(), 'gestor') OR 
    public.has_role(auth.uid(), 'administrador')
);

CREATE POLICY "Atualização para equipe técnica e gestores" 
ON public.catalogo_problemas FOR UPDATE 
TO authenticated 
USING (
    public.has_role(auth.uid(), 'consultor_tecnico') OR 
    public.has_role(auth.uid(), 'tecnico_agronomo') OR 
    public.has_role(auth.uid(), 'gestor') OR 
    public.has_role(auth.uid(), 'administrador')
);

-- Trigger para updated_at
CREATE TRIGGER update_catalogo_problemas_updated_at
BEFORE UPDATE ON public.catalogo_problemas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial
INSERT INTO public.catalogo_problemas (categoria, nome, nome_cientifico) VALUES
('insetos_praga', 'Cigarrinha-do-milho', 'Dalbulus maidis'),
('insetos_praga', 'Lagarta-do-cartucho', 'Spodoptera frugiperda'),
('insetos_praga', 'Percevejo-marrom', 'Euschistus heros'),
('insetos_praga', 'Mosca-branca', 'Bemisia tabaci'),
('insetos_praga', 'Bicudo-do-algodoeiro', 'Anthonomus grandis'),
('doencas_fungicas', 'Ferrugem-asiática', 'Phakopsora pachyrhizi'),
('doencas_fungicas', 'Mofo-branco', 'Sclerotinia sclerotiorum'),
('doencas_fungicas', 'Mancha-alvo', 'Corynespora cassiicola'),
('doencas_fungicas', 'Antracnose', 'Colletotrichum truncatum'),
('doencas_bacterianas', 'Mancha-bacteriana', 'Xanthomonas spp.'),
('doencas_bacterianas', 'Murcha-de-curtobacterium', 'Curtobacterium flaccumfaciens'),
('nematoides', 'Nematoide-das-galhas', 'Meloidogyne incognita'),
('nematoides', 'Nematoide-de-cisto', 'Heterodera glycines'),
('nematoides', 'Nematoide-das-lesões', 'Pratylenchus brachyurus'),
('plantas_daninhas', 'Buva', 'Conyza spp.'),
('plantas_daninhas', 'Capim-amargoso', 'Digitaria insularis'),
('plantas_daninhas', 'Caruru', 'Amaranthus hybridus'),
('plantas_daninhas', 'Cordão-de-viola', 'Ipomoea spp.'),
('desequilibrio_biologico_solo', 'Compactação do solo', NULL),
('desequilibrio_biologico_solo', 'Baixa atividade microbiana', NULL),
('baixa_vitalidade', 'Deficiência de Nitrogênio', NULL),
('baixa_vitalidade', 'Deficiência de Fósforo', NULL),
('baixa_vitalidade', 'Deficiência de Potássio', NULL),
('fitotoxidade', 'Queima por Herbicida', NULL),
('fitotoxidade', 'Dano por Deriva', NULL);
