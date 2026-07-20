-- 1. Criar a tabela de diagnósticos
CREATE TABLE public.visita_diagnosticos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_id UUID NOT NULL REFERENCES public.registros_consultor(id) ON DELETE CASCADE,
    problema TEXT,
    severidade TEXT,
    incidencia NUMERIC,
    descricao TEXT,
    categoria TEXT,
    localizacao TEXT,
    urgencia TEXT,
    risco TEXT,
    intervencao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Garantir permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visita_diagnosticos TO authenticated;
GRANT ALL ON public.visita_diagnosticos TO service_role;

-- 3. Habilitar RLS
ALTER TABLE public.visita_diagnosticos ENABLE ROW LEVEL SECURITY;

-- 4. Criar políticas de segurança (usando 'administrador' que é o valor correto do enum)
CREATE POLICY "Users can manage diagnostics for their own records" ON public.visita_diagnosticos
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.registros_consultor r
            WHERE r.id = visita_diagnosticos.registro_id
            AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.registros_consultor r
            WHERE r.id = visita_diagnosticos.registro_id
            AND (r.consultor_responsavel = auth.uid() OR r.created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'))
        )
    );

-- 5. Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_visita_diagnosticos_updated_at ON public.visita_diagnosticos;
CREATE TRIGGER update_visita_diagnosticos_updated_at
    BEFORE UPDATE ON public.visita_diagnosticos
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Migrar dados existentes de registros_consultor para visita_diagnosticos
INSERT INTO public.visita_diagnosticos (
    registro_id, 
    problema, 
    severidade, 
    incidencia, 
    categoria, 
    localizacao, 
    urgencia, 
    risco, 
    intervencao
)
SELECT 
    id, 
    problema_principal, 
    nivel_pressao::text, 
    percentual_area_afetada, 
    categoria_problema::text, 
    localizacao_na_area, 
    urgencia::text, 
    risco_produtivo::text, 
    necessidade_intervencao::text
FROM public.registros_consultor
WHERE problema_principal IS NOT NULL AND problema_principal != '';
