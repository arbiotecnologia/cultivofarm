-- Corrigindo o enum app_role para conter os valores esperados pelo sistema legado
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tecnico_agronomo';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'producao';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'administrativo';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor';

-- Tentar criar a política novamente agora que 'administrador' é um valor válido
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'company_fiscal_settings' 
        AND policyname = 'Admins can manage fiscal settings'
    ) THEN
        CREATE POLICY "Admins can manage fiscal settings"
        ON public.company_fiscal_settings
        FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'administrador'));
    END IF;
EXCEPTION WHEN duplicate_object THEN null; END $$;
