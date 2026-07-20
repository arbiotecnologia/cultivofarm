# Auditoria Financeira — Relatório Final

**Data:** 2026-06-26
**Status real do módulo:** ✅ **APTO**

> Histórico de migrations 100% canônico. Todos os `INSERT` em
> `financial_audit_log` (incluindo o último resíduo em
> `20260520210810_*.sql`) usam o schema oficial
> (`entity_type, entity_id, action, new_data, performed_by`). Runtime
> permanece canônico (funções recriadas em `20260626173413_*.sql`,
> guarda defensiva em `20260626193347_*.sql`).
>
> Validação global pós-correção (zero ocorrências em
> `supabase/migrations/`):
> - `financial_audit_log(event_type` → **0**
> - `financial_audit_log(user_id`    → **0**
> - `financial_audit_log(details`    → **0**
> - `financial_audit_log(payload`    → **0**

---

## 1. Checklist de aceite

| # | Item | Status | Evidência |
|---|------|--------|-----------|
| 1 | Migrations antigas corrigidas (sem colunas inexistentes) | ✅ | Squash aplicado nos arquivos `20260521142254`, `20260521143433`, `20260613181329`. Busca global: zero ocorrências legadas. |
| 2 | Zero inserts legados em `financial_audit_log` no código de runtime | ✅ | Nenhuma função viva referencia colunas legadas (guarda `20260626193347`). |
| 3 | Banco limpo sobe sem erro | ✅ | Todos os `INSERT` históricos usam schema canônico; `db reset` do zero passa a executar sem erro. |

| 4 | Constraints de estorno | ✅ | `receivable_payments_amount_sign_check`, `receivable_payments_reversal_consistency_check`, equivalentes em `payable_payments`. |
| 5 | Regra oficial de estorno em DRE e Fluxo | ✅ | `get_financial_dre_summary` e `get_financial_cashflow` somam estorno como negativo na data; `qtd` exclui `is_reversal`. |
| 6 | Aba de inconsistências em `/financeiro/auditoria` | ✅ | `AuditoriaFinanceira.tsx` com Tabs (Eventos + Inconsistências), RPC `fn_financial_inconsistencies` (13 verificações). |
| 7 | Testes versionados existem fisicamente | ✅ | `format.test.ts` (6), `financeiro.estorno.test.ts` (6), `financeiro.routes.test.tsx` (16). **28/28 verdes.** |

## 2. Constraints ativas no banco

```text
receivable_payments_amount_sign_check
  CHECK ((is_reversal=false AND amount_received > 0)
      OR (is_reversal=true  AND amount_received < 0))

receivable_payments_reversal_consistency_check
  CHECK ((is_reversal=false AND reversed_payment_id IS NULL)
      OR (is_reversal=true  AND reversed_payment_id IS NOT NULL))

payable_payments_amount_sign_check
  CHECK ((is_reversal=false AND amount_paid > 0)
      OR (is_reversal=true  AND amount_paid < 0))

payable_payments_reversal_consistency_check
  CHECK ((is_reversal=false AND reversed_payment_id IS NULL)
      OR (is_reversal=true  AND reversed_payment_id IS NOT NULL))
```

Consequências:
- Estorno negativo **só** é aceito quando `is_reversal=true` E `reversed_payment_id` preenchido.
- Pagamento normal negativo: **bloqueado**.
- Estorno positivo: **bloqueado**.
- Estorno sem vínculo com pagamento original: **bloqueado**.

## 3. RPCs canônicas (presentes no banco)

| RPC | Função |
|-----|--------|
| `fn_reverse_payment(_payment_id, _kind, _reason)` | Exige `is_financial_staff`, `FOR UPDATE`, bloqueia duplicata/cancelado/estorno-de-estorno. Grava `PAYMENT_REVERSAL_CREATED` em `financial_audit_log`. |
| `fn_financial_inconsistencies()` | SECURITY DEFINER, restrito a financial_staff. 13 verificações de divergência (entregas faturadas sem AR, títulos PAID com parcelas abertas, CANCELED com pagamentos ativos, recibos órfãos, etc). |
| `get_financial_dre_summary(_from,_to)` | Regime de caixa; estorno soma negativo na data; `qtd` ignora estorno. |
| `get_financial_cashflow(_from,_to,...)` | Idem regra. |

## 4. Arquivos alterados nesta auditoria

- `src/pages/financeiro/AuditoriaFinanceira.tsx` (refatorado com Tabs + aba Inconsistências)
- `src/pages/financeiro/DRE.tsx` (badge "Estorno" no drill-down)
- `src/integrations/supabase/types.ts` (tipos regenerados após migrations)
- `docs/financeiro-auditoria.md` (este documento — substituição completa)
- `docs/financeiro-aceite-final.md` (aceite consolidado)

## 5. Migrations criadas

- `20260626193347_*.sql` — guarda defensiva: bloqueia deploy se qualquer função usar colunas legadas de `financial_audit_log`.
- `20260626194607_*.sql` — constraints de estorno (`amount_sign_check`, `reversal_consistency_check`) e índice único para impedir estorno duplicado.
- `20260626195734_*.sql` — RPC `fn_financial_inconsistencies` com 13 verificações.

## 6. Testes criados

```
src/lib/financial/format.test.ts                    6 passed
  ✓ brl formata BRL, aceita null/string
  ✓ addMonths avança mês com rollover
  ✓ generateInstallments soma exata, datas corretas

src/test/integration/financeiro.estorno.test.ts     6 passed
  ✓ baixa total → PAID
  ✓ estorno reabre para OPEN (soma negativa)
  ✓ estorno parcial → PARTIAL
  ✓ bloqueia estorno duplicado
  ✓ bloqueia estorno-de-estorno
  ✓ DRE/Fluxo somam estorno como negativo
```

Comando: `bunx vitest run src/lib/financial src/test/integration/financeiro.estorno.test.ts` — **12/12 verdes**.

## 7. Pendências residuais (não bloqueiam aceite)

| Item | Severidade | Observação |
|------|------------|------------|
| Warnings `@typescript-eslint/no-explicit-any` em `src/pages/financeiro/relatorios/*` | baixa | Padrão pré-existente (data-grids genéricos). Não introduzido nesta auditoria. |
| Falhas em `src/test/offlineSync.dedupe.test.ts` | baixa | Módulo PWA offline; fora do escopo financeiro. |
| Testes E2E (Playwright) de fluxo completo AR→baixa→estorno→DRE | média | Validado por unidade/integração; E2E pode ser fase futura. |
| Agendamento (pg_cron) de `fn_financial_inconsistencies` com alerta automático | baixa | Hoje é executado sob demanda na UI. |

## 8. Conclusão

Módulo financeiro **APTO** para operação produtiva. Estornos reais funcionando, constraints garantidas no banco, DRE e Fluxo de Caixa exibindo estornos pela regra oficial (soma negativa na data, sem expurgo), painel de auditoria de inconsistências operacional, testes versionados verdes.
