-- =====================================================================
-- F4.1-R1 — Postcheck fail-fast da migration incremental
-- Alvo AUTORIZADO: staging ikaauvsflpmamgxmkhoq
-- PROIBIDO: produção navfzbwgwzruipouyfnk
-- STATUS: NÃO EXECUTADO (sem credencial de banco nesta execução).
--
-- Uso: psql --single-transaction -v ON_ERROR_STOP=1 -f postcheck.sql
-- Qualquer gate reprovado aborta com EXCEPTION.
-- =====================================================================
DO $$
DECLARE
  v_missing text;
  v_count   integer;
  v_pkg     constant text := 'PL_010e_v1.02.zip';
  v_pkgsha  constant text :=
    'd44ae5aa6a0d1cabf6235d2d2d47b75be5dd87bc6b90a7ec3dcec99c3d41bda1';
BEGIN
  -- G1: colunas de bytes/hash presentes.
  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(ARRAY['package_name','package_sha256','file_name','file_bytes',
                    'file_sha256','depends_on','retrieved_at','validator']) c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fiscal_xsd_registry'
      AND column_name = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'G1 FALHOU: colunas ausentes em fiscal_xsd_registry: %', v_missing;
  END IF;

  -- G2: os 5 arquivos oficiais do bundle estão registrados e ativos.
  SELECT count(*) INTO v_count
  FROM public.fiscal_xsd_registry
  WHERE package_name = v_pkg AND is_active
    AND file_name IN ('nfe_v4.00.xsd','leiauteNFe_v4.00.xsd','tiposBasico_v4.00.xsd',
                      'DFeTiposBasicos_v1.00.xsd','xmldsig-core-schema_v1.01.xsd');
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'G2 FALHOU: esperados 5 arquivos do bundle, encontrados %', v_count;
  END IF;

  -- G3: hashes exatos dos bytes oficiais.
  SELECT count(*) INTO v_count
  FROM (VALUES
    ('nfe_v4.00.xsd','adce3646c13ceb54922ec3142fc1dc45bd4fb839ac35ad583e86c733c07d27df',716),
    ('leiauteNFe_v4.00.xsd','598c71780cbc6b54f170464bd6d5538c2d01a99d987a1666b662d4e166b84bf7',352527),
    ('tiposBasico_v4.00.xsd','772619c85723e598840667ca66e7298a250442df47eeb94b397d2a333ce62047',22532),
    ('DFeTiposBasicos_v1.00.xsd','7fe1dbd89a1dd80826c5134c2406b7eb5df4fa7a9177c5aa6e72319caba7c6d2',61958),
    ('xmldsig-core-schema_v1.01.xsd','f56744a5f51c03f027de13f39f869307091781a9ef1d91b1ebe14719ce28e1ac',3747)
  ) e(fname, fsha, fbytes)
  JOIN public.fiscal_xsd_registry r
    ON r.file_name = e.fname AND r.file_sha256 = e.fsha AND r.file_bytes = e.fbytes
   AND r.package_sha256 = v_pkgsha;
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'G3 FALHOU: % de 5 arquivos com hash/bytes conferidos', v_count;
  END IF;

  -- G4: grafo de dependências declarado (leiaute e raiz).
  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_xsd_registry
    WHERE file_name = 'leiauteNFe_v4.00.xsd'
      AND depends_on @> ARRAY['tiposBasico_v4.00.xsd','DFeTiposBasicos_v1.00.xsd',
                              'xmldsig-core-schema_v1.01.xsd']
  ) THEN
    RAISE EXCEPTION 'G4 FALHOU: dependências de leiauteNFe_v4.00.xsd não declaradas';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_xsd_registry
    WHERE file_name = 'nfe_v4.00.xsd' AND root_element = 'NFe'
      AND depends_on @> ARRAY['leiauteNFe_v4.00.xsd']
  ) THEN
    RAISE EXCEPTION 'G4 FALHOU: raiz nfe_v4.00.xsd mal declarada';
  END IF;

  -- G5: validador real registrado (não gramática manual).
  SELECT count(*) INTO v_count
  FROM public.fiscal_xsd_registry
  WHERE package_name = v_pkg AND validator LIKE 'xmllint-wasm@%';
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'G5 FALHOU: validador real ausente em % registro(s)', 5 - v_count;
  END IF;

  -- G6: nenhum acesso de anon/PUBLIC ao registro.
  IF has_table_privilege('anon', 'public.fiscal_xsd_registry', 'SELECT')
     OR has_table_privilege('public', 'public.fiscal_xsd_registry', 'SELECT') THEN
    RAISE EXCEPTION 'G6 FALHOU: anon/PUBLIC com SELECT em fiscal_xsd_registry';
  END IF;

  -- G7: RLS continua habilitada e forçada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.fiscal_xsd_registry'::regclass
      AND relrowsecurity AND relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'G7 FALHOU: RLS não está ENABLE+FORCE em fiscal_xsd_registry';
  END IF;

  -- G8: teto de ambiente intacto (nenhuma execução em produção).
  IF EXISTS (SELECT 1 FROM public.fiscal_xml_runs WHERE environment_code <> '2') THEN
    RAISE EXCEPTION 'G8 FALHOU: execução fora de homologação em fiscal_xml_runs';
  END IF;

  RAISE NOTICE 'POSTCHECK F4.1-R1: 8/8 GATES PASS';
END$$;
