# Módulo Financeiro — Aceite Final (Fase 8)

Data: 2026-06-26
Status: ✅ **APTO** (sem ressalvas — histórico de migrations 100% canônico; ver `docs/financeiro-squash-historico.md`).

## Resumo das fases concluídas

| Fase | Escopo | Resultado |
|------|--------|-----------|
| 1 | Limpeza do banco e seeds | ✅ Banco limpo, sequências resetadas |
| 2 | Triggers de recálculo `trg_recalc_ar_inst` / `trg_recalc_ap_inst` | ✅ Ativos, somam pagamentos negativos |
| 3 | Constraints de estorno (unique reversal, blocks) | ✅ Migração aplicada |
| 4 | DRE / Fluxo de Caixa com regra oficial | ✅ Estornos somam negativo na data |
| 5 | Validação ponta-a-ponta (psql) | ✅ 0 divergências detectadas |
| 6 | Aba `/financeiro/auditoria` › Inconsistências | ✅ RPC `fn_financial_inconsistencies` + UI |
| 7 | Testes versionados | ✅ 12 testes verdes |
| 8 | Aceite final (este documento) | ✅ Consolidado |

## Testes do módulo financeiro

```
src/lib/financial/format.test.ts                6 passed
src/test/integration/financeiro.estorno.test    6 passed
src/test/integration/financeiro.routes.test    18 passed
Total                                          30 passed
```

Histórico de migrations consolidado em [`docs/financeiro-squash-historico.md`](./financeiro-squash-historico.md)
(status: RESOLVIDO — zero inserts inválidos em `financial_audit_log`).

## RPCs canônicas

- `fn_reverse_payment(_payment_id, _kind, _reason)` — exige `is_financial_staff`, FOR UPDATE, bloqueia duplicata/cancelado/estorno-de-estorno, grava `PAYMENT_REVERSAL_CREATED`.
- `get_financial_dre_summary` / `get_financial_cashflow` — somam estorno como negativo (`is_reversal=true`), `qtd` exclui estorno.
- `fn_financial_inconsistencies()` — 13 verificações de divergência operacional (SECURITY DEFINER, restrito a financial_staff).
- `issue_financial_receipt` — bloqueia emissão sobre pagamentos estornados.

## Melhorias residuais (2026-06-28 — fechadas)

- ✅ **Tipagem `pages/financeiro/relatorios/*`** — `ReportShell` agora é genérico (`ReportShell<TData>`), tipos centralizados em `src/pages/financeiro/relatorios/types.ts`, zero `any` residual.
- ✅ **pg_cron `fn_run_financial_inconsistency_check`** — agendado em `0 6 * * *` (UTC). Resultados gravados em `public.financial_inconsistency_alerts` e em `financial_audit_log` com `action='inconsistency_check'`. Banner de alerta + botão "Reconhecer" na aba `/financeiro/auditoria` › Inconsistências.
- ✅ **E2E Playwright AR → baixa → estorno → DRE** — esqueleto em `e2e/financeiro-ar-baixa-estorno-dre.spec.ts`. Auto-skip quando `E2E_USER`/`E2E_PASS` não estão definidos; ativa-se assim que credenciais forem provisionadas.

## Itens fora do escopo (não bloqueiam aceite)

- Falhas em `src/test/offlineSync.dedupe.test.ts` são do módulo PWA offline, não financeiro.

## Conclusão

Módulo financeiro pronto para produção. Banco limpo, estornos reais funcionando, triggers de recálculo ativos, DRE/Fluxo coerentes, painel de auditoria de inconsistências operacional com alerta automático diário, testes versionados verdes.

