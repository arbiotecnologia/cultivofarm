-- ============================================================================
-- Fase Fiscal 3.17 — 02-seed.sql
-- ----------------------------------------------------------------------------
-- Insere fixtures de homologação com prefixo FISCAL_HML_. Fail-fast:
-- reexecuta preflight e aborta se marker STAGING for removido.
--
-- Nenhum certificado, chave, token ou URL é gravado. Nenhum status
-- AUTHORIZED/ISSUED é criado. Nenhuma empresa singleton é sobrescrita
-- se já existir configuração ativa.
-- ============================================================================

BEGIN;

-- Reafirma o guarda no início da transação.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker WHERE marker = 'STAGING') THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: marker STAGING ausente.';
  END IF;
END $$;

-- Clientes sintéticos.
INSERT INTO public.clientes (id, nome, cpf_cnpj, ativo)
VALUES
  (gen_random_uuid(), 'FISCAL_HML_CLIENTE_A', '00000000000191', true),
  (gen_random_uuid(), 'FISCAL_HML_CLIENTE_B', '00000000000272', true)
ON CONFLICT DO NOTHING;

-- Produto fiscal sintético (perfil mínimo classificado + contabilizado).
-- Detalhamento por schema real é preenchido pelo operador durante a
-- homologação. Este bloco apenas garante um placeholder identificável.
DO $$
DECLARE
  v_cli_a uuid;
  v_cli_b uuid;
BEGIN
  SELECT id INTO v_cli_a FROM public.clientes WHERE nome = 'FISCAL_HML_CLIENTE_A' LIMIT 1;
  SELECT id INTO v_cli_b FROM public.clientes WHERE nome = 'FISCAL_HML_CLIENTE_B' LIMIT 1;

  -- Rascunho NF-e válido.
  INSERT INTO public.fiscal_invoices
    (customer_id, origin, status, homologation_validation_status,
     document_model, environment, fiscal_profile_snapshot, tax_snapshot,
     internal_reference)
  VALUES
    (v_cli_a, 'MANUAL_RECORD', 'DRAFT', 'READY',
     'NFE', 'HOMOLOGATION',
     jsonb_build_object('ncm','21069090','cfop','5102','cst_icms','00','unidade','UN'),
     jsonb_build_object('icms', jsonb_build_object('cst','00','aliquota',18)),
     'FISCAL_HML_NFE_OK');

  -- Rascunho NFS-e válido.
  INSERT INTO public.fiscal_invoices
    (customer_id, origin, status, homologation_validation_status,
     document_model, environment, fiscal_profile_snapshot, tax_snapshot,
     internal_reference)
  VALUES
    (v_cli_b, 'MANUAL_RECORD', 'DRAFT', 'READY',
     'NFSE', 'HOMOLOGATION',
     jsonb_build_object('lc116_item','1.07','cnae','6201501'),
     jsonb_build_object('iss_rate',5,'iss_withheld',false),
     'FISCAL_HML_NFSE_OK');

  -- Rascunho incompleto.
  INSERT INTO public.fiscal_invoices
    (customer_id, origin, status, homologation_validation_status,
     document_model, environment, fiscal_profile_snapshot, tax_snapshot,
     internal_reference)
  VALUES
    (v_cli_a, 'MANUAL_RECORD', 'DRAFT', 'INCOMPLETE',
     'NFE', 'HOMOLOGATION',
     '{}'::jsonb, '{}'::jsonb,
     'FISCAL_HML_NFE_INCOMPLETO');
END $$;

COMMIT;
