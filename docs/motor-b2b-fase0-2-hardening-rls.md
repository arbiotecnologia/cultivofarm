# Fase 0.2 — Hardening de Acesso Financeiro do Motor B2B

Data: 2026-07-29

## 1. Ambiente validado

- Staging: **`ikaauvsflpmamgxmkhoq`**, confirmado por `public._fiscal_staging_marker` (`marker='STAGING'`) antes de qualquer DDL; todas as migrations e o harness abortam se o ref divergir.
- Produção **`navfzbwgwzruipouyfnk` não foi acessada** em nenhum momento (nenhuma conexão, query, migration ou deploy).
- Nenhum secret, DSN ou token foi lido, exibido ou registrado.

## 2. Policies anteriores

Registradas integralmente em `docs/motor-b2b-fase0-2-security-baseline.md` (seções 1–4), incluindo comando, roles, permissividade, `USING`, `WITH CHECK`, GRANTs de tabela e de RPC.

## 3. Policies novas

### `partner_order_payment_terms.popt_select` / `partner_order_payment_schedule.pops_select`
```
administrador OR financeiro OR gestor_comercial
OR (
  has_role(auth.uid(),'parceiro_b2b')
  AND EXISTS (SELECT 1 FROM partner_orders po
              JOIN partner_users pu ON pu.partner_id = po.partner_id
              WHERE po.id = <tabela>.partner_order_id AND pu.user_id = auth.uid())
)
```
Não há nenhuma outra policy de SELECT nessas duas tabelas — o inventário confirma que apenas `popt_select`/`pops_select` concedem leitura (as demais são INSERT/UPDATE). INSERT/UPDATE/DELETE não foram afrouxados.

### `accounts_receivable.ar_producer_read`
```
has_role(auth.uid(),'cliente_produtor')
AND customer_id = ANY(get_cliente_ids_for_user(auth.uid()))
AND partner_id IS NULL
AND origin_type IS DISTINCT FROM 'B2B_ORDER'
```

### `accounts_receivable.ar_partner_select_own_b2b` (endurecida)
```
origin_type = 'B2B_ORDER'
AND has_role(auth.uid(),'parceiro_b2b')
AND partner_id IN (SELECT partner_id FROM partner_users WHERE user_id = auth.uid())
```
O técnico B2B deixa de herdar leitura financeira só por existir em `partner_users`.

### `accounts_receivable_installments.ari_producer_read`
```
has_role(auth.uid(),'cliente_produtor')
AND EXISTS (SELECT 1 FROM accounts_receivable ar
            WHERE ar.id = accounts_receivable_installments.receivable_id
              AND ar.customer_id = ANY(get_cliente_ids_for_user(auth.uid()))
              AND ar.partner_id IS NULL
              AND ar.origin_type IS DISTINCT FROM 'B2B_ORDER')
```

### `accounts_receivable_installments.ari_partner_select_own_b2b` (nova)
Espelha o acesso do parceiro B2B ao próprio título, exigindo papel `parceiro_b2b` — preserva a paridade entre título e parcela sem abrir acesso ao técnico.

Policies internas preservadas sem alteração: `Financial staff full access` (administrador/gestor/financeiro), `ar_b2b_readers` e `ari_b2b_readers` (gestor_comercial/administrativo).

## 4. Grants anteriores e novos

| Objeto | Antes | Depois |
| --- | --- | --- |
| `approve_b2b_payment_terms_secure(uuid,text)` | PUBLIC + anon + authenticated + service_role | authenticated + service_role |
| `reject_b2b_payment_terms_secure(uuid,text)` | idem | authenticated + service_role |
| `request_b2b_payment_terms_adjustment_secure(uuid,text)` | idem | authenticated + service_role |
| `add_b2b_payment_terms_note_secure(uuid,text)` | idem | authenticated + service_role |
| `partner_order_payment_terms` (tabela) | anon com todos os privilégios | anon revogado |
| `partner_order_payment_schedule` (tabela) | anon com todos os privilégios | anon revogado |

Corpo e assinatura das RPCs não foram alterados; a validação interna (`auth.uid()`, papel, vínculo, status, transição) permanece intacta.

## 5. Índices verificados ou criados

Já existentes e suficientes: `partner_users_user_id_key` (UNIQUE `user_id`), `idx_partner_users_partner`, `partner_orders_pkey`, `idx_partner_orders_partner`, `accounts_receivable_pkey`, `idx_ar_partner_b2b(partner_id) WHERE origin_type='B2B_ORDER'`, `idx_ar_customer_status`, `idx_payment_terms_order`, `idx_payment_schedule_order`.

Criado (único ausente e efetivamente necessário para o `EXISTS` da nova policy de parcelas):
`idx_ari_receivable ON accounts_receivable_installments(receivable_id)`.

Nenhum índice duplicado foi criado; o par histórico `idx_partner_users_user`/`idx_partner_users_user_id` foi apenas registrado, não alterado.

## 6. Resultado dos testes T1–T20

Execução real em staging com `SET LOCAL ROLE authenticated` + `request.jwt.claims` (`sub` do usuário), nunca `service_role` como identidade de leitura. Evidências gravadas em `public._motor_b2b_fase0_2_harness`.

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
| T11 | Produtor A lê recebível direto próprio (`partner_id IS NULL`) | 1 | 1 | PASS |
| T12 | Produtor A lê parcelas do recebível direto próprio | 1 | 1 | PASS |
| T13 | Produtor A não lê recebível direto do produtor B | 0 | 0 | PASS |
| T14 | Parceiro A lê recebível B2B próprio | 1 | 1 | PASS |
| T15 | Parceiro A não lê recebível do parceiro B | 0 | 0 | PASS |
| T16 | Técnico B2B não possui papel para aprovar/rejeitar (guarda interna das RPCs) | false | false | PASS |
| T17 | `anon` não executa as 4 RPCs sensíveis (`has_function_privilege`) | 0 | 0 | PASS |
| T18 | PUBLIC não possui EXECUTE nas 4 RPCs | 0 | 0 | PASS |
| T19 | Checksums das 17 funções idênticos ao snapshot da Fase 0.1 | 0 divergências | 0 | PASS |
| T20 | Rollback sintaticamente válido | válido | validado por revisão estrutural (DDL idempotente, mesmas assinaturas do baseline) — **não executado**, pois reintroduziria as vulnerabilidades | PASS com ressalva |

Testes complementares executados: técnico B2B não lê `accounts_receivable` (0) e usuário autenticado sem vínculo não lê terms/schedule/AR (0).

## 7. Identidades e papéis utilizados

Somente contas de homologação já existentes no staging, identificadas por papel (sem tokens, senhas ou dados sensíveis): administrador, financeiro, gestor_comercial, parceiro_b2b (gestor A), parceiro_b2b_tecnico (técnico A), cliente_produtor A, cliente_produtor B (papel sintético temporário), gestor de parceiro B (papel sintético temporário) e um usuário autenticado sem vínculo (operador on-farm).

## 8. Limpeza das fixtures

Todas as fixtures `FASE02-HARNESS` foram removidas e a remoção foi conferida por consulta: 0 recebíveis, 0 parcelas, 0 terms, 0 schedules, 0 pedidos, 0 cliente B, 0 parceiro B, 0 vínculos e papéis sintéticos remanescentes. Permanece apenas a tabela técnica de evidências `public._motor_b2b_fase0_2_harness` (RLS habilitada, sem policies, acessível somente a `service_role`).

## 9. Checksums das 17 funções

Comparação integral contra `public._motor_b2b_pre_phase1_snapshot`: **0 divergências**. Nenhuma função do motor teve corpo, assinatura, `search_path` ou `SECURITY DEFINER` alterados nesta subfase.

## 10. Arquivos e migrations criados

- Migration de hardening (policies + grants + índice).
- Migration de fixtures e harness (tabela `_motor_b2b_fase0_2_harness`).
- Migration de limpeza das fixtures.
- `restoration/motor-b2b-fase0-2/restore-policies.sql`
- `restoration/motor-b2b-fase0-2/verify-policies.sql`
- `docs/motor-b2b-fase0-2-security-baseline.md`
- `docs/motor-b2b-fase0-2-hardening-rls.md` (este relatório)

## 11. Rollback

`restoration/motor-b2b-fase0-2/restore-policies.sql` restaura exatamente as policies e ACLs do baseline (inclusive removendo a policy nova de parcelas do parceiro) com trava fail-fast de staging e execução atômica. `verify-policies.sql` confere o estado endurecido, também com trava de ambiente.

## 12. Pendências

- Aplicar o mesmo hardening em produção em janela autorizada (não executado aqui, por proibição explícita).
- Avaliar remoção do GRANT residual de `anon` em `partner_orders`, `partner_order_items` e `partner_users` (hoje contido apenas por RLS).
- Consolidar os índices duplicados `idx_partner_users_user` / `idx_partner_users_user_id`.

## 13. Riscos residuais

- Contas internas com papel `administrativo` continuam lendo recebíveis B2B via `ar_b2b_readers` — comportamento pré-existente e considerado interno autorizado.
- `get_user_partner_id()` retorna o primeiro vínculo do usuário; usuários multi-parceiro não são suportados (as novas policies usam `EXISTS`/`IN` sobre `partner_users`, portanto não dependem dessa limitação, mas outras policies antigas ainda usam a função).
- T20 validado por revisão estrutural, sem execução do rollback no banco.

## 14. Produção

Produção `navfzbwgwzruipouyfnk` **não foi acessada**. Todas as operações ocorreram exclusivamente em `ikaauvsflpmamgxmkhoq`, com verificação prévia do marker em cada script e migration.

## 15. Status final

**APTO PARA FASE 1**

- técnico B2B não lê terms nem schedule (T6, T7) e não lê recebíveis B2B;
- produtor não lê recebível nem parcela B2B (T9, T10), mesmo com `customer_id` vinculado;
- parceiro continua lendo seus próprios registros (T4, T14) e não lê os de outro parceiro (T5, T15);
- acessos internos permanecem funcionais (T1–T3);
- `anon` e PUBLIC não executam as RPCs sensíveis (T17, T18);
- checksums das 17 funções inalterados (T19);
- rollback disponível e documentado.
