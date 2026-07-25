-- =====================================================================
-- Fase SINIEF 4.0.1 — 7 CENÁRIOS SINIEF 49/2025 (TEMPLATE PARAMETRIZADO)
--
-- STAGING AR-Bio-TEMP apenas. Variável obrigatória do runner:
--   :'seed_user_id' → uuid do admin sintético (created_by).
--
-- Payloads respeitam todos os campos NOT NULL:
--   fiscal_invoices:      invoice_type, status, created_by
--   fiscal_invoice_items: item_sequence, item_kind
--
-- Nenhum serviço/NFS-e. Nenhum XML. Nenhum provedor. canTransmit=false.
-- =====================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Guard idempotente com fixtures.
DO $guard$
DECLARE
  v_project_ref text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker) THEN
    RAISE EXCEPTION 'ABORT[scenarios]: marker ausente';
  END IF;
  SELECT project_ref INTO v_project_ref
    FROM public._fiscal_staging_marker WHERE marker='STAGING';
  IF v_project_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'ABORT[scenarios]: project_ref=% ≠ ikaauvsflpmamgxmkhoq', v_project_ref;
  END IF;
  IF v_project_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT[scenarios]: PRODUÇÃO detectada';
  END IF;
END
$guard$;

-- Documento "original" (referência dos cenários 2/4/5/6/7).
INSERT INTO public.fiscal_invoices
  (id, invoice_type, status, normalized_status, created_by, direction, fiscal_operation_type,
   tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000000',
        'NFE','PENDING','DRAFT',:'seed_user_id'::uuid,'OUT','NORMAL',
        'FIXTURE sinief49-fx original')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_items
  (id, fiscal_invoice_id, item_sequence, item_kind, description)
VALUES
  ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000000',
   1,'PRODUCT','FIXTURE original item 1'),
  ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000000',
   2,'PRODUCT','FIXTURE original item 2')
ON CONFLICT (id) DO NOTHING;

-- ----- 1. ADVANCE_PAYMENT --------------------------------------------
INSERT INTO public.fiscal_invoices
  (id, invoice_type, status, normalized_status, created_by, direction, fiscal_operation_type,
   fin_nfe, tp_nf_debito, nature_operation,
   legal_basis, legal_version, legal_effective_date, tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000001',
        'NFE','PENDING','DRAFT',:'seed_user_id'::uuid,'OUT','ADVANCE_PAYMENT',
        6, 6, 'Venda para entrega futura - Pagamento antecipado',
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_items
  (id, fiscal_invoice_id, item_sequence, item_kind, description)
VALUES ('00000000-0000-4000-8000-0000000000c1',
        '00000000-0000-4000-8000-000000000001',
        1,'PRODUCT','FIXTURE cenario 1 produto')
ON CONFLICT (id) DO NOTHING;

-- ----- 2. EFFECTIVE_SALE_AFTER_ADVANCE -------------------------------
INSERT INTO public.fiscal_invoices
  (id, invoice_type, status, normalized_status, created_by, direction, fiscal_operation_type,
   fin_nfe, nature_operation,
   legal_basis, legal_version, legal_effective_date, tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000002',
        'NFE','PENDING','DRAFT',:'seed_user_id'::uuid,'OUT','EFFECTIVE_SALE_AFTER_ADVANCE',
        1, 'Venda de mercadoria - Entrega efetiva referente a antecipação',
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_references
  (fiscal_invoice_id, referenced_invoice_id, relation_type, notes)
VALUES ('00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000001',
        'ADVANCE_PAYMENT_OF','FIXTURE sinief49-fx')
ON CONFLICT DO NOTHING;

-- ----- 3. STOCK_LOSS + fiscal_stock_loss_contexts --------------------
INSERT INTO public.fiscal_invoices
  (id, invoice_type, status, normalized_status, created_by, direction, fiscal_operation_type,
   fin_nfe, tp_nf_debito, nature_operation,
   legal_basis, legal_version, legal_effective_date, tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000003',
        'NFE','PENDING','DRAFT',:'seed_user_id'::uuid,'OUT','STOCK_LOSS',
        6, 7, 'Baixa de Estoque',
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 3 perecimento')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_stock_loss_contexts
  (fiscal_invoice_id, legal_reason_category, legal_reason_details)
VALUES ('00000000-0000-4000-8000-000000000003','PERISHMENT',
        'FIXTURE sinief49-fx perecimento controlado em bancada')
ON CONFLICT DO NOTHING;

-- ----- 4. VALUE_QUANTITY_REDUCTION -----------------------------------
-- SINIEF 20/2026: original_recipient_snapshot é NOT NULL para este cenário
-- (verificado por chk_fi_sinief20_reduction_dest_snapshot).
INSERT INTO public.fiscal_invoices
  (id, invoice_type, status, normalized_status, created_by, direction, fiscal_operation_type,
   fin_nfe, tp_nf_credito, nature_operation,
   original_recipient_snapshot,
   legal_basis, legal_version, legal_effective_date, tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000004',
        'NFE','PENDING','DRAFT',:'seed_user_id'::uuid,'IN','VALUE_QUANTITY_REDUCTION',
        5, 4, 'Redução de valores ou quantidades',
        jsonb_build_object(
          'kind','EXTERNAL',
          'cnpjCpf','98765432000188',
          'name','FIXTURE sinief49-fx destinatário original',
          'capturedAt', '2026-08-08T00:00:00Z',
          'source','xml.dest'),
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 4')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_items
  (id, fiscal_invoice_id, item_sequence, item_kind, description)
VALUES ('00000000-0000-4000-8000-0000000000b4',
        '00000000-0000-4000-8000-000000000004',
        1,'PRODUCT','FIXTURE cenario 4 item')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_references
  (fiscal_invoice_id, referenced_invoice_id, relation_type)
VALUES ('00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000000','REDUCTION_OF')
ON CONFLICT DO NOTHING;

INSERT INTO public.fiscal_invoice_item_references
  (fiscal_invoice_item_id, referenced_item_id, reference_type,
   referenced_quantity, referenced_value)
VALUES ('00000000-0000-4000-8000-0000000000b4',
        '00000000-0000-4000-8000-0000000000a1','REDUCTION_ITEM',
        1.500000, 25.00)
ON CONFLICT DO NOTHING;

-- ----- 5. DELIVERY_REFUSAL_TOTAL -------------------------------------
INSERT INTO public.fiscal_invoices
  (id, invoice_type, status, normalized_status, created_by, direction, fiscal_operation_type,
   fin_nfe, tp_nf_credito, nature_operation,
   legal_basis, legal_version, legal_effective_date, tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000005',
        'NFE','PENDING','DRAFT',:'seed_user_id'::uuid,'IN','DELIVERY_REFUSAL_TOTAL',
        5, 3, 'Devolução por recusa total do destinatário',
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 5')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_references
  (fiscal_invoice_id, referenced_invoice_id, relation_type)
VALUES ('00000000-0000-4000-8000-000000000005',
        '00000000-0000-4000-8000-000000000000','TOTAL_REFUSAL_OF')
ON CONFLICT DO NOTHING;

-- ----- 6. DELIVERY_REFUSAL_PARTIAL -----------------------------------
INSERT INTO public.fiscal_invoices
  (id, invoice_type, status, normalized_status, created_by, direction, fiscal_operation_type,
   fin_nfe, tp_nf_credito, nature_operation,
   legal_basis, legal_version, legal_effective_date, tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000006',
        'NFE','PENDING','DRAFT',:'seed_user_id'::uuid,'IN','DELIVERY_REFUSAL_PARTIAL',
        5, 6, 'Devolução por recusa parcial do destinatário',
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 6')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_items
  (id, fiscal_invoice_id, item_sequence, item_kind, description)
VALUES ('00000000-0000-4000-8000-0000000000b6',
        '00000000-0000-4000-8000-000000000006',
        1,'PRODUCT','FIXTURE cenario 6 item')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_references
  (fiscal_invoice_id, referenced_invoice_id, relation_type)
VALUES ('00000000-0000-4000-8000-000000000006',
        '00000000-0000-4000-8000-000000000000','PARTIAL_REFUSAL_OF')
ON CONFLICT DO NOTHING;

INSERT INTO public.fiscal_invoice_item_references
  (fiscal_invoice_item_id, referenced_item_id, reference_type,
   referenced_quantity, referenced_value)
VALUES ('00000000-0000-4000-8000-0000000000b6',
        '00000000-0000-4000-8000-0000000000a2','PARTIAL_REFUSAL_ITEM',
        0.500000, 12.34)
ON CONFLICT DO NOTHING;

-- ----- 7. RECIPIENT_NOT_FOUND ----------------------------------------
INSERT INTO public.fiscal_invoices
  (id, invoice_type, status, normalized_status, created_by, direction, fiscal_operation_type,
   fin_nfe, tp_nf_credito, nature_operation,
   legal_basis, legal_version, legal_effective_date, tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000007',
        'NFE','PENDING','DRAFT',:'seed_user_id'::uuid,'IN','RECIPIENT_NOT_FOUND',
        5, 3, 'Devolução por destinatário não localizado',
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 7')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_references
  (fiscal_invoice_id, referenced_access_key, relation_type)
VALUES ('00000000-0000-4000-8000-000000000007',
        '00000000000000000000000000000000000000000007',
        'RECIPIENT_NOT_FOUND_OF')
ON CONFLICT DO NOTHING;

COMMIT;
