-- =====================================================================
-- FASE F3 — CORREÇÃO DA AUDITORIA (complemento 2)
-- Fonte oficial MAPA/SIPEAGRO com URL específica (não a home do portal).
-- Incremental e idempotente. STAGING ikaauvsflpmamgxmkhoq.
-- =====================================================================

UPDATE public.fiscal_official_sources
   SET url = 'https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-pecuarios/produtos-veterinarios/sipeagro',
       updated_at = now()
 WHERE source_key = 'MAPA_SIPEAGRO'
   AND (url IS NULL OR url ~ '^https://[^/]+/?$');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.fiscal_official_sources
   WHERE url IS NULL OR url !~ '^https://' OR url ~ '^https://[^/]+/?$';
  IF n > 0 THEN
    RAISE EXCEPTION 'FISCAL_SOURCE_URL_GENERIC: % fonte(s) oficial(is) ainda apontam para home generica.', n;
  END IF;
END $$;
