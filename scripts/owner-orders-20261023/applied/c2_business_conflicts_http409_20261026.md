# c2_business_conflicts_http409_20261026 — aplicado externamente pelo auditor (NÃO REAPLICAR)

Ref `swzpzcwiasxmjutrmvkm`. Somente `RAISE ... ERRCODE='40001'` → `'PT409'`; corpo restante, owner, ACL,
proconfig e SECURITY DEFINER validados na mesma transação (informado pelo auditor; não verificado pelo agente).

| Função | Ocorrências | md5 pré |
|---|---|---|
| `platform_private.c2_partner_lifecycle(uuid,uuid,text[],text,text,uuid,text)` | 2 | `588bb5b795e1f2c909622db8e34ea18b` |
| `platform_private.c2_promote_accounting_pending_order_core(uuid,timestamptz)` | 1 | `e9a3af7998001dda6f823aa3644af986` |
| `platform_private.c2p1_update_settings(uuid,jsonb,jsonb)` | 2 | `a2b8670b8d0754d93cf69f44c4b0a94d` |

md5 pós: não informado; capturar em LIVE READ ONLY antes de qualquer pacote futuro tocar essas funções.

## Clientes conciliados (frontend, sem publicação)
- `PartnerLifecycleFields.tsx`: PT409 (e 40001 legado) → conflito, botão bloqueado até atualizar; tentativa preservada.
- `useB2BFinanceiro.ts`: PT409 → `settings_conflict`; rascunho preservado, cache não adotado, sem retry.
- `usePromoteAccountingPendingOrder.ts`: PT409 → `stale` (mensagem de reabrir); bloqueio contábil `C2_ACCOUNTING_PENDING` tem precedência.

Preservados: handlers SMTP/catálogo/financeiro que tratam 40001 (outras funções, fora do lote) e 40001 real de serialização.

## Fontes inativas AINDA com 40001 nessas funções (NO-GO para instalar sem regenerar)
Rollback/candidate destes pacotes restauraria 40001 e não pode ser usado como está:
- `contracts-c2-20261022/{candidate,coordinated/candidate,integral/install}.sql.review`
- `owner-orders-20261023/p1-isolation/{core,candidate}.sql.review`, `baseline-p1/*` (snapshot pré, histórico — manter)
- `owner-orders-20261023/accounting-pending-request-20261024/{src/new-functions.sql,candidate.sql.review,overlay.diff}`
Regeneração exige novos hashes/manifestos (SHA256SUMS) — fase separada. Baselines históricos não são editados.

Inventário: 52 funções com 40001 antes deste lote; 49 restantes, revisão individual em fases próximas.
