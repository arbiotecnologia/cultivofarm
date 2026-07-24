-- =====================================================================
-- Fase SINIEF 1 — Modelagem canônica aditiva do Ajuste SINIEF 49/2025
-- consolidado pelos Ajustes SINIEF 8/2026, 15/2026 e 20/2026.
-- Vigência normativa: 03/08/2026.
--
-- FONTE EXECUTÁVEL CANÔNICA (esta fase).
--
-- IMPORTANTE — DIVERGÊNCIA CONTROLADA DA CONVENÇÃO:
--   Nas fases anteriores, o SQL executável canônico residia em
--   supabase/migrations/. Nesta fase, o sandbox do agente NÃO
--   permitiu gravar arquivos novos em supabase/migrations/, e o
--   projeto usa Supabase externo (Lovable Cloud desabilitado), sem
--   ferramenta de migration disponível ao agente. Por isso a fonte
--   executável foi mantida aqui em restoration/migrations/. O
--   humano deve sincronizar este arquivo para
--     supabase/migrations/20260807000000_fiscal_sinief_49_scaffolding.sql
--   e aplicá-lo pelo pipeline oficial, restaurando a convenção
--   anterior a partir da próxima fase.
--
-- Escopo:
--   • fiscal_invoices: campos aditivos (direction, fiscal_operation_type,
--     fin_nfe, tp_nf_debito, tp_nf_credito, nature_operation,
--     tax_authority_notes, legal_basis, legal_version,
--     legal_effective_date) — todos NULLABLE + CHECKs.
--   • fiscal_invoice_references (N:1) para vínculos SINIEF entre
--     documentos.
--   • fiscal_invoice_item_references para DFeReferenciado por item
--     (recusa parcial e redução por item).
--   • fiscal_stock_loss_contexts para categoria legal + justificativa
--     de perda de estoque; FK confirmada para public.lotes; sem FK
--     inventada para movimentação.
--   • fiscal_events.event_type — CHECK reescrito preservando todos os
--     valores atuais e acrescentando os cenários SINIEF.
--
-- NÃO faz: emissão, XML, provedor, transmissão, backfill de dados,
-- edição de migrations existentes, alteração de RLS existente.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. fiscal_invoices — campos aditivos (todos NULLABLE)
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS fiscal_operation_type text,
  ADD COLUMN IF NOT EXISTS fin_nfe smallint,
  ADD COLUMN IF NOT EXISTS tp_nf_debito smallint,
  ADD COLUMN IF NOT EXISTS tp_nf_credito smallint,
  ADD COLUMN IF NOT EXISTS nature_operation text,
  ADD COLUMN IF NOT EXISTS tax_authority_notes text,
  ADD COLUMN IF NOT EXISTS legal_basis text,
  ADD COLUMN IF NOT EXISTS legal_version text,
  ADD COLUMN IF NOT EXISTS legal_effective_date date;

ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_direction,
  ADD CONSTRAINT chk_fi_direction CHECK (
    direction IS NULL OR direction IN ('OUT','IN')
  );

ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_fiscal_operation_type,
  ADD CONSTRAINT chk_fi_fiscal_operation_type CHECK (
    fiscal_operation_type IS NULL OR fiscal_operation_type IN (
      'NORMAL',
      'ADVANCE_PAYMENT',
      'EFFECTIVE_SALE_AFTER_ADVANCE',
      'STOCK_LOSS',
      'VALUE_QUANTITY_REDUCTION',
      'DELIVERY_REFUSAL_TOTAL',
      'DELIVERY_REFUSAL_PARTIAL',
      'RECIPIENT_NOT_FOUND'
    )
  );

ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_fin_nfe,
  ADD CONSTRAINT chk_fi_fin_nfe CHECK (
    fin_nfe IS NULL OR fin_nfe IN (1,2,3,4,5,6)
  );

ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_tp_nf_debito,
  ADD CONSTRAINT chk_fi_tp_nf_debito CHECK (
    tp_nf_debito IS NULL OR tp_nf_debito BETWEEN 1 AND 99
  );

ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS chk_fi_tp_nf_credito,
  ADD CONSTRAINT chk_fi_tp_nf_credito CHECK (
    tp_nf_credito IS NULL OR tp_nf_credito BETWEEN 1 AND 99
  );

CREATE INDEX IF NOT EXISTS ix_fi_fiscal_operation_type
  ON public.fiscal_invoices (fiscal_operation_type)
  WHERE fiscal_operation_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_fi_direction
  ON public.fiscal_invoices (direction)
  WHERE direction IS NOT NULL;

COMMENT ON COLUMN public.fiscal_invoices.direction IS
  'Direção fiscal: OUT (saída) ou IN (entrada). Aditivo SINIEF 49/2025.';
COMMENT ON COLUMN public.fiscal_invoices.fiscal_operation_type IS
  'Cenário SINIEF 49/2025 consolidado: NORMAL, ADVANCE_PAYMENT, EFFECTIVE_SALE_AFTER_ADVANCE, STOCK_LOSS, VALUE_QUANTITY_REDUCTION, DELIVERY_REFUSAL_TOTAL, DELIVERY_REFUSAL_PARTIAL, RECIPIENT_NOT_FOUND.';
COMMENT ON COLUMN public.fiscal_invoices.fin_nfe IS
  'finNFe conforme leiaute NF-e. 1=Normal, 2=Complementar, 3=Ajuste, 4=Devolução, 5=Nota de crédito, 6=Nota de débito.';
COMMENT ON COLUMN public.fiscal_invoices.tp_nf_debito IS
  'tpNFDebito conforme Ajuste SINIEF 49/2025 (ex.: 06 antecipação, 07 perda).';
COMMENT ON COLUMN public.fiscal_invoices.tp_nf_credito IS
  'tpNFCredito conforme Ajuste SINIEF 49/2025 (ex.: 03 recusa total/não localização, 04 redução, 06 recusa parcial).';
COMMENT ON COLUMN public.fiscal_invoices.nature_operation IS
  'natOp preenchido conforme cenário. Padrões definidos no domínio, não no banco.';
COMMENT ON COLUMN public.fiscal_invoices.tax_authority_notes IS
  'Justificativa obrigatória para o fisco (infAdFisco).';

-- ---------------------------------------------------------------------
-- 2. fiscal_invoice_references — vínculo N:1 entre documentos
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_invoice_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_invoice_id uuid NOT NULL
    REFERENCES public.fiscal_invoices(id) ON DELETE CASCADE,
  referenced_invoice_id uuid NULL
    REFERENCES public.fiscal_invoices(id) ON DELETE SET NULL,
  referenced_access_key text NULL,
  relation_type text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT chk_fir_relation_type CHECK (relation_type IN (
    'ADVANCE_PAYMENT_OF',
    'EFFECTIVE_SALE_OF',
    'REDUCTION_OF',
    'TOTAL_REFUSAL_OF',
    'PARTIAL_REFUSAL_OF',
    'RECIPIENT_NOT_FOUND_OF'
  )),
  CONSTRAINT chk_fir_has_target CHECK (
    referenced_invoice_id IS NOT NULL OR referenced_access_key IS NOT NULL
  ),
  CONSTRAINT chk_fir_no_self_reference CHECK (
    referenced_invoice_id IS NULL OR referenced_invoice_id <> fiscal_invoice_id
  ),
  CONSTRAINT chk_fir_access_key_format CHECK (
    referenced_access_key IS NULL OR referenced_access_key ~ '^[0-9]{44}$'
  )
);

CREATE INDEX IF NOT EXISTS ix_fir_fiscal_invoice
  ON public.fiscal_invoice_references (fiscal_invoice_id);
CREATE INDEX IF NOT EXISTS ix_fir_referenced_invoice
  ON public.fiscal_invoice_references (referenced_invoice_id)
  WHERE referenced_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fir_referenced_access_key
  ON public.fiscal_invoice_references (referenced_access_key)
  WHERE referenced_access_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_fir_unique_relation
  ON public.fiscal_invoice_references
    (fiscal_invoice_id, relation_type,
     COALESCE(referenced_invoice_id::text, ''),
     COALESCE(referenced_access_key, ''));

GRANT SELECT, INSERT ON public.fiscal_invoice_references TO authenticated;
GRANT ALL ON public.fiscal_invoice_references TO service_role;
ALTER TABLE public.fiscal_invoice_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_invoice_references_read" ON public.fiscal_invoice_references;
CREATE POLICY "fiscal_invoice_references_read"
  ON public.fiscal_invoice_references FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador')
      OR public.has_role(auth.uid(),'gestor')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'administrativo'));

DROP POLICY IF EXISTS "fiscal_invoice_references_insert" ON public.fiscal_invoice_references;
CREATE POLICY "fiscal_invoice_references_insert"
  ON public.fiscal_invoice_references FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'administrador')
           OR public.has_role(auth.uid(),'financeiro'));

COMMENT ON TABLE public.fiscal_invoice_references IS
  'Vínculos SINIEF 49/2025 entre documento atual e documento original (antecipação, saída efetiva, redução, recusa total/parcial, destinatário não localizado). Aceita chave interna e/ou chave de acesso externa; sem autorreferência.';

-- ---------------------------------------------------------------------
-- 3. fiscal_invoice_item_references — DFeReferenciado por item
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_invoice_item_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_invoice_item_id uuid NOT NULL
    REFERENCES public.fiscal_invoice_items(id) ON DELETE CASCADE,
  referenced_item_id uuid NULL
    REFERENCES public.fiscal_invoice_items(id) ON DELETE SET NULL,
  referenced_access_key text NULL,
  referenced_item_sequence int NULL,
  reference_type text NOT NULL,
  referenced_quantity numeric(18,6),
  referenced_value numeric(18,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT chk_fiir_reference_type CHECK (reference_type IN (
    'PARTIAL_REFUSAL_ITEM',
    'REDUCTION_ITEM'
  )),
  CONSTRAINT chk_fiir_has_target CHECK (
    referenced_item_id IS NOT NULL OR referenced_access_key IS NOT NULL
  ),
  CONSTRAINT chk_fiir_no_self_reference CHECK (
    referenced_item_id IS NULL OR referenced_item_id <> fiscal_invoice_item_id
  ),
  CONSTRAINT chk_fiir_access_key_format CHECK (
    referenced_access_key IS NULL OR referenced_access_key ~ '^[0-9]{44}$'
  ),
  CONSTRAINT chk_fiir_referenced_item_sequence_positive CHECK (
    referenced_item_sequence IS NULL OR referenced_item_sequence > 0
  ),
  CONSTRAINT chk_fiir_quantity_positive CHECK (
    referenced_quantity IS NULL OR referenced_quantity > 0
  ),
  CONSTRAINT chk_fiir_value_positive CHECK (
    referenced_value IS NULL OR referenced_value > 0
  )
);

CREATE INDEX IF NOT EXISTS ix_fiir_item
  ON public.fiscal_invoice_item_references (fiscal_invoice_item_id);
CREATE INDEX IF NOT EXISTS ix_fiir_referenced_item
  ON public.fiscal_invoice_item_references (referenced_item_id)
  WHERE referenced_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_fiir_referenced_access_key
  ON public.fiscal_invoice_item_references (referenced_access_key)
  WHERE referenced_access_key IS NOT NULL;

GRANT SELECT, INSERT ON public.fiscal_invoice_item_references TO authenticated;
GRANT ALL ON public.fiscal_invoice_item_references TO service_role;
ALTER TABLE public.fiscal_invoice_item_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_invoice_item_references_read" ON public.fiscal_invoice_item_references;
CREATE POLICY "fiscal_invoice_item_references_read"
  ON public.fiscal_invoice_item_references FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador')
      OR public.has_role(auth.uid(),'gestor')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'administrativo'));

DROP POLICY IF EXISTS "fiscal_invoice_item_references_insert" ON public.fiscal_invoice_item_references;
CREATE POLICY "fiscal_invoice_item_references_insert"
  ON public.fiscal_invoice_item_references FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'administrador')
           OR public.has_role(auth.uid(),'financeiro'));

COMMENT ON TABLE public.fiscal_invoice_item_references IS
  'DFeReferenciado por item (SINIEF 49/2025) para recusa parcial e redução por item.';

-- ---------------------------------------------------------------------
-- 4. fiscal_stock_loss_contexts — contexto legal de perda de estoque
-- ---------------------------------------------------------------------
-- FK confirmada: public.lotes(id) — migration 20260314022647.
-- SEM FK inventada para movimentacao_id: nenhuma tabela canônica de
-- movimentação de estoque confirmada nas migrations. Coluna uuid livre.
CREATE TABLE IF NOT EXISTS public.fiscal_stock_loss_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_invoice_id uuid NOT NULL UNIQUE
    REFERENCES public.fiscal_invoices(id) ON DELETE CASCADE,
  legal_reason_category text NOT NULL,
  legal_reason_details text NOT NULL,
  lote_id uuid NULL REFERENCES public.lotes(id) ON DELETE SET NULL,
  movimentacao_id uuid NULL,
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT chk_fslc_legal_reason_category CHECK (legal_reason_category IN (
    'LOSS','PERISHMENT','DETERIORATION','THEFT','ROBBERY'
  )),
  CONSTRAINT chk_fslc_legal_reason_details_not_blank CHECK (
    length(btrim(legal_reason_details)) > 0
  )
);

CREATE INDEX IF NOT EXISTS ix_fslc_lote
  ON public.fiscal_stock_loss_contexts (lote_id)
  WHERE lote_id IS NOT NULL;

GRANT SELECT, INSERT ON public.fiscal_stock_loss_contexts TO authenticated;
GRANT ALL ON public.fiscal_stock_loss_contexts TO service_role;
ALTER TABLE public.fiscal_stock_loss_contexts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fiscal_stock_loss_contexts_read" ON public.fiscal_stock_loss_contexts;
CREATE POLICY "fiscal_stock_loss_contexts_read"
  ON public.fiscal_stock_loss_contexts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador')
      OR public.has_role(auth.uid(),'gestor')
      OR public.has_role(auth.uid(),'financeiro')
      OR public.has_role(auth.uid(),'administrativo'));

DROP POLICY IF EXISTS "fiscal_stock_loss_contexts_insert" ON public.fiscal_stock_loss_contexts;
CREATE POLICY "fiscal_stock_loss_contexts_insert"
  ON public.fiscal_stock_loss_contexts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'administrador')
           OR public.has_role(auth.uid(),'financeiro'));

COMMENT ON TABLE public.fiscal_stock_loss_contexts IS
  'Contexto legal para NF-e de perda de estoque (SINIEF 49/2025 tpNFDebito=07).';

-- ---------------------------------------------------------------------
-- 5. fiscal_events — CHECK ampliado preservando valores existentes
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_events
  DROP CONSTRAINT IF EXISTS fiscal_events_event_type_check;

ALTER TABLE public.fiscal_events
  ADD CONSTRAINT fiscal_events_event_type_check CHECK (event_type IN (
    -- Valores originais (Fase 2 fundação) — preservados integralmente:
    'CREATED','MANUAL_UPDATED','DOCUMENT_ATTACHED','VALIDATION_REQUESTED',
    'VALIDATION_FAILED','READY_FOR_FUTURE_INTEGRATION',
    'RECONCILIATION_REQUIRED','RECONCILIATION_COMPLETED',
    'DOCUMENT_CANCELED_FINANCIAL_REVIEW_REQUIRED','TOTAL_MISMATCH',
    'CUSTOMER_MISMATCH','SOURCE_MISMATCH','REPLACEMENT_REQUIRED',
    -- Novos cenários SINIEF 49/2025 (aditivos):
    'SINIEF_ADVANCE_PAYMENT_ISSUED',
    'SINIEF_EFFECTIVE_SALE_ISSUED',
    'SINIEF_STOCK_LOSS_ISSUED',
    'SINIEF_VALUE_QUANTITY_REDUCTION_ISSUED',
    'SINIEF_DELIVERY_REFUSAL_TOTAL_ISSUED',
    'SINIEF_DELIVERY_REFUSAL_PARTIAL_ISSUED',
    'SINIEF_RECIPIENT_NOT_FOUND_ISSUED'
  ));

COMMIT;
