# Módulo Notas Fiscais — Escopo e Controles

Atualizado: 2026-07-21
Status: documentação (sem mudança de código/regra).

## Natureza do módulo

O módulo **Notas Fiscais** (`/financeiro/notas-fiscais`, `src/pages/financeiro/NotasFiscais.tsx`) é um **registro/acompanhamento fiscal** vinculado ao Contas a Receber — **não é um emissor SEFAZ**. Por isso não existe botão "Nova nota fiscal" na tela: cada NF nasce a partir de um título de AR (faturamento de entrega ou criação manual do AR).

## Como uma NF entra no sistema

1. **A partir de uma entrega faturada** — `ConfirmarEntregaFinanceiroDialog.tsx` chama:
   - `fn_generate_receivable_from_entrega` (cria o AR e o registro fiscal com `PENDING` ou `NOT_REQUIRED`);
   - quando `fiscal_invoice_required = true`, encadeia `rpc_upsert_fiscal_invoice_manual` já com `delivery_id` no payload.
2. **A partir de um AR existente** — aba **Fiscal** do detalhe do AR (`src/components/financeiro/FiscalTab.tsx`) usa `rpc_upsert_fiscal_invoice_manual` para criar/atualizar a NF ligada ao título.

Ambos os caminhos gravam em `public.fiscal_invoices` e espelham `fiscal_invoice_status`, `fiscal_invoice_number`, `fiscal_access_key` e `fiscal_issue_date` em `public.accounts_receivable`.

## Controles disponíveis na tela `/financeiro/notas-fiscais`

- **Filtrar** por status: `ALL | PENDING | ISSUED | CANCELED | ERROR`.
- **Abrir** uma NF (Sheet lateral) para editar:
  - Número
  - Série
  - Chave de acesso (44 dígitos)
  - Data de emissão
  - Status (`PENDING | ISSUED | CANCELED | ERROR`)
- **Anexar / baixar** documentos fiscais (XML e DANFE) via `DocumentosPanel` — bucket privado `financial-docs` com URLs assinadas; exclusão é lógica (`deleted_at`).

As edições são gravadas no `onBlur` de cada campo (mutação em `fiscal_invoices`). Auditoria automática pelo trigger `fn_audit_fiscal_status` (`FISCAL_STATUS_UPDATED`) e pelas ações `FISCAL_INVOICE_CREATED` / `FISCAL_INVOICE_UPDATED` (via RPC canônica).

## Permissões

- **Leitura/edição**: `is_financial_staff` (`administrador`, `gestor`, `financeiro`); `administrativo` somente leitura.
- **Cliente produtor**: vê apenas NFs dos próprios títulos (RLS por `customer_id`).
- Demais papéis: sem acesso.

## Onde ficam os botões de criação

| Necessidade | Caminho na UI |
|---|---|
| Registrar NF de uma entrega já confirmada | `/financeiro/entregas-nao-faturadas` → **Faturar** → marcar "NF obrigatória" |
| Registrar NF avulsa em um AR existente | `/financeiro/contas-a-receber` → abrir título → aba **Fiscal** → **Salvar dados fiscais** |
| Anexar XML/DANFE recebido do contador | `/financeiro/notas-fiscais` → **Abrir** → seção **Anexos** |

## Fora de escopo (não implementado)

- Emissão eletrônica (SEFAZ / NF-e via provedor tipo Focus NFe, PlugNotas, eNotas).
- NF-e sem título de AR associado (`fiscal_invoices.receivable_id` é obrigatório).
- Cancelamento/inutilização junto à SEFAZ (o status `CANCELED` aqui é apenas informativo).

Essas capacidades exigiriam nova migration, secret de provedor e edge function — não estão previstas neste módulo hoje.
