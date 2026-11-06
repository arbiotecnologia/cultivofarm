# Revisão de diff — fingerprint de `useDeliveryFinanceReconciliation.ts` (2026-11-06)

- Falha reproduzida em cópia limpa `git archive 607c0d3f` (scripts/src/docs/supabase): `fingerprint src/hooks/useDeliveryFinanceReconciliation.ts` FAIL — portanto PREEXISTENTE a 607c0d3f e às rodadas de nome do tenant.
- Pin histórico (evidência de 29/10): `a8fac0db…` = commit 523a74bee (28/10). Arquivo atual `045be9c9…` = commit 91609839d (30/10, único commit posterior; também acrescentou a regra "Blocked delivery finance exposes only scoped existing-title reconciliation…" em src/hooks/AGENTS.md).
- Diff (35 linhas): remove estado `rejeitado`, `action`/`setAction`, mensagem fixa de bloqueio e callback `reject` (que apenas gravava estado local); estado passa a ser derivado só da consulta escopada (`indisponivel`/`carregando`/`resposta_incerta`/`recebivel_confirmado`/`fiscal_pendente`/`nenhum_titulo`); `reconsultar` exige fence atual e não dispara durante busca; `pending` inclui busca em andamento; mensagem por estado deixa explícito que vazio não prova estorno.
- Superfície de autoridade: nenhuma RPC/tabela nova, nenhuma escrita/dispatch, mesma `queryKey`/escopo; reduz callbacks. Compatível com a regra de AGENTS de reconciliação somente leitura.
- Mecanismo previsto pelo próprio script: `--consumer-revision` exige `historical_md5` igual ao pin original e um motivo; o pin histórico NÃO foi alterado.
- Arquivo candidato: `consumer-revision-delivery-finance-20261030.candidate.json`. O teste vitest NÃO foi religado a ele — segue FAIL até aprovação do revisor.
