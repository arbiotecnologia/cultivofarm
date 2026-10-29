# Rodada 1935 — reauth pós row lock no replay + motivo de crédito na tela (OFFLINE)
- Vínculo: replay (e caminho novo) agora reautoriza após `SELECT partner_accounts ... FOR UPDATE`, além da reauth pós KEY lock. Teste novo `REVOCATION_ROW_WAIT` (distinto do teste de KEY lock): espera provada por `pg_blocking_pids`; revogação commitada durante a espera → `cadastro_context_required`, sem expor `client_id`; replay legítimo segue idempotente. GREEN 51/0 (`pg-run.txt`); RED contra candidato 1925: 1 FAIL exatamente nesse caso (`red-previous-candidate.txt`).
- UI: `ResponderCotacaoDialog` (única tela que recebe `credit_block_reason`) exibe o rótulo de `creditBlockReasonLabel`. Vitest 7/7 (`vitest.txt`). Sem deploy.
- Limitação (não é cobertura completa): o trigger do guard é `UPDATE OF status, total`; uma alteração isolada de `credit_approved_by` NÃO o dispara, logo não é revalidada por ele.
- Preservado: dados de produção só leitura, fiscal pendente, sem cobrança, sem hosted.
