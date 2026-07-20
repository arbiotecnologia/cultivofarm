-- Adicionar colunas profissionais à tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS crea TEXT,
ADD COLUMN IF NOT EXISTS especialidade TEXT,
ADD COLUMN IF NOT EXISTS data_admissao DATE,
ADD COLUMN IF NOT EXISTS observacoes_internas TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.profiles.crea IS 'Registro profissional (CREA/CONFEA) do agrônomo';
COMMENT ON COLUMN public.profiles.especialidade IS 'Área de especialidade (ex: Fitossanidade, Solos, Irrigação)';
COMMENT ON COLUMN public.profiles.data_admissao IS 'Data de início das atividades na empresa';
COMMENT ON COLUMN public.profiles.observacoes_internas IS 'Notas administrativas sobre o consultor';