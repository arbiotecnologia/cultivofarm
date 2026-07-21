# Fase Fiscal 2 — Snapshot prévio

**Data:** 2026-07-21
**Fonte:** consulta direta ao Postgres via `psql`.

## Contagens

- `fiscal_invoices`: **0** linhas
  - por `status`: (nenhuma)
  - por `invoice_type`: (nenhuma)
  - com/sem `receivable_id`: (nenhuma)
  - com/sem `access_key`: (nenhuma)
- `financial_documents`: **0** linhas
  - por `owner_type`: (nenhuma)
  - por `document_type`: (nenhuma)

## Integridade

- Órfãos `fiscal_invoices.receivable_id` sem AR: **0**
- Duplicidade `(invoice_number, series)`: **0**

## Estrutura pré-migração

`fiscal_invoices` possuía 16 colunas base. `financial_documents` possuía 13 colunas base. Ambas preservadas.

## Ambiente

- Enum `app_role` com 13 papéis.
- Função `public.has_role(uuid, app_role)` disponível.

## Conclusão

Base fiscal completamente limpa — migration aditiva aplicada sem risco a dados históricos.
