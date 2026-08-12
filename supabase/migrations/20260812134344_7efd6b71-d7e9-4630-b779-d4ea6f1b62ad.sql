-- SECOND SCHEMA RESTORATION FOR BUILD FIX (Resolving remaining gaps)

-- TALHOES (Adicionar campos faltantes)
ALTER TABLE public.talhoes 
ADD COLUMN IF NOT EXISTS area_hectares numeric,
ADD COLUMN IF NOT EXISTS tipo_manejo_agua text;

-- CULTURAS
CREATE TABLE IF NOT EXISTS public.culturas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.culturas TO authenticated;

-- MICRORGANISMOS (Garantir que existe para BI)
CREATE TABLE IF NOT EXISTS public.microrganismos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome text NOT NULL,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.microrganismos TO authenticated;

-- REGISTROS CONSULTOR (Mesa de BI Agronômico)
CREATE TABLE IF NOT EXISTS public.registros_consultor (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    talhao_id uuid REFERENCES public.talhoes(id),
    data_registro date,
    tipo_manejo_agua text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.registros_consultor TO authenticated;

-- REGISTROS CONSULTOR RECOMENDACOES
CREATE TABLE IF NOT EXISTS public.registros_consultor_recomendacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registro_id uuid REFERENCES public.registros_consultor(id),
    recomendacao text,
    created_at timestamptz DEFAULT now()
);
GRANT SELECT ON public.registros_consultor_recomendacoes TO authenticated;

-- AJUSTAR ENUM APP_ROLE PARA INCLUIR consultor_tecnico
DO $$ BEGIN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'consultor_tecnico';
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- MOCK PARA RPC FALTANTE
CREATE OR REPLACE FUNCTION public.rpc_get_visita_workspace(_visita_id uuid)
RETURNS jsonb AS $$
BEGIN
    RETURN jsonb_build_object('id', _visita_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.rpc_get_visita_workspace TO authenticated;
