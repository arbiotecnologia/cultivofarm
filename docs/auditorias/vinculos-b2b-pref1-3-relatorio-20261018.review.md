# PRÉ-F1.3 — Reconciliação de guards em homolog — Relatório de revisão — 2026-10-18

Ref canônico: `swzpzcwiasxmjutrmvkm` (produção, **intocada**). Homolog: `vrlcdwmlytukrjezrrnf`.
**Nenhum SQL executado por este agente. Nada publicado.**
Entrega: `docs/auditorias/vinculos-b2b-pref1-3-migracao-homolog-20261018.sql` (somente aditiva, para revisão e aplicação pelo auditor externo).

## 1. Fatos VERIFICADOS em produção (read-only, 2026-10-18)

### Funções `cf_user_guards_v1` (7, owner `postgres`, `search_path=''`)

| Função | Segurança | Papel |
|---|---|---|
| `acquire_gate()` | DEFINER | Gate STATEMENT; valida TG_RELID ∈ {profiles, user_roles, user_clientes, partner_users, auth.users}; exige `auth.uid()` para anon/authenticated; incrementa `state.revision` |
| `acquire_invitation_gate()` | DEFINER | Idem para `platform_org_admin_invites`, com `FOR UPDATE NOWAIT` |
| `block_truncate()` | INVOKER | Bloqueia TRUNCATE (PT409) |
| `touch_related_profiles()` | DEFINER | AFTER ROW; toca `profiles.updated_at` (user_roles, user_clientes, partner_users) |
| `touch_invitation_profiles()` | DEFINER | Idem para invites |
| `advance_stamp()` | INVOKER | BEFORE UPDATE em profiles; `updated_at` monotônico |
| `require_admin()` | DEFINER | AFTER STATEMENT em profiles/user_roles; bloqueia remover o último admin ativo (PT409) |

**Grants verificados:** somente `postgres` tem EXECUTE em todas as 7; `anon`, `authenticated` e `service_role` **não** executam. `state(singleton bool NOT NULL, revision bigint NOT NULL)`.

### Triggers de guard em produção (pg_trigger, não internos)

| Tabela | Triggers cf_user_guards_v1 |
|---|---|
| `profiles` | `a00_cf_user_gate`, `a00_cf_user_no_truncate`, `z99_cf_profile_stamp`, `z99_cf_require_admin` |
| `user_roles` | `a00_cf_user_gate`, `a00_cf_user_no_truncate`, `z90_cf_touch_profile`, `z99_cf_require_admin` |
| `user_clientes` | `a00_cf_user_gate`, `a00_cf_user_no_truncate`, `z90_cf_touch_profile` |
| `platform_org_admin_invites` | `a00_cf_invitation_gate`, `a00_cf_invitation_no_truncate`, `z90_cf_invitation_profile_stamp` |
| `partner_users` | 3 triggers — **já replicados em homolog pela PRÉ-F1.2** |

Produção tem ainda guards de aplicação fora do schema cf (`guard_profile_senha_*`, `guard_profile_sensitive_fields`, `h15_profile_organization_guard`, `guard_profile_tenant_fields`, `enforce_cliente_id_for_produtor`, `sync_user_cliente_principal`, `guard_superadmin_role_assignment`, `update_updated_at_column`). **Não verificado se existem em homolog** — ver seção 3 (achado A2).

## 2. Conteúdo da migration PRÉ-F1.3 (preparada, NÃO executada)

- **P0 preflight fail-closed:** exige PRÉ-F1.2 presente (schema/state/3 funções com flags corretas), 4 tabelas alvo existentes, `auth.uid()` disponível, e **aborta** se qualquer trigger/função a criar já existir (sem duplicidade, sem conflito).
- **P1:** cria as 4 funções ausentes (`acquire_invitation_gate`, `advance_stamp`, `require_admin`, `touch_invitation_profiles`) com corpos **verbatim** de produção, mesma segurança (DEFINER/INVOKER, `search_path=''`), REVOKE de PUBLIC/anon/authenticated/service_role (REVOKEs condicionados à existência das roles — correção já validada na PRÉ-F1.2).
- **P2:** cria os 14 triggers com nomes/timing/eventos idênticos à produção.
- **P3:** validação pós-criação na mesma transação (15 triggers cf no total, incluindo os 3 de `partner_users`).
- **Smokes S1–S5** transacionais documentados no rodapé; **rollback completo** sem CASCADE, preservando PRÉ-F1.2/F1 e dados.

## 3. Achados e blockers

- **A1 (informativo):** escopo coberto — as 4 tabelas recebem exatamente os guards cf de produção. `partner_users` já está coberta.
- **A2 (BLOCKER para RLS A/B, não para a migration):** os guards de aplicação fora do schema cf (listados na seção 1) **não foram verificados em homolog** — este agente não tem acesso ao homolog. Se estiverem ausentes, a paridade de segurança continua incompleta mesmo após PRÉ-F1.3. **Ação:** auditor externo deve rodar em homolog a consulta de `pg_trigger` da seção 1 e comparar; diferenças viram PRÉ-F1.4.
- **A3 (limitação declarada):** smokes S1–S5 rodam com role privilegiada. Proteção **cross-tenant** e invalidação de **cache de autorização** (lease 15s) **não são reproduzíveis** via SQL privilegiado — exigem sessões reais anon/authenticated (Admin A/B). **Nenhum PASS de login real é afirmado.** Esse teste segue como pré-requisito de F2 (plano F2, itens B3/B5).
- **A4 (concorrência):** `acquire_invitation_gate` usa `FOR UPDATE NOWAIT` — sob concorrência pode falhar com `55P03`; comportamento idêntico ao de produção (verbatim), registrado para os testes de concorrência da F2.
- **A5 (pendência conhecida, inalterada):** produção tem 1 vínculo com parceiro sem tenant (P1) e homolog tem 279 vs 286 tabelas — paridade total não atestada; F2 permanece **BLOQUEADA**.

## 4. Critérios de aceite da PRÉ-F1.3 (para o auditor externo)

1. P0 aborta limpo se executado fora de ordem ou em base divergente (testar reexecução — deve falhar em P0.4/P0.5, provando idempotência por recusa).
2. Aplicação única em homolog → P3 PASS (17 triggers).
3. Smokes S1–S3 e S5 sem exception + ROLLBACK; 0 linhas persistidas.
4. Comparativo `pg_trigger` pós-aplicação: homolog = produção para as 5 tabelas (schema cf).
5. Verificar achado A2; se houver guards de aplicação faltantes, abrir PRÉ-F1.4 **antes** de qualquer teste A/B.

## 5. Recomendações

1. Aplicar PRÉ-F1.3 em homolog somente após revisão deste relatório.
2. Resolver A2 (inventário dos guards de aplicação em homolog) na sequência — sem isso, o teste A/B de RLS não é representativo.
3. Manter F2 bloqueada até: PRÉ-F1.3 + A2 + teste A/B com sessões reais + P1 (parceiro sem tenant) + gate de tenant do plano F2.
4. Nenhuma execução em produção neste checkpoint.
