# Regularização de assinatura — candidata v2 (NÃO aplicada)

Data: 2026-10-17. Estado: **candidata revisada após reprovação b3619ad8; aguarda nova revisão independente. Nenhum SQL hosted, nenhuma publicação, AR Bio continua TRIAL.**

## Correções incorporadas da revisão b3619ad8

1. **Ator**: o live `public.is_platform_superadmin(uuid)` verifica SÓ `user_roles` (sem perfil ativo). A candidata v2 acrescenta verificação de `public.profiles.ativo` do ator, sem trocar o modelo de papéis. O harness espelha o live (`user_roles` + `profiles.ativo` + `is_platform_superadmin` real) e comprova que superadmin com perfil inativo é negado, inclusive no replay.
2. **Versão atual**: `activate_subscription` exige `_plan_version_id NULL` (contrato simples); resolve a versão ATUAL da assinatura e valida `PUBLISHED` + vigência (`effective_from/to`); empresa precisa estar ativa; TODOS os snapshots são preservados. Assinatura legada (sem versão) é negada com orientação de `change_plan` — regularização de versão não acontece dentro de `activate`.
3. **Lock e seleção**: lock `FOR UPDATE` da ORGANIZAÇÃO antes de qualquer seleção/replay; corrente selecionada primeiro; EXPIRED só é fallback quando não há corrente, deve ser a assinatura MAIS RECENTE da empresa e ter origem TRIAL→EXPIRED comprovada no histórico. O caso "trial EXPIRED antigo + CANCELLED mais nova" é negado (bug encontrado e corrigido pelo harness).
4. **cancel_at**: ativação bloqueada quando `cancel_at IS NOT NULL`, com orientação explícita. `current_period_start/end` NÃO são alterados — conversão administrativa sem cobrança/expiração nova.
5. **Idempotência estrita**: contrato de payload validado ANTES do replay (activate não aceita versão; versão só em change_plan/start_trial); replay vinculado a organização + ação + motivo + versão; adulterações negadas.
6. **Preflight por hash**: compara MD5 normalizado de `pg_get_functiondef` live (core, wrapper, `is_platform_superadmin`) + presença de `uq_org_subscriptions_one_current` e triggers de guarda/auditoria. Definição live exata arquivada em `scripts/subscription-regularization/installed/transition-core-live-20261017.sql` (evidência; rollback aprovado usa o backup do auditor `subscription-core-before-activation.sql.review`, não o baseline reconstruído).
7. **Harness fiel**: índice parcial real, triggers de guarda/auditoria, papel `authenticated` real, `auth.uid()` via claim, concorrência com duas conexões exigindo exatamente 1 sucesso e 1 histórico, DML direto negado pelo guard.
8. **UI**: resumo de regularização exibe os SNAPSHOTS da assinatura (preço/moeda/ciclo legível em pt-BR), não o ciclo da versão; confirmação explícita reseta quando assinatura/versão/status/snapshots lidos mudam.

## Evidências desta rodada (local, não hosted)

- Harness PostgreSQL descartável: **23/23 checks PASS** (`scripts/subscription-regularization/test-local.py`).
- Vitest focado: **28/28 PASS** (regularização 9, card-status 13, alterar/legada 6).
- `npx tsc --noEmit`: 0 erros. ESLint focal: 0. Build: OK. `fiscal-secrets-scan.sh`: OK. `git diff --check`: OK.

## Limites honestos

- Nada foi aplicado ao hosted nem publicado; AR Bio segue TRIAL.
- Cache de autorização (ca485c3b) permanece gate=false, SQL não aplicado, NÃO aprovado — casts de typecheck não constituem correção/validação do cache.
- Testes de UI cobrem componente com mocks; fluxo real autenticado de Superadmin no publicado ainda não foi exercido.
- Rollback operacional seguro: não reverter assinaturas já ativadas; contenção = revogar a ação via nova transição auditada, com o backup do auditor como referência de restauração do core.

## Arquivos

- `scripts/subscription-regularization/candidate.sql.review` — núcleo v2 + preflight por hash.
- `scripts/subscription-regularization/installed/transition-core-live-20261017.sql` — definição live exata (evidência).
- `scripts/subscription-regularization/test-local.py` — harness (23 checks).
- `src/lib/saas/subscriptionTransition.ts`, `src/pages/plataforma/PlataformaGestao.tsx`, `src/hooks/usePlataformaSaaS.ts` — ação/UI/mensagens.
- `src/test/saas/assinatura-regularizacao.test.tsx` (+2 testes), `assinatura-card-status.test.tsx`.

---

## Rodada 2026-10-17 01:05 UTC — INSTALAÇÃO pelo auditor + ajustes UI (revisão 44b66a99)

### SQL instalado (NÃO reaplicar)

- Migration `20261017005910_platform_activate_trial_subscription_reviewed` instalada pelo auditor no canônico `swzpzcwiasxmjutrmvkm`.
- CoreMD5 live: `e7e3b57debf67673a82e3f4f7c2daa48` (antes `dac02aed312d3f20234eb43d4e1e1c43`).
- SQL exato arquivado em `scripts/subscription-regularization/installed/20261017005910_platform_activate_trial_subscription_reviewed.sql`; `candidate.sql.review` agora espelha o corpo instalado (idêntico), sem preflight.
- Além da v2, o instalado inclui: `senha_provisoria IS NOT TRUE` no ator, `_action NULL` negado, versão obrigatória em `start_trial` antes do replay, `o.status='ativa'` na empresa, lock `FOR SHARE` da versão, `clock_timestamp()` após o lock e ordenação determinística `started_at/created_at/id`.
- Hosted BEGIN/ROLLBACK (auditor): 6 identidades reais (Admin AR/Admin FSF/Produtor/B2B/Consultor/Financeiro) negadas; SA ativo converte TRIAL→ACTIVE preservando todos os campos exceto status/updated_at/state_changed_at/last_correlation_id; histórico único com ator/old/new/motivo; replay idêntico retorna sem duplicar; motivo alterado/outra org/versão explícita/segunda ativação negados; SA inativo negado. Após rollback, AR Bio segue TRIAL e SA ativo.

### Harness v3 — fidelidade corrigida

A v2 NÃO era fiel (issue_ticket NOOP, guard por GUC, `created_by` no histórico, nomes de trigger errados). A v3 espelha: `platform_private.authz_tickets` com `issue_ticket`/`has_ticket` por `txid_current()`, guard de DML por ticket (não GUC) com `session_user` `authenticator` real, histórico com `actor_user_id`, nomes exatos de triggers (`saas_subscription_guard_trg`, `trg_org_subscriptions_audit`, `saas_subscription_require_published_version_trg`, `organization_subscription_history_no_delete_trg`, `organization_subscription_history_no_mutation_trg`, `trg_org_sub_history_no_mutation`), índice parcial `uq_org_subscriptions_one_current`, `profiles.senha_provisoria` e papel `anon` sem EXECUTE.
Resultado: **26/26 checks PASS** (PostgreSQL isolado; NÃO hosted), incluindo concorrência com exatamente 1 sucesso/1 histórico, DML direto sem ticket negado, anon negado, SA inativo e SA com senha provisória negados, histórico imutável (UPDATE/DELETE negados).

### Ajustes UI (PlataformaGestao.tsx + usePlataformaSaaS.ts)

- `CICLOS` usa os valores canônicos do CHECK de banco: `annual`→"anual", `custom`→"personalizado" (removido `yearly`/`weekly` inexistentes).
- Moeda formatada com `Intl.NumberFormat("pt-BR", {style:"currency", currency})` do `currency_snapshot` (USD não vira R$); fallback seguro sem prefixo fixo.
- Seleção espelha o núcleo: linha mais recente por `started_at/created_at/id`; EXPIRED só é elegível com origem TRIAL→EXPIRED no histórico; CANCELLED mais nova nunca é pulada.
- Regularização bloqueada com mensagem amigável quando `cancel_at` preenchido ou versão atual carregada fora de vigência/não publicada (`cancel_at` adicionado ao select/tipo `AssinaturaSaaS`).
- Confirmação explícita reseta também ao mudar moeda, `cancel_at` e período (`current_period_start/end`).

### Evidências desta rodada (local, não hosted)

- Harness v3: **26/26 checks PASS**.
- Vitest `src/test/saas/`: **805/805 PASS** (regularização agora com 15 testes, incluindo annual/custom, moeda Intl, cancel_at, versão fora de vigência, EXPIRED sem origem, CANCELLED mais nova, reset por moeda/cancel_at).
- `npx tsc --noEmit`: 0 erros. ESLint focal (3 arquivos): 0. Build: OK. Scanner: OK. `git diff --check`: OK.

### Limites honestos

- Nada publicado nesta rodada; AR Bio NÃO foi convertida (segue TRIAL) — conversão aguarda auditor.
- Cache de autorização permanece gate=false, SQL candidato não aplicado, NÃO aprovado.
- Harness espelha o live mas não certifica hosted; testes de UI usam mocks; fluxo real de Superadmin no publicado ainda não exercido.
