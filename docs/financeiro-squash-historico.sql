-- =====================================================================
-- SQUASH MANUAL — Remoção de resíduos legados em financial_audit_log
-- =====================================================================
--
-- Uso: este script NÃO é uma migration Lovable. É um patch para ser
-- aplicado manualmente no histórico de migrations quando for possível
-- reescrever o histórico (ex.: ambiente novo, fork, ou squash externo).
--
-- Substitua, IN PLACE, os blocos legados nos três arquivos abaixo pelos
-- blocos canônicos correspondentes. Os arquivos atuais aplicados em
-- produção já foram normalizados em runtime por 20260626173413_*.sql
-- e travados pela guarda 20260626193347_*.sql.
--
-- Schema oficial de financial_audit_log:
--   (entity_type, entity_id, action, old_data, new_data, performed_by, reason)
--
-- Colunas proibidas: event_type, details, user_id, payload
-- =====================================================================


-- ---------------------------------------------------------------------
-- ARQUIVO: supabase/migrations/20260521142254_*.sql
-- ---------------------------------------------------------------------

-- Linhas 395-397  (issue_financial_receipt)
INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
VALUES ('financial_receipts', v_id, 'FINANCIAL_RECEIPT_ISSUED',
        jsonb_build_object('receipt_number', v_number, 'payment_id', _payment_id),
        auth.uid());

-- Linhas 421-423  (cancel_financial_receipt)
INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
VALUES ('financial_receipts', _receipt_id, 'FINANCIAL_RECEIPT_CANCELED',
        jsonb_build_object('reason', _reason),
        auth.uid());

-- Linhas 438-440  (log_report_export)
INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
VALUES ('financial_report_exports', v_id, 'FINANCIAL_REPORT_EXPORTED',
        jsonb_build_object('report_type', _report_type, 'format', _format, 'status', _status),
        auth.uid());


-- ---------------------------------------------------------------------
-- ARQUIVO: supabase/migrations/20260521143433_*.sql
-- ---------------------------------------------------------------------

-- Linhas 107-109  (issue_financial_receipt v2)
INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
VALUES ('financial_receipts', v_receipt_id, 'FINANCIAL_RECEIPT_ISSUED',
        jsonb_build_object('payment_id', _payment_id, 'amount', v_payment.amount_received),
        auth.uid());

-- Linhas 133-135  (cancel_financial_receipt v2)
INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
VALUES ('financial_receipts', _receipt_id, 'FINANCIAL_RECEIPT_CANCELED',
        jsonb_build_object('reason', _reason),
        auth.uid());

-- Linhas 287-290  (register_financial_report_export)
INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
VALUES ('financial_report_exports', v_id, 'FINANCIAL_REPORT_EXPORTED',
        jsonb_build_object('report_type', p_report_type, 'format', p_file_format,
                           'title', p_report_title, 'status', p_status),
        auth.uid());

-- Linhas 300-302  (log_report_view) — gerar entity_id sintético
INSERT INTO financial_audit_log(entity_type, entity_id, action, new_data, performed_by)
VALUES ('financial_report', gen_random_uuid(), 'FINANCIAL_REPORT_VIEWED',
        jsonb_build_object('report_type', p_report_type, 'filters', p_filters),
        auth.uid());


-- ---------------------------------------------------------------------
-- ARQUIVO: supabase/migrations/20260613181329_*.sql
-- ---------------------------------------------------------------------

-- Linhas 182-184  (rpc_desvincular_etiqueta_entrega)
INSERT INTO public.financial_audit_log(entity_type, entity_id, action, performed_by, new_data)
VALUES ('produto_etiqueta', p_etiqueta_id, 'LABEL_DELIVERY_UNLINKED', v_uid,
        jsonb_build_object('entrega_id', p_entrega_id, 'motivo', p_motivo));


-- =====================================================================
-- VALIDAÇÃO PÓS-SQUASH
-- =====================================================================
-- 1. rg -n "financial_audit_log\(event_type" supabase/migrations/
-- 2. rg -n "financial_audit_log\([^)]*\b(details|user_id|payload)\b" supabase/migrations/
-- 3. supabase db reset  (deve subir sem erro)
-- 4. bunx vitest run src/lib/financial src/test/integration/financeiro.estorno.test.ts
--
-- Resultados esperados: zero ocorrências (1, 2), reset OK (3), 12/12 verdes (4).
-- Após isso, atualize docs/financeiro-auditoria.md e docs/financeiro-aceite-final.md
-- de "APTO COM RESSALVA" para "APTO".
-- =====================================================================
