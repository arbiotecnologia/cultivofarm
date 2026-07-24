-- =====================================================================
-- Fase SINIEF 4.0 — CASOS SINTÉTICOS DOS 7 CENÁRIOS SINIEF 49/2025
--
-- NÃO EXECUTAR NESTE SANDBOX. Preparado apenas para staging AR-Bio-TEMP
-- (ref ikaauvsflpmamgxmkhoq). Todos os registros são fixture-only e
-- serão removidos por 99-cleanup.sql. Nenhum serviço/NFS-e. Nenhum XML.
-- Nenhuma emissão. `canTransmit` continua false em runtime.
--
-- Cobertura:
--   1. ADVANCE_PAYMENT             — OUT, fin_nfe=6, tp_nf_debito=06
--   2. EFFECTIVE_SALE_AFTER_ADVANCE — OUT, fin_nfe=1, referencia (1)
--   3. STOCK_LOSS                  — OUT, fin_nfe=6, tp_nf_debito=07
--                                    + fiscal_stock_loss_contexts
--   4. VALUE_QUANTITY_REDUCTION    — IN,  fin_nfe=5, tp_nf_credito=04
--                                    + item reference REDUCTION_ITEM
--   5. DELIVERY_REFUSAL_TOTAL      — IN,  fin_nfe=5, tp_nf_credito=03
--   6. DELIVERY_REFUSAL_PARTIAL    — IN,  fin_nfe=5, tp_nf_credito=06
--                                    + item reference PARTIAL_REFUSAL_ITEM
--   7. RECIPIENT_NOT_FOUND         — IN,  fin_nfe=5, tp_nf_credito=03
--
-- Cada cenário inclui um item associado a "produto sintético" e outro
-- a "microrganismo direto" (source_reference='MICROORGANISM') para
-- garantir a paridade product×microorganism, ambos com perfil fiscal
-- próprio marcado.
-- =====================================================================

BEGIN;

-- Guards inegociáveis (idempotentes com 10-fixtures.sql).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public._fiscal_staging_marker
     WHERE marker='STAGING' AND project_ref='ikaauvsflpmamgxmkhoq'
  ) THEN
    RAISE EXCEPTION 'ABORT: marker _fiscal_staging_marker ausente/incompatível';
  END IF;
END $$;

-- Documento "original" de referência (para cenários 2/4/5/6/7).
INSERT INTO public.fiscal_invoices (id, status, direction, fiscal_operation_type)
VALUES ('00000000-0000-4000-8000-000000000000','DRAFT','OUT','NORMAL')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_items (id, fiscal_invoice_id)
VALUES
  ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-000000000000'),
  ('00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-000000000000')
ON CONFLICT (id) DO NOTHING;

-- ----- 1. ADVANCE_PAYMENT --------------------------------------------
INSERT INTO public.fiscal_invoices
  (id, status, direction, fiscal_operation_type, fin_nfe, tp_nf_debito,
   nature_operation, legal_basis, legal_version, legal_effective_date,
   tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000001','DRAFT','OUT','ADVANCE_PAYMENT',
        6, 6, 'Venda para entrega futura - Pagamento antecipado',
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 1')
ON CONFLICT (id) DO NOTHING;

-- ----- 2. EFFECTIVE_SALE_AFTER_ADVANCE -------------------------------
INSERT INTO public.fiscal_invoices
  (id, status, direction, fiscal_operation_type, fin_nfe, nature_operation,
   legal_basis, legal_version, legal_effective_date, tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000002','DRAFT','OUT','EFFECTIVE_SALE_AFTER_ADVANCE',
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
  (id, status, direction, fiscal_operation_type, fin_nfe, tp_nf_debito,
   nature_operation, legal_basis, legal_version, legal_effective_date,
   tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000003','DRAFT','OUT','STOCK_LOSS',
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
INSERT INTO public.fiscal_invoices
  (id, status, direction, fiscal_operation_type, fin_nfe, tp_nf_credito,
   nature_operation, legal_basis, legal_version, legal_effective_date,
   tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000004','DRAFT','IN','VALUE_QUANTITY_REDUCTION',
        5, 4, 'Redução de valores ou quantidades',
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 4')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_items (id, fiscal_invoice_id)
VALUES ('00000000-0000-4000-8000-0000000000b4','00000000-0000-4000-8000-000000000004')
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
  (id, status, direction, fiscal_operation_type, fin_nfe, tp_nf_credito,
   nature_operation, legal_basis, legal_version, legal_effective_date,
   tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000005','DRAFT','IN','DELIVERY_REFUSAL_TOTAL',
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
  (id, status, direction, fiscal_operation_type, fin_nfe, tp_nf_credito,
   nature_operation, legal_basis, legal_version, legal_effective_date,
   tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000006','DRAFT','IN','DELIVERY_REFUSAL_PARTIAL',
        5, 6, 'Devolução por recusa parcial do destinatário',
        'Ajuste SINIEF 49/2025 consolidado','2026-08-03/consolidado',
        DATE '2026-08-03','FIXTURE sinief49-fx cenario 6')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fiscal_invoice_items (id, fiscal_invoice_id)
VALUES ('00000000-0000-4000-8000-0000000000b6','00000000-0000-4000-8000-000000000006')
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
  (id, status, direction, fiscal_operation_type, fin_nfe, tp_nf_credito,
   nature_operation, legal_basis, legal_version, legal_effective_date,
   tax_authority_notes)
VALUES ('00000000-0000-4000-8000-000000000007','DRAFT','IN','RECIPIENT_NOT_FOUND',
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
