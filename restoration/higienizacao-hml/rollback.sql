-- =====================================================================
-- ROLLBACK — HIGIENIZAÇÃO DE OBJETOS SINTÉTICOS HML
-- Recria a estrutura mínima dos objetos removidos por
-- supabase/migrations/20260811000000_higienizacao_objetos_hml_sinteticos.sql
-- Os dados originais estão em restoration/higienizacao-hml/baseline/*.csv
-- (reimportar com \copy se necessário).
--
-- Após rodar este script:
--   supabase migration repair --status reverted 20260811000000 --db-url "$STAGING_DSN"
--
-- SOMENTE STAGING ikaauvsflpmamgxmkhoq.
-- =====================================================================
\set ON_ERROR_STOP on

DO $guard$
DECLARE v_marker text; v_ref text;
BEGIN
  SELECT marker, project_ref INTO v_marker, v_ref FROM public._fiscal_staging_marker LIMIT 1;
  IF v_marker IS DISTINCT FROM 'STAGING' OR v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ROLLBACK_ABORT: ambiente nao autorizado';
  END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.hml_b2b_e2e_evidence (
  id bigserial PRIMARY KEY,
  test_code text NOT NULL,
  descricao text,
  esperado text,
  obtido text,
  passou boolean,
  detalhes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hml_b2b_e2e_evidence ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.hml_b2b_e2e_evidence TO service_role;

CREATE TABLE IF NOT EXISTS public.hml_fixture_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_kind text NOT NULL,
  object_schema text,
  object_name text,
  object_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hml_fixture_registry ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.hml_fixture_registry TO service_role;

CREATE OR REPLACE FUNCTION public.hml_fixture_registry_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_hml_fixture_registry_touch ON public.hml_fixture_registry;
CREATE TRIGGER trg_hml_fixture_registry_touch
  BEFORE UPDATE ON public.hml_fixture_registry
  FOR EACH ROW EXECUTE FUNCTION public.hml_fixture_registry_touch();

CREATE TABLE IF NOT EXISTS public._fiscal_hml_context (
  id bigserial PRIMARY KEY,
  chave text NOT NULL,
  valor jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public._fiscal_hml_inventory (
  id bigserial PRIMARY KEY,
  object_type text NOT NULL,
  object_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Adapter fiscal SIMULADO: recuperar a definição integral em
-- restoration/higienizacao-hml/baseline/objects-ddl.txt
-- (não recriado automaticamente para evitar reintroduzir emissão mock).
