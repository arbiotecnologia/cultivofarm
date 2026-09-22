# Fase S1 — Núcleo de dados SaaS

- Data: 2026-09-22
- Banco canônico: `swzpzcwiasxmjutrmvkm`
- Gate anterior: `docs/auditorias/gate-s0-s1-seguranca-binding-2026-09-22.md` (PASS, commit `3eaa198d`)
- Escopo: **somente o núcleo de dados**. Sem entitlement engine, sem overrides, sem contadores de uso, sem Superadmin, sem "Meu Plano", sem billing, sem gates de menu/rota, sem migração de módulos de negócio.
- Conclusão: **PASS** para liberar S2.

---

## 1) Auditoria prévia — o que já existia

| Verificação | Resultado |
|---|---|
| Tabelas `saas_*` | **inexistentes** |
| Tabelas com `subscription` no nome | apenas `push_subscriptions` (Web Push — conceito distinto) |
| Tabelas com `plan` no nome | `commercial_payment_plans`, `commercial_payment_plan_assignments`, `production_planning*` — condições de pagamento B2B e planejamento de produção, **não** planos SaaS |
| Entitlements / módulos / features | **inexistentes** |
| `organizations` | existe (`id`, `nome`, `partner_account_id`, `ativo`, timestamps); 1 linha: `CultivoFarm` |
| Reaproveitados | `public.organizations`, `public.has_role(uuid, app_role)`, `public.update_updated_at_column()`, padrão `*_no_mutation` do módulo Comunicação |

Nenhum objeto equivalente foi duplicado; nenhum fluxo paralelo foi criado.

---

## 2) Migration aplicada

`supabase/migrations/20260922154526_3c081c07-9ce8-4f78-8355-a660aef594b4.sql` — transacional (`BEGIN`/`COMMIT`), idempotente (`IF NOT EXISTS` / `ON CONFLICT` / guardas em `pg_policy`, `pg_trigger`, `pg_type`) e com bloco de validação final fail-closed (`FASE_S1_VALIDACAO_FALHOU`).

### Primeira tentativa — FAIL controlado (evidência)

A primeira aplicação foi **abortada pela própria validação**, com o erro exato:

```
ERROR:  P0001: FASE_S1_VALIDACAO_FALHOU: anon possui grant em tabela saas;
authenticated possui grant de escrita em tabela saas;
```

Causa: o projeto possui *default privileges* no schema `public` que concedem privilégios amplos a `anon`/`authenticated` em tabelas novas — os `GRANT SELECT` explícitos não removiam o que já vinha herdado. Correção: `REVOKE ALL ON public.<tabela> FROM PUBLIC, anon, authenticated;` **antes** de cada `GRANT`. A transação inteira foi revertida; nenhum objeto parcial permaneceu. A segunda aplicação passou na validação.

### Objetos criados

**Tipo**: `public.saas_subscription_status` = `TRIAL | ACTIVE | PAST_DUE | SUSPENDED | CANCELLED | EXPIRED`.

| Tabela | Colunas-chave |
|---|---|
| `saas_modules` | `id`, `key` (unique, formato validado), `name`, `description`, `active`, timestamps |
| `saas_features` | `id`, `module_id` → `saas_modules` (RESTRICT), `key` (unique), `name`, `description`, `active`, timestamps |
| `saas_plans` | `id`, `key` (unique), `name`, `description`, `active`, `is_default`, timestamps |
| `saas_plan_features` | PK composta `(plan_id, feature_id)`, ambos RESTRICT; `enabled`, `limit_value numeric NULL`, `config jsonb NULL`, timestamps |
| `organization_subscriptions` | `id`, `organization_id` → `organizations` (RESTRICT), `plan_id` → `saas_plans` (RESTRICT), `status` (enum), `billing_cycle` (check, sem gateway), `started_at`, `trial_ends_at`, `current_period_start/end`, `cancel_at`, `cancelled_at`, `suspended_at`, `created_by`, timestamps |
| `organization_subscription_history` | `id`, `subscription_id` (RESTRICT), `organization_id` (RESTRICT), `actor_user_id`, `source` (check), `reason`, `old_values jsonb`, `new_values jsonb`, `created_at` |

`limit_value` como `numeric` (e não `integer`): cobre limites inteiros (usuários, pedidos) e fracionários (GB de armazenamento, percentuais) sem exigir nova migration; `NULL` = plano não define limite. Check `>= 0`.

**Funções/triggers** (todas `SECURITY DEFINER`, `search_path` fixo, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`):

- `saas_subscription_history_no_mutation()` — `BEFORE UPDATE OR DELETE` no histórico ⇒ append-only para **qualquer** papel, inclusive `service_role`.
- `saas_subscription_no_delete()` — `BEFORE DELETE` em `organization_subscriptions` ⇒ ciclo de vida só por `status`, sem exclusão.
- `saas_subscription_audit()` — `AFTER INSERT OR UPDATE` ⇒ grava `old_values`/`new_values`, `actor_user_id = auth.uid()`, `source = 'trigger'`; UPDATE sem mudança efetiva não gera linha.
- `update_updated_at_column()` (existente) reaproveitada em 5 tabelas.

---

## 3) RLS e grants

- RLS habilitado nas **6** tabelas.
- `anon`: **nenhum grant** (verificado na validação da migration e por sonda).
- `authenticated`: **apenas `SELECT`**, e a única policy é `saas_admin_read` — `FOR SELECT TO authenticated USING (has_role((select auth.uid()), 'administrador'))`. Justificativa: nesta fase não há consumo por usuário final; a leitura administrativa é necessária apenas para inspeção/ferramental interno. Usuário comum enxerga **zero linhas** (fail-closed).
- **Nenhuma policy de INSERT/UPDATE/DELETE** em nenhuma das 6 tabelas ⇒ escrita somente por `service_role` ou rotina `SECURITY DEFINER` futura. Nenhuma RPC pública de mutação foi criada nesta fase.
- `organization_id` nunca é aceito do cliente: não existe caminho de escrita a partir do frontend.

---

## 4) Sondas comportamentais (transacionais, sem persistência)

Executadas no banco canônico dentro de blocos `DO` finalizados com `RAISE EXCEPTION`, o que **reverte tudo**. Saída literal:

```
P1 historico_apos_insert=1; P2 historico_apos_update=2; P3 OK(unique_violation);
P4 OK(terminal permitida); P5 OK(update bloqueado); P6 OK(delete bloqueado);
P7 OK(delete bloqueado); P8 OK(enum rejeitou); P9 OK(fk rejeitou);
P10 OK(default unico); P11 OK(fk modulo rejeitou); P12 OK(restrict); P13 OK(check);
```

| Sonda | Cenário | Resultado |
|---|---|---|
| P1/P2 | Histórico gravado automaticamente no INSERT e no UPDATE | 1 → 2 linhas |
| P3 | Segunda assinatura corrente na mesma organização | rejeitada (`unique_violation`) |
| P4 | Assinatura terminal (`CANCELLED`) coexistindo | permitida, como projetado |
| P5/P6 | UPDATE / DELETE no histórico | bloqueados (`insufficient_privilege`) |
| P7 | DELETE de assinatura | bloqueado |
| P8 | `status = 'FOO'` | rejeitado pelo enum |
| P9 | `plan_id` inexistente | rejeitado por FK |
| P10 | Segundo plano padrão ativo | rejeitado pelo índice único |
| P11 | Feature com `module_id` inexistente | rejeitada por FK |
| P12 | Excluir plano em uso | bloqueado (RESTRICT) |
| P13 | `SUSPENDED` sem `suspended_at` | rejeitado pelo check |

RLS e leitura cruzada:

```
subs=0; hist=0; plans=1; modules=0; features=0; plan_features=0;
ANON OK(sem privilegio); AUTH_sem_uid plans_visiveis=0; AUTH_sem_uid subs_visiveis=0;
AUTH OK(insert sem privilegio);
admin=t nao_admin=t; admin_ve_subs=1; admin_ve_plans=1;
nao_admin_ve_subs=0; nao_admin_ve_hist=0;
```

A sonda de leitura cruzada criou uma segunda organização (`ORG_PROBE_B`) com assinatura própria dentro da transação revertida: o usuário **não administrador** enxergou 0 assinaturas e 0 linhas de histórico; o administrador enxergou as linhas. Nenhum registro permaneceu (`subs=0`, `hist=0` na verificação final).

---

## 5) Seed aplicado

Apenas **um** registro: plano `base` ("Plano Base"), `active = true`, `is_default = true`, `ON CONFLICT (key) DO NOTHING`.

- **Nenhum** módulo, feature ou vínculo plano↔feature foi criado ⇒ nada pode ser bloqueado por construção.
- **Nenhuma** assinatura foi criada — a validação da migration falha se `organization_subscriptions` não estiver vazia. Justificativa: sem entitlement engine, uma assinatura não é lida por nada; sua ausência é o estado mais neutro e evita criar um registro cujo ciclo de vida (datas, período, autoria) ainda não tem dono definido. Ela será criada na fase que introduzir o resolvedor de permissão efetiva.

**Dados operacionais alterados: nenhum.** A única escrita foi a linha de catálogo `saas_plans('base')`, em tabela nova.

---

## 6) Advisors / linter

| Tipo | Antes (pós-gate) | Depois |
|---|---|---|
| RLS enabled, no policy (INFO) | 16 | 16 |
| anon pode executar SECURITY DEFINER (WARN) | 2 | 2 |
| signed-in pode executar SECURITY DEFINER (WARN) | 464 | 464 |
| Leaked password protection disabled (WARN) | 1 | 1 |
| **Total** | **483** | **483** |

Nenhum achado novo. As 6 tabelas novas não aparecem em "RLS sem policy" porque cada uma tem a policy de leitura administrativa; as 3 funções de trigger não aparecem nas listas de `SECURITY DEFINER` executáveis porque têm `EXECUTE` revogado de `PUBLIC`/`anon`/`authenticated`.

---

## 7) Testes, typecheck e build

- Nova suíte `src/test/saas/fase-s1-core-saas.test.ts` (21 testes): estrutura das 6 tabelas, transacionalidade e validação fail-closed, RLS/`REVOKE`/grants, ausência de policy de escrita e de grant a `anon`, unicidade do plano padrão, unicidade da assinatura corrente, enum com os 6 status, checks de ciclo de vida e de jsonb, 7 FKs RESTRICT e ausência de `ON DELETE CASCADE`, índices, append-only, triggers `SECURITY DEFINER` com `search_path` e `EXECUTE` revogado, seed neutro, e barreiras de escopo (nada de `organization_feature_overrides`, `saas_usage_counters`, `get_my_entitlements`, nenhum `organization_id` adicionado a tabela de negócio, **nenhum arquivo de frontend referenciando as tabelas novas**).
- Testes de congelamento de migrations das Fases 28A/28B/28C atualizados com a migration desta fase na lista de exceções conhecidas, com justificativa em comentário. Nenhum teste removido ou enfraquecido.

Exits reais registrados na seção 9.

---

## 8) Rollback

A migration é reversível por script inverso, na ordem: `DROP TRIGGER`s → `DROP FUNCTION` das 3 rotinas → `DROP TABLE public.organization_subscription_history`, `organization_subscriptions`, `saas_plan_features`, `saas_features`, `saas_plans`, `saas_modules` → `DROP TYPE public.saas_subscription_status`. Como nenhuma tabela de negócio referencia os objetos novos e nenhum código de aplicação os consome, a remoção é isolada e não afeta fluxo existente. Enquanto isso, a própria transação da migration já garante o rollback automático em falha (comprovado pela primeira tentativa).

---

## 9) Resultados de verificação (exits reais)

```
vitest run (suíte completa)  → ver seção de fechamento abaixo
tsgo --noEmit                → ver seção de fechamento abaixo
vite build                   → ver seção de fechamento abaixo
```

> Preenchido após a execução final: **334 arquivos de teste passaram (1 skipped), 5188 testes passaram (4 skipped), exit 0; typecheck exit 0; build exit 0; prévia "build OK".**

---

## 10) Riscos residuais

1. **Policy de leitura ampla para administrador**: um administrador enxerga assinaturas de todas as organizações. Correto hoje (o papel é global e existe 1 organização), mas precisa ser reavaliado quando existir o papel Superadmin e mais de um tenant — é exatamente o objeto da fase de RBAC+SaaS.
2. **Ausência de assinatura para a organização atual**: qualquer código futuro precisa tratar "sem assinatura" de forma explícita e fail-closed, e não assumir a existência de uma linha.
3. **`created_by` e `actor_user_id` sem FK para `auth.users`** (por regra do projeto, `auth.users` não é referenciada). A integridade de autoria é lógica, não declarativa.
4. **Pendências herdadas do gate anterior** (não bloqueadoras aqui): proteção contra senhas vazadas desativada no painel; seleção global de emitente nas RPCs fiscais, que vira bloqueador quando surgir a segunda organização.
5. **Sem bateria autenticada de ponta a ponta** por perfil: as provas de RLS foram feitas por sonda transacional com `SET LOCAL ROLE` e claims simuladas, o que cobre a decisão do Postgres mas não o caminho HTTP completo do PostgREST.

---

## 11) Conclusão

**PASS — S2 pode ser iniciada.**

Critérios atendidos: auditoria prévia sem duplicação; fluxos e tabelas existentes intactos; banco canônico único; migration transacional, idempotente e validada fail-closed (com uma reprovação real capturada e corrigida); RLS em todas as tabelas com `anon` sem acesso e `authenticated` somente leitura administrativa; nenhuma API de mutação; histórico append-only comprovado; unicidade de assinatura corrente e de plano padrão comprovadas; FKs restritivas sem cascata destrutiva; índices e constraints presentes; seed neutro; advisors sem regressão; testes, typecheck e build verdes.

Nada foi publicado. Nenhum dado operacional foi alterado. Nenhum item do escopo bloqueado (overrides, contadores de uso, `get_my_entitlements()`, Superadmin, Meu Plano, billing, gates de menu/rota) foi iniciado.
