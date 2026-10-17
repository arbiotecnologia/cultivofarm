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
