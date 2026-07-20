
-- ============================================================
-- FASE 2: Fontes Técnicas e Rastreabilidade do Catálogo
-- ============================================================

CREATE TABLE IF NOT EXISTS public.catalog_technical_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo text NOT NULL,
  entidade_id uuid NOT NULL,
  fonte_titulo text NOT NULL,
  fonte_url text NULL,
  fonte_tipo text NOT NULL,
  idioma_original text NULL,
  pais_origem text NULL,
  resumo_evidencia text NULL,
  nivel_confianca text NOT NULL DEFAULT 'medio',
  data_consulta date DEFAULT CURRENT_DATE,
  observacoes text NULL,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_sources_entidade_tipo_chk CHECK (entidade_tipo IN ('microrganismo','produto','ficha_microrganismo','ficha_produto')),
  CONSTRAINT catalog_sources_fonte_tipo_chk CHECK (fonte_tipo IN ('artigo_cientifico','revisao_cientifica','orgao_oficial','embrapa','universidade','fabricante','patente','boletim_tecnico','outro')),
  CONSTRAINT catalog_sources_confianca_chk CHECK (nivel_confianca IN ('alto','medio','baixo'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalog_technical_sources TO authenticated;
GRANT ALL ON public.catalog_technical_sources TO service_role;

ALTER TABLE public.catalog_technical_sources ENABLE ROW LEVEL SECURITY;

-- Índices
CREATE INDEX IF NOT EXISTS idx_catalog_sources_entity ON public.catalog_technical_sources (entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_catalog_sources_tipo ON public.catalog_technical_sources (fonte_tipo);
CREATE INDEX IF NOT EXISTS idx_catalog_sources_confianca ON public.catalog_technical_sources (nivel_confianca);
CREATE INDEX IF NOT EXISTS idx_catalog_sources_data ON public.catalog_technical_sources (data_consulta DESC);

-- Unique parcial para upsert/seed por URL
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_sources_entity_url
  ON public.catalog_technical_sources (entidade_tipo, entidade_id, fonte_url)
  WHERE fonte_url IS NOT NULL;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_catalog_sources_updated_at ON public.catalog_technical_sources;
CREATE TRIGGER trg_catalog_sources_updated_at
  BEFORE UPDATE ON public.catalog_technical_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atualizar função de auditoria para reconhecer a nova tabela
CREATE OR REPLACE FUNCTION public.log_catalog_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entidade text;
  v_id uuid;
BEGIN
  v_entidade := CASE TG_TABLE_NAME
    WHEN 'microorganism_technical_profiles' THEN 'ficha_microrganismo'
    WHEN 'product_technical_profiles' THEN 'ficha_produto'
    WHEN 'microorganism_targets' THEN 'alvo_microrganismo'
    WHEN 'product_target_recommendations' THEN 'alvo_produto'
    WHEN 'microorganism_crop_recommendations' THEN 'cultura_microrganismo'
    WHEN 'product_crop_recommendations' THEN 'cultura_produto'
    WHEN 'catalog_technical_sources' THEN 'fonte_tecnica'
    ELSE TG_TABLE_NAME
  END;
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
    INSERT INTO public.catalog_technical_audit_logs(entidade_tipo, entidade_id, acao, dados_anteriores, dados_novos, usuario_id)
    VALUES (v_entidade, v_id, 'delete', to_jsonb(OLD), NULL, auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_id := NEW.id;
    INSERT INTO public.catalog_technical_audit_logs(entidade_tipo, entidade_id, acao, dados_anteriores, dados_novos, usuario_id)
    VALUES (v_entidade, v_id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSE
    v_id := NEW.id;
    INSERT INTO public.catalog_technical_audit_logs(entidade_tipo, entidade_id, acao, dados_anteriores, dados_novos, usuario_id)
    VALUES (v_entidade, v_id, 'insert', NULL, to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_catalog_sources ON public.catalog_technical_sources;
CREATE TRIGGER trg_audit_catalog_sources
  AFTER INSERT OR UPDATE OR DELETE ON public.catalog_technical_sources
  FOR EACH ROW EXECUTE FUNCTION public.log_catalog_change();

-- ============================================================
-- RLS Policies
-- ============================================================

-- SELECT: admin, gestor, consultor_tecnico, tecnico_agronomo, gestor_comercial
DROP POLICY IF EXISTS "catalog_sources_select_internal" ON public.catalog_technical_sources;
CREATE POLICY "catalog_sources_select_internal"
ON public.catalog_technical_sources
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role) OR
  public.has_role(auth.uid(), 'gestor'::app_role) OR
  public.has_role(auth.uid(), 'consultor_tecnico'::app_role) OR
  public.has_role(auth.uid(), 'tecnico_agronomo'::app_role) OR
  public.has_role(auth.uid(), 'gestor_comercial'::app_role)
);

-- INSERT: admin, gestor, consultor_tecnico, tecnico_agronomo, gestor_comercial
DROP POLICY IF EXISTS "catalog_sources_insert" ON public.catalog_technical_sources;
CREATE POLICY "catalog_sources_insert"
ON public.catalog_technical_sources
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role) OR
  public.has_role(auth.uid(), 'gestor'::app_role) OR
  public.has_role(auth.uid(), 'consultor_tecnico'::app_role) OR
  public.has_role(auth.uid(), 'tecnico_agronomo'::app_role) OR
  public.has_role(auth.uid(), 'gestor_comercial'::app_role)
);

-- UPDATE: admin, gestor, consultor_tecnico, tecnico_agronomo
DROP POLICY IF EXISTS "catalog_sources_update" ON public.catalog_technical_sources;
CREATE POLICY "catalog_sources_update"
ON public.catalog_technical_sources
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role) OR
  public.has_role(auth.uid(), 'gestor'::app_role) OR
  public.has_role(auth.uid(), 'consultor_tecnico'::app_role) OR
  public.has_role(auth.uid(), 'tecnico_agronomo'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'administrador'::app_role) OR
  public.has_role(auth.uid(), 'gestor'::app_role) OR
  public.has_role(auth.uid(), 'consultor_tecnico'::app_role) OR
  public.has_role(auth.uid(), 'tecnico_agronomo'::app_role)
);

-- DELETE: apenas admin e gestor
DROP POLICY IF EXISTS "catalog_sources_delete" ON public.catalog_technical_sources;
CREATE POLICY "catalog_sources_delete"
ON public.catalog_technical_sources
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'administrador'::app_role) OR
  public.has_role(auth.uid(), 'gestor'::app_role)
);
