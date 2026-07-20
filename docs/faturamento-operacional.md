# Faturamento Operacional — Entrega → Contas a Receber

## Fluxo oficial

```
Entrega confirmada (status = entregue, financial_status = PENDING_BILLING)
  → RPC public.fn_generate_receivable_from_entrega(_entrega_id, _payload)
      → accounts_receivable (origin_type = DELIVERY, status = OPEN)
      → accounts_receivable_installments (status = OPEN)
      → fiscal_invoice_status = PENDING | NOT_REQUIRED
      → entregas.financial_status = BILLED, receivable_id, billing_generated_at/by
      → financial_audit_log (action = DELIVERY_BILLED)
  → (opcional) NF-e emitida em fiscal_invoices
  → Baixa de parcelas via receivable_payments
  → Recibo (financial_receipts)
```

## Permissões

Apenas usuários com papel `administrador`, `gestor` ou `financeiro` (helper `is_financial_staff`) podem executar a RPC. Demais papéis (`cliente_produtor`, `consultor_tecnico`, `tecnico_agronomo`, `producao`, `operador_onfarm`, `aplicador`, `administrativo`) recebem erro `insufficient_privilege`.

## Validações da RPC

- Sessão autenticada (`auth.uid()` não-nulo).
- Entrega existe, lock `FOR UPDATE`.
- `receivable_id IS NULL` (sem duplicidade — também protegido pelo índice `ux_ar_one_per_delivery`).
- `status = 'entregue'` e diferente de `cancelada`.
- `cliente_id` presente.
- `total_amount > 0`.
- `category_id` existente em `financial_categories`.
- `installment_count` entre 1 e 36.
- Parcelas customizadas: tamanho = `installment_count` e `|soma − total| ≤ 0,01`.

## Estratégia de parcelas

O trigger `trg_ar_gen_installments` gera parcelas padrão automaticamente após o INSERT do título. Quando o payload traz `installments`, a RPC apaga e re-insere as parcelas customizadas **dentro da mesma transação**, antes de qualquer leitura externa, com `status = 'OPEN'`.

## Auditoria

`financial_audit_log` recebe registro com:
- `entity_type = 'entregas'`
- `entity_id = _entrega_id`
- `action = 'DELIVERY_BILLED'`
- `old_data`: `{ receivable_id, financial_status }` anteriores.
- `new_data`: `{ receivable_id, total_amount, installment_count, fiscal_invoice_required, payment_method_id, origem: 'entrega' }`.
- `performed_by = auth.uid()`.

A função usa **apenas colunas existentes** — não há `user_id`, `event_type` ou `details`.

## Marcar entrega como sem cobrança

`public.fn_mark_entrega_not_billable(_entrega_id, _reason)`:
- Requer `is_financial_staff`.
- Requer motivo não vazio.
- Bloqueia se entrega já tiver `receivable_id`.
- Atualiza `financial_status = 'NOT_BILLABLE'` e registra `action = 'MARK_NOT_BILLABLE'` na auditoria.

## Status válidos

- `accounts_receivable.status`: `OPEN | PARTIAL | PAID | CANCELED | OVERDUE`.
- `accounts_receivable_installments.status`: `OPEN | PARTIAL | PAID | CANCELED | OVERDUE`. **Nunca usar `PENDING`.**
- `accounts_receivable.fiscal_invoice_status`: `NOT_REQUIRED | PENDING | ISSUED | CANCELED`.
- `entregas.financial_status`: `PENDING_BILLING | BILLED | NOT_BILLABLE`.

## Frontend

- `src/components/financeiro/ConfirmarEntregaFinanceiroDialog.tsx` é o único caminho de faturamento.
- O frontend **não** insere em `accounts_receivable` nem altera `financial_status` para `BILLED` — somente a RPC faz.
- `fiscal_invoices` só é inserido pelo cliente quando `fiscal_invoice_required = true`.
- Após sucesso são invalidadas as queries: `entregas`, `entregas-nao-faturadas`, `ar-list`, `financeiro-dashboard`, `fluxo-caixa`, `dre`.

## Fase 2 — Documentos, NF-e e Auditoria padronizados

### `financial_documents` (constraints expandidas)

- `owner_type` aceita: `RECEIVABLE`, `PAYABLE`, `DELIVERY`, `FISCAL_INVOICE`, `PAYMENT_RECEIVABLE`, `PAYMENT_PAYABLE`, `FINANCIAL_RECEIPT`, `REPORT_EXPORT`.
- `document_type` aceita ambos os padrões (PT/EN) por compatibilidade retroativa: `COMPROVANTE | RECEIPT`, `BOLETO`, `DANFE`, `XML_NFE | XML`, `RECIBO`, `CONTRATO | CONTRACT`, `OUTRO | OTHER`, `INVOICE`.
- Exclusão sempre **lógica** via `deleted_at`, `deleted_by`, `delete_reason`. Frontend nunca faz `DELETE`.
- Bucket `financial-docs` permanece privado; downloads via `createSignedUrl`.

### Auditoria — colunas oficiais

Todas as funções financeiras gravam em `financial_audit_log` apenas com:
`entity_type`, `entity_id`, `action`, `old_data`, `new_data`, `performed_by`, `reason`.

Colunas proibidas (não existem no schema): `event_type`, `details`, `user_id`.

Ações padronizadas:

| Ação                          | Origem                                    |
|-------------------------------|-------------------------------------------|
| `DELIVERY_BILLED`             | `fn_generate_receivable_from_entrega`     |
| `MARK_NOT_BILLABLE`           | `fn_mark_entrega_not_billable`            |
| `FINANCIAL_RECEIPT_ISSUED`    | `issue_financial_receipt`                 |
| `FINANCIAL_RECEIPT_CANCELED`  | `cancel_financial_receipt`                |
| `FINANCIAL_REPORT_EXPORTED`   | `log_report_export` / `register_financial_report_export` |
| `FINANCIAL_REPORT_VIEWED`     | `log_report_view`                         |
| `PAYMENT_REVERSAL_CREATED`    | `fn_reverse_payment`                      |
| `FISCAL_INVOICE_CREATED`      | `rpc_upsert_fiscal_invoice_manual`        |
| `FISCAL_INVOICE_UPDATED`      | `rpc_upsert_fiscal_invoice_manual`        |
| `FISCAL_STATUS_UPDATED`       | trigger `fn_audit_fiscal_status`          |

### NF-e manual — `rpc_upsert_fiscal_invoice_manual(p_receivable_id, p_payload)`

- Requer `is_financial_staff`; sessão obrigatória.
- Valida existência do contas a receber.
- `INSERT` quando não existe, `UPDATE` quando existe — sempre preenche `created_by`.
- Espelha `fiscal_invoice_status`, `fiscal_invoice_number`, `fiscal_access_key`, `fiscal_issue_date` em `accounts_receivable`.
- Status válidos: `PENDING`, `ISSUED`, `CANCELED`, `ERROR`.
- Retorna `{ invoice_id, status }`.
- `FiscalTab.tsx` usa exclusivamente esta RPC.

### Permissões resumidas

- **Documentos / NF-e / Recibos internos**: `is_financial_staff` (`administrador`, `gestor`, `financeiro`); `administrativo` apenas para leitura via política `Staff can view non-deleted documents`.
- **Cliente produtor**: vê documentos de `RECEIVABLE`, notas fiscais e recibos apenas dos próprios títulos (RLS por `customer_id` via `get_cliente_ids_for_user`).
- **Consultor / produção / operador on-farm / aplicador**: sem acesso a documentos fiscais/financeiros internos.

## Fase 3.1 — Criação manual de títulos e centralização fiscal

### `rpc_create_financial_title(p_kind text, p_payload jsonb)`

- `SECURITY DEFINER`, `search_path=public`, requer `is_financial_staff`.
- `p_kind`: `receivable` ou `payable`.
- Validações: descrição, categoria existente, `total_amount > 0`, `first_due_date`, `installment_count ∈ [1,36]`, soma das parcelas customizadas com tolerância 0,01.
- Cria o título e, quando `installments` é enviado, substitui as parcelas geradas pelo trigger **dentro da própria transação** (não há mais DELETE direto no frontend).
- Auditoria: `AR_MANUAL_CREATED` / `AP_MANUAL_CREATED` + `FINANCIAL_INSTALLMENTS_CUSTOMIZED` quando aplicável.
- Retorno: `{ success, kind, title_id, installment_count, total_amount }`.
- `GRANT EXECUTE ... TO authenticated` (revogado de PUBLIC).
- Frontend: `NovaContaDialog.tsx` usa apenas esta RPC; não há mais `insert`/`delete` direto em `accounts_*` e `accounts_*_installments`.

### Faturamento de entregas com NF-e

- `ConfirmarEntregaFinanceiroDialog.tsx` chama `fn_generate_receivable_from_entrega` e, quando `fiscal_invoice_required = true`, encadeia `rpc_upsert_fiscal_invoice_manual` com `delivery_id` no payload.
- Não há mais `supabase.from('fiscal_invoices').insert(...)` no frontend.
- A RPC fiscal agora aceita `p_payload->>'delivery_id'` e persiste em `fiscal_invoices.delivery_id`.

## Indicador de comprovante de entrega (Fase Entregas 1.1)

A tela **Entregas não faturadas** passa a exibir o status do comprovante de recebimento (badge por linha) e um atalho para a validação pública (`/validar-entrega/{token}`). Nesta fase o indicador é **apenas informativo**: o faturamento continua liberado mesmo sem recebimento confirmado. Bloqueio de faturamento por ausência de comprovante poderá ser introduzido em fase futura.

## Portal Executivo (Fase 13.2)
O Portal Executivo (`/executivo`) apenas **consulta indicadores financeiros agregados** (via RPCs `rpc_executivo_financeiro_*`) e navega para os módulos operacionais.
Não altera o fluxo de faturamento — `fn_generate_receivable_from_entrega`, baixas, estornos, fiscal e recibos permanecem exclusivos dos módulos operacionais.

## Portal Executivo (consulta)
O Portal Executivo (`/executivo`, aba **Financeiro**) consome agregados das tabelas financeiras via RPCs `rpc_executivo_financeiro_*`. É **somente leitura**: não executa baixas, faturamento, emissão fiscal nem recibos. As ações financeiras continuam exclusivamente nos módulos operacionais `/financeiro/*`.
