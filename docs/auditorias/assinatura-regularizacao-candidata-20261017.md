# Regularização de assinatura — candidata (2026-10-17)

## Escopo
Ação `activate_subscription` no fluxo existente Plataforma → Assinaturas, convertendo TRIAL (vigente/vencido) ou EXPIRED decorrente de trial em ACTIVE, sem registrar pagamento.

## Arquivos
- `scripts/subscription-regularization/candidate.sql.review` — núcleo com nova ação; fora de migrations; NÃO aplicado.
- `scripts/subscription-regularization/rollback.sql.review` — restaura baseline; não reverte assinaturas já convertidas.
- `scripts/subscription-regularization/baseline/transition_subscription_core.live.sql` — baseline live reconstruído (não byte-verificado).
- `scripts/subscription-regularization/test-local.py` — harness PostgreSQL descartável, 19/19 PASS.
- UI: `src/pages/plataforma/PlataformaGestao.tsx`, `src/lib/saas/subscriptionTransition.ts`, `src/hooks/usePlataformaSaaS.ts`; testes `src/test/saas/assinatura-regularizacao.test.tsx` (matriz de ações atualizada em `assinatura-card-status.test.tsx`).

## Garantias do candidato
- Somente Superadmin ativo (guard existente); motivo ≥5; correlação obrigatória.
- Idempotência vinculada a organização + ação + payload (motivo e versão); replay idêntico retorna a mesma assinatura sem duplicar histórico; org/ação/payload divergentes negados.
- Lock `FOR UPDATE` na assinatura corrente; EXPIRED só é selecionada na ação de ativação.
- Preserva `started_at`, `trial_ends_at` e `cancel_at`; não prorroga nem reinicia trial; empresa sem versão comercial falha explicitamente (exige "Alterar plano" antes).
- Não escreve em pagamentos, contas, fiscal ou SMTP; CANCELLED/SUSPENDED/PAST_DUE não são ampliados.

## Evidências
- Harness local: 19/19 checks (Superadmin passa; admin/outro tenant/anon/inativo negam; TRIAL vencido→ACTIVE; EXPIRED trial→ACTIVE; cancelado nega; versão não vigente falha; replay sem duplicidade; replay org/ação/payload diferente nega; concorrência duas conexões; histórico único; DML direto negado).
- UI: 796/796 testes SaaS PASS; tsc 0; lint focal 0; build OK; scanner de segredos OK.

## Pendências / riscos
- NÃO aplicado no hosted; aguarda revisão independente. AR Bio não convertida.
- Baseline não byte-verificado — confirmar hash da definição live antes de aplicar.
- Período derivado do ciclo é informativo; não implanta cobrança nem expiração automática.
- Rollback não reverte assinaturas já ativadas (histórico preservado).
