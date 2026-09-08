# H8-E — Correção segura do cron de retenção de auditoria

**Ambiente exclusivo:** homologação `ikaauvsflpmamgxmkhoq`.
**Produção `navfzbwgwzruipouyfnk`:** não consultada, não alterada, não configurada.
**Commit inicial da sessão:** `7f88492b835490b923f273448bf46567796849f3` (HEAD real do repositório;
o commit citado no pedido, `cfd57ee4…`, não é o HEAD — divergência registrada e não bloqueante,
pois todas as pré-condições materiais de banco foram verificadas e conferem).
**Data de execução:** 2026-09-08 (UTC).

---

## 1. Baseline verificado (gate fail-fast)

| Item | Esperado | Medido | Resultado |
|---|---|---|---|
| Binding `.env`/`client.ts`/`types.ts` | staging `ikaauvsflpmamgxmkhoq` | drift para `yzszlzjpovmcteuxjznj` → restaurado do baseline `6c08a8f8` | OK após restauração |
| Ledger inicial | 658 | 658 | OK |
| Última migration | `20261002000000_h8b1_redundant_select_policy_v1` | idem | OK |
| Migrations H8-A/H8-B no ledger | 4 | 4 (`20261001000000`, `20261001010000`, `20261001020000`, `20261002000000`) | OK |
| 59 repo-only ausentes do ledger | 59/59 | 59/59, SHA-256 intactos, `apply_to_staging=false` | OK |
| Job alvo | 1 registro, `jobid=5`, `active=true`, `15 3 * * *` | idem, `database=postgres`, `username=postgres` | OK |
| md5 do `command` | `6fcccc17696cc2409fa5afba2a593e78` | idêntico | OK |
| `financial_audit_log` | tem `performed_at`, não tem `created_at` | confirmado | OK |
| Fiscal | HOMOLOGATION / tpAmb=2 / produção desabilitada / DRAFT / NOT_READY | idêntico | OK |

Histórico recente: falha reincidente em **2026-09-08 03:15 UTC** com
`ERROR: column "created_at" does not exist` na sentença de `public.financial_audit_log`.

---

## 2. Achado adicional (ampliação mínima e justificada de escopo)

Durante a verificação de catálogo das 13 tabelas do bloco, um **segundo defeito da mesma
natureza** foi comprovado:

| Tabela | Coluna usada no `command` | Coluna real | Situação |
|---|---|---|---|
| `public.financial_audit_log` | `created_at` | `performed_at` | defeito conhecido |
| `public.clientes_audit_log` | `created_at` | `changed_at` | **defeito novo, comprovado** |
| demais 11 tabelas | `created_at` | `created_at` | corretas |

Como o `command` é um bloco transacional único (decisão mantida nesta fase, conforme
instrução de não separar as 13 sentenças), corrigir apenas `financial_audit_log` deixaria o
job **ainda abortando** na sentença de `clientes_audit_log` — o objetivo declarado da fase
(retenção voltar a funcionar) não seria atingido. Por isso a correção abrange **as duas
referências de coluna e nada mais**. Nenhuma tabela, filtro, intervalo (`180 days`),
ordem de sentenças, atomicidade ou metadado do job foi alterado.

---

## 3. Correção aplicada

- **Migration:** `supabase/migrations/20261003000000_h8e_fix_prune_audit_logs_performed_at_v1.sql`
  (forward canônico versionado também em `restoration/homologacao-h8/h8e-forwards/`).
- **Mecanismo:** exclusivamente `cron.alter_job(job_id := 5, command := …)`.
  Nenhum `INSERT`/`UPDATE` direto em `cron.job`; `cron.schedule` não foi usado.
- **Provas embutidas no bloco fail-fast** (qualquer uma falha ⇒ transação abortada):
  1. identidade do job (`jobid`, `jobname`, `schedule`, `active`);
  2. md5 do `command` igual ao baseline auditado;
  3. presença/ausência das quatro colunas no catálogo;
  4. substituição textual restrita às duas sentenças alvo;
  5. delta de comprimento exatamente `+2` caracteres (`performed_at`−`created_at`);
  6. exatamente **2 linhas** diferentes entre `command` antigo e novo;
  7. contagem de sentenças `DELETE FROM public.` preservada em **13**;
  8. exatamente **11** ocorrências remanescentes de `created_at`;
  9. pós-condições: `jobname`/`schedule`/`database`/`username`/`active` preservados,
     `performed_at` presente na sentença financeira, `created_at` ausente nela,
     `changed_at` presente na sentença de clientes.
- **Nenhum `DELETE` foi executado**; o job não foi invocado nem antecipado.

**md5 do `command`:** anterior `6fcccc17696cc2409fa5afba2a593e78` → novo `dbc129eaf374196a06f3b911381703da`.

### Diferença sanitizada (somente as duas linhas alteradas)

```text
- DELETE FROM public.financial_audit_log             WHERE created_at   < now() - interval '180 days';
+ DELETE FROM public.financial_audit_log             WHERE performed_at < now() - interval '180 days';
- DELETE FROM public.clientes_audit_log              WHERE created_at   < now() - interval '180 days';
+ DELETE FROM public.clientes_audit_log              WHERE changed_at   < now() - interval '180 days';
```

---

## 4. Rollback nominal

`restoration/homologacao-h8/h8e-rollbacks/20261003000000_h8e_fix_prune_audit_logs_performed_at_v1.rollback.sql`
— **fora de `supabase/migrations`** por desenho. Reconstrói o `command` original, **valida que
o md5 reconstruído é exatamente `6fcccc17696cc2409fa5afba2a593e78` antes de aplicar**, usa
`cron.alter_job` e revalida o md5 depois. Idempotente (não faz nada se já estiver no original).

---

## 5. Ensaio em transação descartada

Executado antes da aplicação definitiva, na sequência exigida:

| Passo | Resultado |
|---|---|
| 1. aplicar forward | `NOTICE: H8-E OK: md5 6fcccc17… -> dbc129ea…` |
| 2. validar catálogo/md5 | `dbc129eaf374196a06f3b911381703da` |
| 3. restaurar via rollback | `NOTICE: H8-E rollback OK` |
| 4. validar md5 original | `6fcccc17696cc2409fa5afba2a593e78`, `schedule=15 3 * * *`, `active=t` |
| 5. `ROLLBACK` | confirmado — nada persistiu |

O ensaio não invocou o `command` e não executou `DELETE`.

---

## 6. Aplicação definitiva e ledger

Aplicada transacionalmente por `restoration/homologacao-h8/h8b-apply.sh` (DDL + registro no
ledger na mesma transação).

| Item | Antes | Depois |
|---|---|---|
| Ledger | 658 | **659** |
| Última versão | `20261002000000` | `20261003000000_h8e_fix_prune_audit_logs_performed_at_v1` |
| Jobs cron ativos | 6 | 6 |
| `jobid` / `schedule` / `active` | 5 / `15 3 * * *` / `true` | inalterados |
| md5 do `command` | `6fcccc17…` | `dbc129ea…` |

Conteúdo do ledger conferido contra o arquivo do repositório: idêntico (diferença apenas em
espaços/nova-linha finais introduzidos pelo registro do ledger).

---

## 7. Adequações obrigatórias realizadas

| Arquivo | Mudança |
|---|---|
| `restoration/homologacao-h7/h7p-repo-only-manifest.json` | `ledger_versoes` 658 → 659 (2 ocorrências) e nota histórica; **59 entries, hashes, classificações e decisões intactos** |
| `restoration/homologacao-h7/h7p-guard-repo-only.sh` | guard passa a exigir `ledger_versoes = 659` |
| `src/test/security/h7p-repo-only-migrations.static.test.ts` | ledger esperado 659; teto de arquivos 718; 59/59 mantidas |
| `restoration/homologacao-h8/h8d-healthcheck.sql` | sinal `ledger_migrations` passa a esperar 659 (demais sinais/limiares inalterados) |
| `restoration/homologacao-h8/h8d-fixtures/*.json` | fingerprints de ledger atualizados (cenário CRITICAL usa 660 para permanecer um drift real) |
| `src/test/security/h8d-healthcheck.static.test.ts` | baseline de ledger 659 |
| `roadmap.md`, `04-h8d-observabilidade-runbook.md`, `05-h8-relatorio-final.md` | H8-E registrada, histórico preservado |

---

## 8. Testes e gates (todos medidos após a aplicação)

| Gate | Resultado |
|---|---|
| Binding staging | PASS (`ikaauvsflpmamgxmkhoq`) |
| Guard repo-only 59 | PASS — 59 íntegras, 0 no ledger |
| Ledger | 659 |
| Cron | 6 ativos; `jobid=5` preservado; sentença alvo sem referência inválida |
| Healthcheck H8-D | 29 sinais — 26 OK, **1 WARN**, 0 CRITICAL, 2 UNKNOWN → status WARN |
| Postcheck H7O | PASS |
| Harness H7O | 300/300 PASS |
| Harness H7N | 136/136 PASS |
| Typecheck | PASS (0 erros) |
| Vitest completo | 3364 PASS / 0 FAIL / 4 skip (213 arquivos + 1 skip) |
| Build | `build OK` |
| Scans fiscal (secrets/integração) | PASS |
| Invariantes | 648 SECDEF, 0 sem `search_path`, 2 anon por desenho, 23/24 views invoker, 7 tabelas RLS fail-closed, 0 tabelas públicas sem RLS, 1/14 bucket público |
| Fiscal | `HOMOLOGATION\|2\|false\|false\|false\|DRAFT\|NOT_READY` |

O **WARN** do healthcheck é a falha **histórica** de 2026-09-08 03:15 UTC, anterior à correção.
**Não foi mascarado**: permanecerá WARN até sair da janela de 24 h ou até o próximo ciclo bem-sucedido.

**Advisors:** nenhuma nova consulta oficial foi executada nesta fase. Os valores oficiais
permanecem os da H8-B (performance 512 = 147 WARN + 365 INFO; segurança 393 = 383 WARN +
10 INFO + 0 ERROR). A alteração desta fase não cria objeto de banco, policy, índice, view,
função ou grant — portanto não pode introduzir novo achado de Advisor.

---

## 9. Status e verificação do próximo ciclo

> **Status: correção implantada; validação funcional pendente da próxima execução às 03:15 UTC.**

Não se afirma sucesso da execução agendada antes do disparo real.

**Procedimento de verificação (2026-09-09, após 03:15 UTC), read-only:**

1. Consultar as execuções recentes do job `jobid=5` em `cron.job_run_details`.
2. Critérios de aceite, cumulativos:
   - `status = 'succeeded'`;
   - `return_message` sem `column ... does not exist` e sem qualquer erro;
   - contagens de retenção coerentes: nenhuma linha remanescente com mais de 180 dias nas
     13 tabelas, e nenhuma remoção de linhas dentro da janela de retenção.
3. Executar `restoration/homologacao-h8/h8d-healthcheck.sh`; o sinal `cron/falhas_24h` deve
   voltar a **OK** (0) uma vez que a falha histórica saia da janela de 24 h.
4. Em caso de nova falha: aplicar o rollback nominal (seção 4), registrar em incidente
   conforme runbook `04-h8d`, seção 8, e **não** reagendar manualmente.

---

## 10. Riscos residuais

| Risco | Severidade | Tratamento |
|---|---|---|
| Primeira execução corrigida remove backlog acumulado de >180 dias em 13 tabelas de uma vez | Baixa (dados de auditoria fora da política de retenção vigente) | Comportamento pretendido da política; execução única e transacional |
| Bloco continua atômico: falha futura em qualquer tabela cancela as 13 podas | Média | Separação por sentença fica como backlog explícito (fora do escopo autorizado desta fase) |
| Retenção não roda até 03:15 UTC | Baixa | Aceito; não se antecipa a agenda |

---

## 11. Decisão

- **GO técnico em homologação** — migration, rollback, ensaio e todos os gates passaram;
  ledger 659; invariantes e configuração fiscal preservados.
- **Validação funcional do cron: PENDENTE** do disparo de 03:15 UTC.
- **NO-GO produção mantido.** Nenhuma promoção de banco ou aplicação foi realizada.
