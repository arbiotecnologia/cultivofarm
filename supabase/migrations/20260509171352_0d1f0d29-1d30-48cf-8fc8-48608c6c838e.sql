-- Alter table microrganismos to add technical and commercial fields
ALTER TABLE public.microrganismos 
ADD COLUMN IF NOT EXISTS nome_cientifico TEXT,
ADD COLUMN IF NOT EXISTS concentracao_ufc_ml NUMERIC,
ADD COLUMN IF NOT EXISTS concentracao_label TEXT,
ADD COLUMN IF NOT EXISTS dose_ml_ha NUMERIC DEFAULT 100,
ADD COLUMN IF NOT EXISTS valor_dose_brl NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS fornecedor TEXT DEFAULT 'A.R Biotecnologia',
ADD COLUMN IF NOT EXISTS safra_referencia TEXT DEFAULT '2025',
ADD COLUMN IF NOT EXISTS producao_on_farm BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS meio_cultivo TEXT,
ADD COLUMN IF NOT EXISTS funcao_agronomica TEXT,
ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- Add unique constraint to name for idempotent seeding (handle existing duplicates first if any)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'microrganismos_nome_unique') THEN
        ALTER TABLE public.microrganismos ADD CONSTRAINT microrganismos_nome_unique UNIQUE (nome);
    END IF;
END $$;

-- Create a search index for scientific names
CREATE INDEX IF NOT EXISTS idx_microrganismos_nome_cientifico ON public.microrganismos (nome_cientifico);

-- Refine RLS policies for writing (administrador/tecnico_agronomo only)
DROP POLICY IF EXISTS "Authenticated users can insert microrganismos" ON public.microrganismos;
DROP POLICY IF EXISTS "Admin and Agronomo can insert/update microrganismos" ON public.microrganismos;

CREATE POLICY "Admin and Agronomo can insert/update microrganismos" 
ON public.microrganismos 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'tecnico_agronomo'))
WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'tecnico_agronomo'));
