-- =====================================================================
-- F4.1-R1 — Rollback da migration incremental do bundle XSD oficial
-- Alvo AUTORIZADO: staging ikaauvsflpmamgxmkhoq
-- PROIBIDO: produção navfzbwgwzruipouyfnk
-- STATUS: NÃO APLICADO (sem credencial de banco nesta execução).
--
-- Forward-safe: remove apenas o que a migration incremental acrescentou.
-- Não apaga execuções (`fiscal_xml_runs`) nem artefatos de Storage.
-- =====================================================================
BEGIN;

-- 1. Desfaz o seed do bundle oficial (identificado pelo pacote).
DELETE FROM public.fiscal_xsd_registry
WHERE package_name = 'PL_010e_v1.02.zip';

-- 2. Remove as constraints acrescentadas.
ALTER TABLE public.fiscal_xsd_registry
  DROP CONSTRAINT IF EXISTS fiscal_xsd_registry_sha_chk,
  DROP CONSTRAINT IF EXISTS fiscal_xsd_registry_pkgsha_chk;

-- 3. Remove as colunas acrescentadas.
ALTER TABLE public.fiscal_xsd_registry
  DROP COLUMN IF EXISTS package_name,
  DROP COLUMN IF EXISTS package_sha256,
  DROP COLUMN IF EXISTS file_name,
  DROP COLUMN IF EXISTS file_bytes,
  DROP COLUMN IF EXISTS file_sha256,
  DROP COLUMN IF EXISTS depends_on,
  DROP COLUMN IF EXISTS retrieved_at,
  DROP COLUMN IF EXISTS validator;

COMMIT;
