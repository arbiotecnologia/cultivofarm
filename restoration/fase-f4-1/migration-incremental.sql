-- =====================================================================
-- FASE F4.1-R1 — Registro real do bundle XSD oficial da NF-e 4.00
-- Alvo AUTORIZADO: staging ikaauvsflpmamgxmkhoq
-- PROIBIDO: produção navfzbwgwzruipouyfnk
-- STATUS: NÃO APLICADA (sem credencial de banco nesta execução).
--
-- Motivo: `public.fiscal_xsd_registry` registrava apenas descrições. Esta
-- migration passa a registrar os BYTES reais do bundle oficial: nome do
-- arquivo, tamanho, SHA-256, pacote de origem e dependências
-- (xs:include / xs:import), permitindo auditoria de que a validação foi
-- feita contra o esquema oficial e não contra gramática derivada.
--
-- Bundle: PL_010e_v1.02 (Portal Nacional da NF-e, publicado 10/07/2026)
-- SHA-256 do pacote: d44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1
-- Cópia versionada no repositório: supabase/functions/fiscal-xml-engine/xsd/
-- =====================================================================
BEGIN;

ALTER TABLE public.fiscal_xsd_registry
  ADD COLUMN IF NOT EXISTS package_name    text,
  ADD COLUMN IF NOT EXISTS package_sha256  text,
  ADD COLUMN IF NOT EXISTS file_name       text,
  ADD COLUMN IF NOT EXISTS file_bytes      integer,
  ADD COLUMN IF NOT EXISTS file_sha256     text,
  ADD COLUMN IF NOT EXISTS depends_on      text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS retrieved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS validator       text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fiscal_xsd_registry_sha_chk'
      AND conrelid = 'public.fiscal_xsd_registry'::regclass
  ) THEN
    ALTER TABLE public.fiscal_xsd_registry
      ADD CONSTRAINT fiscal_xsd_registry_sha_chk
      CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fiscal_xsd_registry_pkgsha_chk'
      AND conrelid = 'public.fiscal_xsd_registry'::regclass
  ) THEN
    ALTER TABLE public.fiscal_xsd_registry
      ADD CONSTRAINT fiscal_xsd_registry_pkgsha_chk
      CHECK (package_sha256 IS NULL OR package_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- Seed determinístico dos 5 arquivos do bundle oficial.
-- ---------------------------------------------------------------------
WITH bundle(schema_name, root_element, file_name, file_bytes, file_sha256, depends_on) AS (
  VALUES
    ('xmldsig-core-schema', 'Signature', 'xmldsig-core-schema_v1.01.xsd',
      3747, 'f56744a5f51c03f027de13f39f869307091781a9ef1d91b1ebe14719ce28e1ac',
      ARRAY[]::text[]),
    ('tiposBasico', 'TCodUfIBGE', 'tiposBasico_v4.00.xsd',
      22532, '772619c85723e598840667ca66e7298a250442df47eeb94b397d2a333ce62047',
      ARRAY[]::text[]),
    ('DFeTiposBasicos', 'TCodMunIBGE', 'DFeTiposBasicos_v1.00.xsd',
      61958, '7fe1dbd89a1dd80826c5134c2406b7eb5df4fa7a9177c5aa6e72319caba7c6d2',
      ARRAY[]::text[]),
    ('leiauteNFe', 'TNFe', 'leiauteNFe_v4.00.xsd',
      352527, '598c71780cbc6b54f170464bd6d5538c2d01a99d987a1666b662d4e166b84bf7',
      ARRAY['tiposBasico_v4.00.xsd','DFeTiposBasicos_v1.00.xsd','xmldsig-core-schema_v1.01.xsd']),
    ('nfe', 'NFe', 'nfe_v4.00.xsd',
      716, 'adce3646c13ceb54922ec3142fc1dc45bd4fb839ac35ad583e86c733c07d27df',
      ARRAY['leiauteNFe_v4.00.xsd'])
)
INSERT INTO public.fiscal_xsd_registry (
  schema_name, schema_version, document_model, root_element, namespace_uri,
  source_url, legal_basis, published_at, is_active, notes,
  package_name, package_sha256, file_name, file_bytes, file_sha256,
  depends_on, retrieved_at, validator
)
SELECT
  b.schema_name,
  CASE WHEN b.schema_name = 'xmldsig-core-schema' THEN '1.01'
       WHEN b.schema_name = 'DFeTiposBasicos'     THEN '1.00'
       ELSE '4.00' END,
  '55',
  b.root_element,
  CASE WHEN b.schema_name = 'xmldsig-core-schema'
       THEN 'http://www.w3.org/2000/09/xmldsig#'
       ELSE 'http://www.portalfiscal.inf.br/nfe' END,
  'https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D',
  'MOC NF-e 4.00 / NT 2025.002 v.1.40, NT 2026.002 v.1.0, NT 2026.003 v.1.0',
  DATE '2026-07-10',
  true,
  'Bundle PL_010e_v1.02; imports/includes resolvidos apenas por preload local (sem rede).',
  'PL_010e_v1.02.zip',
  'd44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1',
  b.file_name, b.file_bytes, b.file_sha256, b.depends_on,
  TIMESTAMPTZ '2026-08-06 02:45:40+00',
  'xmllint-wasm@5.3.0 (libxml2, XSD 1.0)'
FROM bundle b
ON CONFLICT (schema_name, schema_version) DO UPDATE
SET root_element   = EXCLUDED.root_element,
    namespace_uri  = EXCLUDED.namespace_uri,
    source_url     = EXCLUDED.source_url,
    legal_basis    = EXCLUDED.legal_basis,
    published_at   = EXCLUDED.published_at,
    notes          = EXCLUDED.notes,
    package_name   = EXCLUDED.package_name,
    package_sha256 = EXCLUDED.package_sha256,
    file_name      = EXCLUDED.file_name,
    file_bytes     = EXCLUDED.file_bytes,
    file_sha256    = EXCLUDED.file_sha256,
    depends_on     = EXCLUDED.depends_on,
    retrieved_at   = EXCLUDED.retrieved_at,
    validator      = EXCLUDED.validator,
    is_active      = true;

-- Nenhum GRANT novo: a tabela permanece com leitura apenas para perfis
-- internos (RLS FORCE) e sem qualquer acesso a anon/PUBLIC.

COMMIT;
