ALTER TYPE public.categoria_arquivo_consultor ADD VALUE IF NOT EXISTS 'checkin';

-- Política para SELECT (Visualização via Signed URLs ou acesso direto para autorizados)
DROP POLICY IF EXISTS "Acesso controlado às evidências técnicas" ON storage.objects;
CREATE POLICY "Acesso controlado às evidências técnicas" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'consultor-arquivos' AND (
        -- Admins e Gestores acessam tudo
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND (role = 'administrador' OR role = 'gestor' OR role = 'administrativo')
        )
        OR
        -- Consultores acessam arquivos de suas próprias visitas
        EXISTS (
            SELECT 1 FROM public.registros_consultor r
            WHERE r.consultor_responsavel = auth.uid() 
            AND (storage.foldername(name))[1] = r.id::text
        )
    )
);

-- Política para INSERT (Upload)
DROP POLICY IF EXISTS "Consultores podem subir evidências de suas visitas" ON storage.objects;
CREATE POLICY "Consultores podem subir evidências de suas visitas" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'consultor-arquivos' AND (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND (role = 'administrador' OR role = 'gestor' OR role = 'consultor_tecnico' OR role = 'tecnico_agronomo' OR role = 'administrativo')
        )
    )
);