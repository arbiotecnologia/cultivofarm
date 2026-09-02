-- H7A — ROLLBACK — somente se aprovado pelo pipeline de staging.
-- Não restaura colunas de senha nem qualquer material criptográfico.
-- A reversão é deliberadamente bloqueada quando houver certificado A1 ativo,
-- para evitar deixar uma referência ativa sem contrato de integridade.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.fiscal_environment_marker
    WHERE project_ref = 'ikaauvsflpmamgxmkhoq'
      AND environment_label = 'STAGING'
      AND production_emission_allowed = false
  ) THEN
    RAISE EXCEPTION 'H7A rollback: ambiente nao autorizado';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.fiscal_certificates
    WHERE environment = 'HOMOLOGATION'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'H7A rollback abortado: certificado A1 ativo exige revogacao antes da reversao';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_fiscal_certificate_ref_guard ON public.company_fiscal_settings;
DROP FUNCTION IF EXISTS public.fn_fiscal_certificate_ref_guard();

-- Restaura somente a RPC anterior já existente no contrato H7d, sem alterar
-- tabelas, bucket, bundle ou colunas de senha. O vínculo ficará sem automação;
-- o rollback deve ser seguido pela restauração da função H7d anterior.

COMMIT;
