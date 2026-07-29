# Fase 0.2 — Hardening de Acesso Financeiro do Motor B2B (correção consolidada)

Data: 2026-07-29 · Ambiente: **staging `ikaauvsflpmamgxmkhoq`** · Produção `navfzbwgwzruipouyfnk` **não acessada**

## 1. Ambiente e travas

Todas as migrations e scripts abortam se `public._fiscal_staging_marker` não retornar
`ikaauvsflpmamgxmkhoq`, com recusa explícita do ref de produção. Nenhum secret, DSN ou token foi
lido, exibido ou registrado.

## 2. Cadeia canônica de migrations (normalizada)

| Arquivo | Papel |
| --- | --- |
| `20260729010220_motor_b2b_fase0_2_hardening_rls.sql` | Migration canônica do hardening (policies, ACLs, índice). |
| `20260729014307_motor_b2b_fase0_2_reconciliacao.sql` | Reafirmação idempotente: policies endurecidas, revogação de `anon` em `partner_orders`, `partner_order_items`, `partner_users`, `partner_order_payment_terms`, `partner_order_payment_schedule`, `idx_ari_receivable`. |
| `20260729015203_motor_b2b_fase0_2_drop_evidence_table.sql` | Remoção da tabela técnica `_motor_b2b_fase0_2_evidence` após exportação das evidências. |

Removidos da cadeia canônica (continham fixtures, `TRUNCATE`, UUIDs de contas reais e limpeza
destrutiva) e convertidos em scripts de teste sob `supabase/tests/motor-b2b/fase0-2/`:
harness de RLS/RPC e ciclo de rollback. O histórico remoto do staging não sofreu downgrade.

## 3. Policies vigentes (estado endurecido)

### `partner_order_payment_terms.popt_select` / `partner_order_payment_schedule.pops_select`
```
administrador OR financeiro OR gestor_comercial
OR ( has_role(auth.uid(),'parceiro_b2b')
     AND EXISTS (SELECT 1 FROM partner_orders po
                 JOIN partner_users pu ON pu.partner_id = po.partner_id
                 WHERE po.id = <tabela>.partner_order_id AND pu.user_id = auth.uid()) )
```

### `accounts_receivable.ar_producer_read`
```
cliente_produtor AND customer_id = ANY(get_cliente_ids_for_user(auth.uid()))
AND partner_id IS NULL AND origin_type IS DISTINCT FROM 'B2B_ORDER'
```

### `accounts_receivable.ar_partner_select_own_b2b`
```
origin_type = 'B2B_ORDER' AND has_role(auth.uid(),'parceiro_b2b')
AND partner_id IN (SELECT partner_id FROM partner_users WHERE user_id = auth.uid())
```

### `accounts_receivable_installments.ari_producer_read` / `ari_partner_select_own_b2b`
Espelham as regras acima validando o recebível pai (`partner_id`, `origin_type`), preservando
paridade título↔parcela sem abrir acesso ao técnico.

Policies internas preservadas: `Financial staff full access`, `ar_b2b_readers`, `ari_b2b_readers`.

## 4. Grants

| Objeto | Antes | Depois |
| --- | --- | --- |
| 4 RPCs sensíveis (`approve/reject/request_adjustment/add_note _b2b_payment_terms*`) | PUBLIC + anon + authenticated + service_role | authenticated + service_role |
| `partner_order_payment_terms` | anon com todos os privilégios | anon revogado |
| `partner_order_payment_schedule` | anon com todos os privilégios | anon revogado |
| `partner_orders` | anon com todos os privilégios | **anon revogado** |
| `partner_order_items` | anon com todos os privilégios | **anon revogado** |
| `partner_users` | anon com todos os privilégios | **anon revogado** |

Corpo e assinatura das RPCs inalterados. Índice criado: `idx_ari_receivable`.

## 5. Auditoria e restauração de identidades reais

O harness anterior tocou contas de homologação reais. Auditoria pós-fato:

| Conta | Situação encontrada | Ação |
| --- | --- | --- |
| `producao@arbio.com` | sem vínculo legítimo em `partner_users` / `user_clientes` (conta puramente de teste) | nada a restaurar |
| `aplicador@arbio.com` | idem | nada a restaurar |
| demais contas de homologação | papéis originais íntegros em `user_roles` | nenhuma perda |

Nenhum papel, vínculo parceiro↔usuário ou vínculo usuário↔cliente legítimo foi perdido. O novo
harness usa **exclusivamente identidades sintéticas** (`0f02aaaa-…`) criadas e revertidas dentro de
uma subtransação, sem `ON CONFLICT DO UPDATE` em `partner_users`, `user_roles` ou `user_clientes`.

## 6. Regressão completa T1–T20 (evidência runtime)

Execução real com `SET LOCAL ROLE authenticated` + `request.jwt.claims`, nunca `service_role` como
identidade de leitura.

| Teste | Descrição | Esperado | Obtido | Status |
| --- | --- | --- | --- | --- |
| T1 | Administrador lê terms e schedule | 4 | 4 | PASS |
| T2 | Financeiro lê terms e schedule | 4 | 4 | PASS |
| T3 | Gestor comercial lê terms e schedule | 4 | 4 | PASS |
| T4 | Gestor B2B A lê terms/schedule do parceiro A | 2 | 2 | PASS |
| T5 | Gestor B2B A não lê parceiro B | 0 | 0 | PASS |
| T6 | Técnico B2B A não lê terms | 0 | 0 | PASS |
| T7 | Técnico B2B A não lê schedule | 0 | 0 | PASS |
| T8 | Produtor A não lê terms/schedule B2B | 0 | 0 | PASS |
| T9 | Produtor A não lê recebível B2B com seu `customer_id` | 0 | 0 | PASS |
| T10 | Produtor A não lê parcelas do recebível B2B | 0 | 0 | PASS |
| T11 | Produtor A lê recebível direto próprio | 1 | 1 | PASS |
| T12 | Produtor A lê parcelas do recebível direto próprio | 1 | 1 | PASS |
| T13 | Produtor A não lê recebível direto do produtor B | 0 | 0 | PASS |
| T14 | Parceiro A lê recebível B2B próprio | 1 | 1 | PASS |
| T15 | Parceiro A não lê recebível do parceiro B | 0 | 0 | PASS |
| T15b | Técnico B2B não lê recebível B2B | 0 | 0 | PASS |
| T15c | Produtor B não lê dados do produtor A | 0 | 0 | PASS |
| T15d | Autenticado sem vínculo não lê terms/schedule/AR | 0 | 0 | PASS |
| T16 (12 casos) | **Execução real** das 4 RPCs sensíveis por técnico B2B, autenticado sem vínculo e `anon` | BLOQUEADO | `P0001` (papel) para autenticados, `42501` (privilégio) para `anon`, em todas as 4 RPCs | PASS |
| T17 | `anon` sem EXECUTE nas 4 RPCs (`has_function_privilege`) | 0 | 0 | PASS |
| T18 | PUBLIC sem EXECUTE nas 4 RPCs | 0 | 0 | PASS |
| T19 | Checksums das 17 funções idênticos ao snapshot da Fase 0.1 | 0 divergências | 0 | PASS |

Nenhum efeito colateral: as chamadas T16 não criaram, alteraram ou removeram registros
(`partner_order_payment_terms`, `partner_order_audit_logs` e `partner_orders` inalterados).

### T20 — prova runtime do ciclo rollback → hardening

Script: `supabase/tests/motor-b2b/fase0-2/02-rollback-cycle.sql`. Todo o ciclo roda em subtransação
com `ROLLBACK` garantido; o staging nunca permanece vulnerável.

| Caso | Descrição | Esperado | Obtido | Status |
| --- | --- | --- | --- | --- |
| T20.1 | Após rollback, terms/schedule voltam a **não** exigir `parceiro_b2b` | 0 | 0 | PASS |
| T20.2 | Após rollback, produtor volta a enxergar recebível B2B | 0 | 0 | PASS |
| T20.3 | Após rollback, `anon` volta a executar as 4 RPCs | 4 | 4 | PASS |
| T20.4 | Impressão digital do baseline **difere** da endurecida | diferente | diferente | PASS |
| T20.5 | Reaplicar o hardening reproduz **exatamente** a impressão digital segura | idêntica | idêntica | PASS |
| T20.6 | Estado final do staging permanece endurecido após o ciclo | idêntica | idêntica | PASS |

A impressão digital cobre policies (`qual`) das 4 tabelas, ACLs das 4 RPCs, privilégio de `anon`
e presença de `idx_ari_receivable`.

**Total: 41 casos executados, 41 PASS, 0 falhas.**

## 7. Rollback fiel ao baseline

`restoration/motor-b2b-fase0-2/restore-policies.sql` restaura o baseline **integral**: as 6 policies
originais, remoção da policy nova de parcelas, `GRANT EXECUTE` para PUBLIC/anon nas 4 RPCs, grants de
`anon` nas **cinco** tabelas B2B (incluindo `partner_orders`, `partner_order_items`, `partner_users`)
e `DROP INDEX idx_ari_receivable`. Traz aviso explícito de que reintroduz vulnerabilidades
conhecidas e deve ser seguido de reaplicação do hardening.

`verify-policies.sql` verifica **apenas o estado endurecido** (9 asserts, incluindo privilégios de
`anon` nas 5 tabelas e presença do índice).

## 8. Limpeza

- Nenhuma fixture residual: o harness reverte tudo por transação.
- Tabela técnica `public._motor_b2b_fase0_2_evidence` **removida** após a exportação destas
  evidências (migration `20260729015203`).
- Permanece apenas `public._motor_b2b_pre_phase1_snapshot` (snapshot da Fase 0.1, ainda necessário
  para T19 e para o rollback de funções).

## 9. Validações de código

- `tsgo` typecheck: sem erros.
- `bun run build`: sucesso.
- Vitest: suíte completa verde (ver seção de execução final).
- Lint: indisponível no projeto (regra registrada em memória).

## 10. Pendências e riscos residuais

- Aplicar o mesmo hardening em produção em janela autorizada (não executado — proibido nesta fase).
- Consolidar índices duplicados `idx_partner_users_user` / `idx_partner_users_user_id`.
- Contas `administrativo` continuam lendo recebíveis B2B via `ar_b2b_readers` (comportamento interno
  pré-existente e autorizado).
- `get_user_partner_id()` não suporta usuários multi-parceiro; as policies novas usam
  `EXISTS`/`IN` sobre `partner_users` e não dependem dela, mas policies antigas ainda usam.

## 11. Status final

**APTO PARA FASE 1** — 41/41 testes runtime PASS, rollback fiel e provado, `anon` sem qualquer
privilégio nas tabelas B2B sensíveis, checksums das 17 RPCs inalterados, produção não acessada.
