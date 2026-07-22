-- ============================================================================
-- Fase Fiscal 3.17.1 — 02-seed.sql
-- ----------------------------------------------------------------------------
-- Insere fixtures de homologação em STAGING. Reexecuta o preflight
-- inteiro e mantém as invariantes:
--   * usa colunas reais do schema canônico (auditoria 3.17.1):
--       - fiscal_invoices: document_origin, invoice_type, created_by,
--         customer_id, provider='NONE', normalized_status='DRAFT',
--         status='DRAFT', environment='HOMOLOGATION', document_model,
--         notes começando com 'FISCAL_HML_';
--       - fiscal_invoice_items: fiscal_invoice_id, item_sequence,
--         item_kind ('PRODUCT'|'SERVICE'), description, quantity,
--         unit_value, gross_value, net_value, snapshots.
--       - clientes: nome, cpf_cnpj, codigo_cliente (NOT NULL),
--         com prefixo FISCAL_HML_ no nome e no codigo_cliente.
--   * NUNCA usa a coluna `origin` (inexistente).
--   * NUNCA usa a coluna `invoice_id` em fiscal_invoice_items.
--   * NUNCA usa `internal_reference` (não comprovada no schema).
--   * NUNCA usa um usuário real de auth.users por fallback.
--   * Nenhum status AUTHORIZED/ISSUED/TRANSMITTED.
--   * Nenhum certificado real.
--
-- O usuário responsável precisa registrar o UUID sintético em
-- public._fiscal_hml_context (marker='HML_USER') antes de rodar este seed.
-- ============================================================================

BEGIN;

-- ---- Reafirma o guarda -----------------------------------------------------
DO $$
DECLARE
  v_marker_ref  text;
  v_session_ref text;
BEGIN
  IF to_regclass('public._fiscal_staging_marker') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: marker STAGING ausente.';
  END IF;
  SELECT project_ref INTO v_marker_ref
    FROM public._fiscal_staging_marker
   WHERE marker = 'STAGING' LIMIT 1;
  IF v_marker_ref IS NULL THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: marker STAGING sem project_ref.';
  END IF;
  BEGIN
    v_session_ref := current_setting('app.fiscal_test_project_ref', true);
  EXCEPTION WHEN OTHERS THEN v_session_ref := NULL; END;
  IF v_session_ref IS NULL OR v_session_ref <> v_marker_ref THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: GUC app.fiscal_test_project_ref ausente ou divergente.';
  END IF;
END $$;

-- ---- Contexto sintético obrigatório ----------------------------------------
CREATE TABLE IF NOT EXISTS public._fiscal_hml_context (
  marker text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Inventário isolado do pacote: qualquer fixture criada por este seed
-- é registrada aqui para o cleanup remover apenas o que este pacote criou.
CREATE TABLE IF NOT EXISTS public._fiscal_hml_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('CLIENTE','FISCAL_INVOICE')),
  object_id uuid NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, object_id)
);

-- ---- Seed determinístico ---------------------------------------------------
DO $$
DECLARE
  v_user       uuid;
  v_cli_a      uuid := gen_random_uuid();
  v_cli_b      uuid := gen_random_uuid();
  v_inv_nfe    uuid := gen_random_uuid();
  v_inv_nfse   uuid := gen_random_uuid();
  v_inv_bad    uuid := gen_random_uuid();
BEGIN
  SELECT user_id INTO v_user
    FROM public._fiscal_hml_context
   WHERE marker = 'HML_USER' LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: registre um UUID sintético em public._fiscal_hml_context (marker=HML_USER) antes de rodar o seed.';
  END IF;

  -- Validação explícita: o usuário precisa existir em auth.users E ter
  -- e-mail inequivocamente sintético (prefixo fiscal-hml-, domínio
  -- example.invalid, case-insensitive). Sem fallback. Sem coincidência.
  IF NOT EXISTS (
    SELECT 1
      FROM auth.users u
     WHERE u.id = v_user
       AND lower(u.email) LIKE 'fiscal-hml-%@example.invalid'
  ) THEN
    RAISE EXCEPTION 'FISCAL_HML_ABORT: usuário % não é sintético (exige auth.users com e-mail fiscal-hml-*@example.invalid).', v_user;
  END IF;

  -- Clientes com codigo_cliente obrigatório e prefixado.
  -- A tabela public.clientes NÃO possui a coluna `ativo` (auditoria 3.17.2).
  INSERT INTO public.clientes (id, nome, cpf_cnpj, codigo_cliente)
  VALUES
    (v_cli_a, 'FISCAL_HML_CLIENTE_A', '00000000000191', 'FISCAL_HML_A'),
    (v_cli_b, 'FISCAL_HML_CLIENTE_B', '00000000000272', 'FISCAL_HML_B');


  INSERT INTO public._fiscal_hml_inventory (kind, object_id, label) VALUES
    ('CLIENTE', v_cli_a, 'FISCAL_HML_CLIENTE_A'),
    ('CLIENTE', v_cli_b, 'FISCAL_HML_CLIENTE_B');

  -- Rascunho NF-e válido (produto).
  INSERT INTO public.fiscal_invoices
    (id, invoice_type, document_model, document_origin, environment, provider,
     status, normalized_status, homologation_validation_status,
     customer_id, notes, fiscal_profile_snapshot, tax_snapshot,
     draft_version, created_by, total_amount)
  VALUES
    (v_inv_nfe, 'NFE', 'NFE', 'MANUAL_RECORD', 'HOMOLOGATION', 'NONE',
     'DRAFT','DRAFT','READY',
     v_cli_a, 'FISCAL_HML_NFE_OK',
     jsonb_build_object('ncm','21069090','cfop','5102','cst_icms','00','unidade','UN'),
     jsonb_build_object('icms', jsonb_build_object('cst','00','aliquota',18)),
     1, v_user, 100.00);

  INSERT INTO public.fiscal_invoice_items
    (fiscal_invoice_id, item_sequence, item_kind, description,
     quantity, commercial_unit, unit_value, gross_value, net_value,
     fiscal_profile_snapshot, tax_snapshot)
  VALUES
    (v_inv_nfe, 1, 'PRODUCT', 'FISCAL_HML_PRODUTO_A',
     1, 'UN', 100.00, 100.00, 100.00,
     jsonb_build_object('ncm','21069090','cfop','5102','cst_icms','00'),
     jsonb_build_object('icms', jsonb_build_object('cst','00','aliquota',18)));

  INSERT INTO public._fiscal_hml_inventory (kind, object_id, label)
    VALUES ('FISCAL_INVOICE', v_inv_nfe, 'FISCAL_HML_NFE_OK');

  -- Rascunho NFS-e válido (serviço).
  INSERT INTO public.fiscal_invoices
    (id, invoice_type, document_model, document_origin, environment, provider,
     status, normalized_status, homologation_validation_status,
     customer_id, notes, fiscal_profile_snapshot, tax_snapshot,
     draft_version, created_by, total_amount)
  VALUES
    (v_inv_nfse, 'NFSE', 'NFSE', 'MANUAL_RECORD', 'HOMOLOGATION', 'NONE',
     'DRAFT','DRAFT','READY',
     v_cli_b, 'FISCAL_HML_NFSE_OK',
     jsonb_build_object('lc116_item','1.07','cnae','6201501'),
     jsonb_build_object('iss_rate',5,'iss_withheld',false),
     1, v_user, 250.00);

  INSERT INTO public.fiscal_invoice_items
    (fiscal_invoice_id, item_sequence, item_kind, description,
     quantity, commercial_unit, unit_value, gross_value, net_value,
     fiscal_profile_snapshot, tax_snapshot)
  VALUES
    (v_inv_nfse, 1, 'SERVICE', 'FISCAL_HML_SERVICO_A',
     1, 'SV', 250.00, 250.00, 250.00,
     jsonb_build_object('lc116_item','1.07','cnae','6201501'),
     jsonb_build_object('iss_rate',5,'iss_withheld',false));

  INSERT INTO public._fiscal_hml_inventory (kind, object_id, label)
    VALUES ('FISCAL_INVOICE', v_inv_nfse, 'FISCAL_HML_NFSE_OK');

  -- Rascunho NF-e incompleto (intencional).
  INSERT INTO public.fiscal_invoices
    (id, invoice_type, document_model, document_origin, environment, provider,
     status, normalized_status, homologation_validation_status,
     customer_id, notes, fiscal_profile_snapshot, tax_snapshot,
     draft_version, created_by, total_amount)
  VALUES
    (v_inv_bad, 'NFE', 'NFE', 'MANUAL_RECORD', 'HOMOLOGATION', 'NONE',
     'DRAFT','DRAFT','INCOMPLETE',
     v_cli_a, 'FISCAL_HML_NFE_INCOMPLETO',
     '{}'::jsonb, '{}'::jsonb,
     1, v_user, 0.00);

  INSERT INTO public._fiscal_hml_inventory (kind, object_id, label)
    VALUES ('FISCAL_INVOICE', v_inv_bad, 'FISCAL_HML_NFE_INCOMPLETO');
END $$;

COMMIT;
