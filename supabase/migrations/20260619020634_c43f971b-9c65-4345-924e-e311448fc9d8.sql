
-- 1. Tighten INSERT policy: remove gestor_comercial
DROP POLICY IF EXISTS catalog_sources_insert ON public.catalog_technical_sources;
CREATE POLICY catalog_sources_insert
ON public.catalog_technical_sources
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
  OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
);

-- 2. Improve source_key normalization
CREATE OR REPLACE FUNCTION public.catalog_sources_set_source_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_ref text;
BEGIN
  v_ref := coalesce(NEW.fonte_url, NEW.fonte_titulo, '');
  v_ref := regexp_replace(trim(lower(v_ref)), '\s+', ' ', 'g');
  NEW.source_key := lower(md5(
    trim(lower(coalesce(NEW.entidade_tipo, ''))) || ':' ||
    trim(lower(coalesce(NEW.entidade_id::text, ''))) || ':' ||
    v_ref
  ));
  RETURN NEW;
END;
$function$;
