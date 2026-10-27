# Levantamento de gravação direta — fluxo de pedido B2B (27/10/2026)

Status: somente leitura. Nenhum SQL aplicado, nenhuma publicação. Captura via catálogo do Supabase canônico `swzpzcwiasxmjutrmvkm`.

## Privilégios e políticas LIVE (authenticated)

| Tabela | INSERT/UPDATE/DELETE | Políticas de escrita | anon SELECT | Gatilhos |
|---|---|---|---|---|
| ordens_servico | sim | `Admin/Gestor total access` ALL PERMISSIVE para PUBLIC + `tenant_isolation_d51_5` RESTRICTIVE | sim | 18 |
| ordens_servico_onfarm | sim | idem + `d51_5_onfarm_tenant_guard` | sim | 12 |
| ordens_servico_onfarm_status_history | sim (grant) | só SELECT; escrita negada por falta de policy | sim | 0 |
| entregas | sim | `Admin/Gestor/Adm total access` ALL PUBLIC + tenant RESTRICTIVE | não | 10 |
| lotes | sim | `Admin/Gestor/Producao` ALL + OnFarm insert/update + tenant RESTRICTIVE | sim | 7 |
| accounts_receivable | sim | permissivas financeiras + `financial_rpc_only_*` RESTRICTIVE (já fechado) | sim | 9 |
| accounts_receivable_installments | sim | idem (já fechado) | sim | 5 |
| fiscal_invoices | sim | `fi_staff_insert/update/delete` PERMISSIVE + tenant RESTRICTIVE | sim | 11 |
| fiscal_invoice_items | sim | `fiscal_invoice_items_write` ALL PERMISSIVE, sem RESTRICTIVE de tenant | sim | 4 |

## Escritores diretos encontrados no código (fora de testes)

- `src/pages/OrdensServico.tsx:281`: INSERT em `ordens_servico`.
- `src/pages/Entregas.tsx:591, 628, 673`: UPDATE de status, cancelamento e rollback em `entregas`.
- `src/hooks/useFiscalDocuments.ts:247, 260`, `src/hooks/useFiscalReconciliation.ts:156, 195`, `src/pages/financeiro/NotasFiscais.tsx:39`: INSERT/UPDATE em `fiscal_invoices`.
- Edge harnesses `entrega-runtime-harness` e `fase-e-runtime-harness`: service_role, fixtures de teste; não são afetados por políticas de authenticated.
- `lotes`, `accounts_receivable*`: nenhum escritor direto no frontend.

## Bloqueio que impede o pacote de fechamento (Etapa 3)

As RPCs canônicas equivalentes estão contidas para `authenticated`: `rpc_entrega_confirmar_v1`, `rpc_entrega_cancelar_v1`, `rpc_cockpit_criar_entrega_v1` e `rpc_cockpit_confirmar_entrega_v1` (EXECUTE = false). Não existe RPC exposta para criar OS. Fechar a escrita direta agora quebraria a criação de OS e a mudança de status de entregas, e criar writers novos seria fluxo paralelo. Por isso, o pacote de bloqueio **não foi preparado**. Ele depende de uma decisão do proprietário: reabrir/revisar as RPCs canônicas de OS e entrega e migrar as telas para elas, antes do fechamento.

## Pode ser preparado sem quebrar telas

1. `lotes`: não há escritor direto no frontend. É candidato a bloqueio RESTRICTIVE, com a dependência de confirmar as RPCs de lote/CQ/envase (owner postgres) e a ausência de escrita pela UI OnFarm.
2. `fiscal_invoice_items`: não tem RESTRICTIVE de tenant (`fiscal_invoice_items_write` ALL). É um achado de prioridade, a revisar junto com o módulo fiscal (fora do escopo de edição atual).
3. Retirada do SELECT para `anon` em 8 das 9 tabelas: hoje nenhuma policy vale para anon, então a retirada é só de higiene. Ainda falta provar que nenhuma rota pública lê essas tabelas.

## Cobrança na entrega (Etapa 6, somente leitura)

`fn_generate_receivable_from_entrega(uuid,jsonb)` e `fn_mark_entrega_not_billable(uuid,text)` são SECURITY DEFINER, com EXECUTE para authenticated. O corpo ainda não foi revisado: falta conferir a categoria de receita global ativa, o método ativo sem fallback, o escopo A/B e a idempotência. **Não verificado.**

Contabilidade real e SU-518022 permanecem pendentes.

## Etapa 2 — Cobrança na entrega: leitura concluída (27/10/2026, somente leitura)

Hashes LIVE: `fn_generate_receivable_from_entrega(uuid,jsonb)` md5 `670ea34d37c4c4fd6612031ad763a3a7`; `fn_mark_entrega_not_billable(uuid,text)` md5 `e4008b029ce8d58f70f3fc88571d03be`. Ambas SECURITY DEFINER, `search_path=public`, EXECUTE para authenticated.

Achados (nenhum corrigido):
1. **Sem escopo de empresa (crítico):** `is_financial_staff` só verifica papel global; a entrega é lida por `id` sem comparar `organization_id` do ator. Financeiro A pode faturar ou marcar sem cobrança uma entrega de B, e o replay devolve o `receivable_id` de B.
2. **Categoria:** só exige existência; não exige `active=true` nem `type` de receita.
3. **Método de pagamento:** opcional e sem checagem de ativo; aceita NULL.
4. **Sem gate `cf_user_guards_v1`** nem revalidação após o advisory/row lock; `fn_mark_entrega_not_billable` não tem advisory e não checa `auth.uid()` nulo explicitamente.
5. **Parcelas:** `due_date`/`installment_number` não validados (nulos, duplicados, ordem, datas antes da emissão).
6. **Conflitos** saem como `check_violation`, não PT409.

Próximo passo: pacote candidato inativo em `scripts/delivery-billing-scope-20261027/` com escopo tenant, categoria RECEITA ativa, método ativo obrigatório, gate → advisory → lock → revalidação, PT409, pré/pós e testes PostgreSQL descartáveis. Não aplicado.
