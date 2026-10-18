# Fase F1 — Fundação aditiva de `partner_users` — 2026-10-18 (APLICADA EM HOMOLOG, PRODUÇÃO INTOCADA) — REVISÃO PÓS-AUDITORIA EXTERNA

Ref canônico: `swzpzcwiasxmjutrmvkm` (produção, **NÃO tocada**). Homolog: `vrlcdwmlytukrjezrrnf`.
**Produção sem qualquer DDL/DML. Nada publicado.**
"Verificado" = observado via SELECT read-only nesta rodada; "Hospedado" = executado pelo auditor externo em homolog e reportado com evidência; "Pendente" = aguarda execução/aprovação.

> **REGISTRO DE HOSPEDAGEM 2026-10-18 (auditor externo, homolog `vrlcdwmlytukrjezrrnf`):**
> Migrations aplicadas com `success: true`, nesta ordem:
> 1. `cultivofarm_pref1_partner_owner_homolog_only_20261018` — coluna `commercial_owner_organization_id uuid NULL` (1 parceiro sem owner, intencional).
> 2. `cultivofarm_pref12_guards_partner_users_homolog_20261018` — schema/state `cf_user_guards_v1` + 3 guards reais e triggers.
> 3. `cultivofarm_f1_partner_users_additive_homolog_20261018` — F1 aditiva (6 colunas novas, 2 triggers).
>
> **Testes T1–T6 executados em homolog** (blocos DO transacionais de
> `vinculos-b2b-f1-testes-20261018.sql`): cada chamada concluiu **sem exception**
> e com **ROLLBACK** — nenhum dado persistido. Auditoria pós-testes confirmou:
> - `partner_users` segue com **0 linhas** (base homolog sem vínculos);
> - **5 triggers** presentes: `a00_cf_user_gate`, `a00_cf_user_no_truncate`,
>   `a10_partner_users_derive_tenant`, `a20_partner_users_bump_version`, `z90_cf_touch_profile`;
> - constraints `revocation_coherence`, `validity_window`, `version_positive` ativas;
> - `UNIQUE(user_id)` **preservada**;
> - índices `idx_partner_users_tenant_id` e `idx_partner_users_active` presentes;
> - **0 vínculos órfãos**.
>
> **Limites desta evidência (não extrapolar):**
> - T1–T6 foram executados com role privilegiada em blocos DO — **NÃO** são prova de
>   RLS em sessões reais de usuários (Admin A/B, parceiro, produtor). Teste A/B de
>   RLS **não realizado** e segue **obrigatório** antes de qualquer cutover.
> - Homolog continua sem espelhar produção: **279 vs 286 tabelas**, 0 vs 2 vínculos,
>   e **sem guards em `profiles`/`user_roles`/`user_clientes`** (produção tem).
> - Homologação global **não declarada**; F2 (mudanças em policies) permanece
>   **BLOQUEADA** até paridade de segurança e teste A/B.

> **REVISÃO 2026-10-18 (auditoria externa):** homolog NÃO possui
> `partner_accounts.commercial_owner_organization_id` — a F1 v1 falharia em
> homolog. Criada a fase **PRÉ-F1** (`vinculos-b2b-pref1-paridade-homolog-20261018.sql`)
> e o relatório de paridade (`vinculos-b2b-pref1-paridade-20261018.review.md`).
> A migration F1 ganhou preflight de esquema (passo 0) e os testes foram
> reescritos (v2): sintaxe PL/pgSQL válida, fixtures transacionais próprias,
> FAIL explícito, zero SKIP. Ordem obrigatória: PRÉ-F1 → F1 → T1–T7 em homolog.
> Paridade total homolog×produção (279 vs 286 tabelas) **não homologada**.

## 1. Entregas (arquivos criados, nada aplicado)

| Arquivo | Conteúdo |
|---|---|
| `docs/auditorias/vinculos-b2b-f1-migracao-20261018.sql` | Migration F1 aditiva/reversível + bloco de rollback |
| `docs/auditorias/vinculos-b2b-f1-testes-20261018.sql` | 7 testes SQL transacionais (BEGIN/ROLLBACK) + 1 pré-checagem read-only |
| `docs/auditorias/vinculos-b2b-f1-relatorio-20261018.review.md` | Este relatório |

## 2. Evidências read-only coletadas nesta fase (VERIFICADO)

- `partner_users`: colunas `id, partner_id, user_id, created_at, papel`; 2 vínculos, 2 usuários distintos, 0 excedentes por usuário.
- `partner_accounts.commercial_owner_organization_id`: **NULLABLE**; **1 dos 2 vínculos aponta para parceiro SEM tenant**.
- Triggers existentes em `partner_users` (corpos lidos):
  - `a00_cf_user_gate` → `cf_user_guards_v1.acquire_gate()` (BEFORE STATEMENT; valida TG_RELID, exige `auth.uid()` para anon/authenticated, incrementa `state.revision`).
  - `a00_cf_user_no_truncate` → `block_truncate()`.
  - `z90_cf_touch_profile` → `touch_related_profiles()` (AFTER ROW; toca `profiles.updated_at` do user_id afetado).
  - **Compatibilidade confirmada:** nenhum dos três referencia colunas de `partner_users`; colunas aditivas não os afetam. `acquire_gate` é STATEMENT-level e segue valendo para INSERT/UPDATE/DELETE após F1.
- Snapshot de auditoria `cf_audit_users_20260922.partner_users` existe com triggers próprios — F1 **não** toca esse schema.

## 3. Decisões de desenho F1 (e por quê)

1. **`tenant_id` NULLABLE nesta fase** — o backfill obrigatório falharia hoje (1 vínculo com parceiro sem tenant). Trigger `partner_users_derive_tenant()` deriva do parceiro, rejeita divergência (`tenant_mismatch`, fail-closed) e aceita NULL apenas quando o próprio parceiro não tem tenant. **PENDÊNCIA P1 (NO-GO do Cutover):** regularizar o parceiro sem `commercial_owner_organization_id`.
2. **`UNIQUE(user_id)` preservado** — cutover é portão unidirecional (fase 5 do plano); F1 não promove múltiplos vínculos nem transfere carteira.
3. **Helpers/policies atuais intactos** — `get_user_partner_id()`/`get_partner_papel()` e as 29 policies seguem como estão; fail-closed e migração por par ficam para a fase Guards.
4. **Histórico append-only ADIADO para a fase Guards** — criar tabela de histórico agora seria estrutura sem consumidor e sem política fechada validada; revogação ainda não existe como operação. O modelo temporal (`valid_from`/`revoked_at`) já fica pronto na própria tabela.
5. **Checks imutáveis (sem `now()`)**: coerência de revogação (os 3 campos juntos ou nenhum; motivo não vazio) e janela `revoked_at >= valid_from`.
6. **`version` + trigger de incremento** — base do CAS otimista das RPCs de gestão da fase Guards.
7. **Funções de trigger SECURITY DEFINER com `search_path=''` e EXECUTE revogado de PUBLIC/anon/authenticated** — seguem o padrão dos guards existentes.
8. **Índices aditivos**: `idx_partner_users_tenant_id` e índice parcial `idx_partner_users_active (user_id, partner_id) WHERE revoked_at IS NULL` (prepara a unicidade parcial do Cutover sem criá-la).

## 4. Reversibilidade

Rollback completo documentado no rodapé da migration (DROP de triggers/funções/índices/constraints/colunas). **Seguro** porque F1 não remove nem altera nada pré-existente; dados pré-F1 são preservados. Diferente do Cutover, aqui o rollback é undo trivial.

## 5. Testes SQL (arquivo dedicado; execução PENDENTE de homologação)

- **T1** INSERT deriva tenant do parceiro; defaults `valid_from`/`version=1`.
- **T2** tenant divergente rejeitado (fail-closed).
- **T3** revogação incompleta rejeitada; revogação completa aceita; janela inválida rejeitada.
- **T4** `version` incrementa em UPDATE.
- **T5** compatibilidade com `acquire_gate` (revision incrementa) e guards existentes.
- **T6** backfill idempotente, 0 divergências.
- **T7** pré-checagem read-only de prontidão do Cutover (parceiros sem tenant; vínculos excedentes).

Todos transacionais (BEGIN/ROLLBACK) — não persistem dados. **Não executados nesta rodada**: exigem a migration aplicada (homolog) e role privilegiada; aplicar em produção está fora da autorização desta fase.

## 6. Evidências de integridade do repositório

Nenhum código TypeScript/React foi alterado nesta fase (somente arquivos SQL/documentação em `docs/auditorias/`). Typecheck e suíte de testes executados nesta rodada — resultados na seção 8.

## 7. Critérios PASS / NO-GO para liberar F2 (Guards)

**PASS exige TODOS:**
1. Migration F1 revisada e aprovada pelo proprietário.
2. Aplicação em homolog `vrlcdwmlytukrjezrrnf` + T1–T6 PASS com saída registrada (prova hospedada).
3. Aplicação em produção aprovada e executada com T7 read-only antes/depois (0 divergências).
4. PENDÊNCIA P1 (parceiro sem tenant) com dono e prazo definidos.

**NO-GO (bloqueia F2):**
- Qualquer falha de T1–T6 em homolog.
- Recusa de aprovação da migration em produção.
- Descoberta de consumidor de `partner_users` não inventariado na F0 que quebre com as colunas novas (risco avaliado como baixo: colunas aditivas com defaults).

## 8. Resultados verificáveis desta rodada

- Read-only produção: seções 2 acima (3 consultas executadas, resultados transcritos).
- Typecheck / testes / lint: ver bloco final do relatório de chat (executados após escrita deste arquivo; repo sem alterações de código).
- **Não verificado / pendente:** execução dos testes T1–T6 (depende de aplicação em homolog), prova hospedada, aprovação da migration. Homolog **não** espelha produção (279 vs 286 tabelas, 0 vínculos) — paridade não atestada; T1–T6 têm SKIP explícito quando a base não tem parceiro com tenant.

## 9. Próximos passos propostos (aguardando autorização)

1. Revisão/aprovação da migration F1 pelo proprietário.
2. Aplicação em homolog + execução T1–T6 (prova hospedada) — requer autorização explícita.
3. Tratar PENDÊNCIA P1 (parceiro sem tenant em produção).
4. Só então abrir F2 (Guards): helpers fail-closed, RPCs de revogação/criação com CAS, histórico append-only com RLS fechada, migração das 29 policies.
