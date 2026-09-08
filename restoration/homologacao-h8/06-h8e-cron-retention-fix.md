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

**Advisors (no momento da aplicação):** nenhuma nova consulta oficial foi executada. Os
valores vigentes eram os da H8-B (performance 512; segurança 393 = 383 WARN + 10 INFO +
0 ERROR). A alteração desta fase não cria objeto de banco, policy, índice, view, função ou
grant — portanto não pode introduzir novo achado de Advisor. A releitura oficial posterior
à validação funcional está na **seção 9** (segurança 393 inalterado; performance 510).

---

## 9. Validação funcional — execução antecipada autorizada (2026-09-08 15:04 UTC)

> **Status: H8-E CONCLUÍDA.** A validação funcional deixou de ser pendente.

O usuário autorizou **explicitamente** antecipar e executar o job de retenção em homologação.
Essa execução substitui o critério anterior de aguardar 2026-09-09 03:15 UTC e constitui a
evidência funcional válida da H8-E.

**Procedimento executado (homologação `ikaauvsflpmamgxmkhoq`; produção jamais consultada):**

1. **Pré-contagem:** zero registros elegíveis (> 180 dias) nas 13 tabelas do bloco.
2. O próprio `jobid=5` foi reagendado para **uma janela única** em 2026-09-08 15:04 UTC —
   sem alterar `command`, `jobname`, `database`, `username` ou `active`.
3. Execução registrada em `cron.job_run_details`:

| Campo | Valor |
|---|---|
| `runid` | **7138** |
| `start_time` | 2026-09-08 15:04:00.092264 UTC |
| `end_time` | 2026-09-08 15:04:00.128757 UTC |
| `status` | **succeeded** |
| `return_message` | `DELETE 0` |

4. **Nenhum erro de coluna.** O defeito `column "created_at" does not exist` não reaparece.
5. **Agenda original restaurada imediatamente:** `schedule = 15 3 * * *`, `active = true`,
   `command` md5 **`dbc129eaf374196a06f3b911381703da`** (inalterado pela antecipação).
6. **Pós-contagem:** zero registros com mais de 180 dias nas 13 tabelas — coerente com
   `DELETE 0`; nenhuma linha dentro da janela de retenção foi removida.
7. **Ledger permaneceu 659**; última migration `20261003000000`.

**Falha histórica preservada:** a execução de **2026-09-08 03:15 UTC (`runid=7063`, `failed`)**
e as anteriores permanecem em `cron.job_run_details` como evidência do defeito corrigido.
Não foram apagadas nem mascaradas; o sinal `cron/falhas_24h` do healthcheck seguirá em WARN
até a falha sair da janela de 24 h.

**Invariantes revalidados após a execução:** 648 `SECURITY DEFINER`, 0 sem `search_path`,
2 executáveis por `anon`, 378 por `authenticated`, 6 cron ativos, 24 views públicas
(23 `security_invoker`).

**Advisors oficiais:**

| Advisor | Valor | Observação |
|---|---|---|
| Segurança | **393** (inalterado) | `rls_enabled_no_policy` 10 · `extension_in_public` 2 · SECDEF `anon` 2 · SECDEF `authenticated` 378 · leaked password protection 1 |
| Performance | **510** | `unindexed_foreign_keys` 172 · `unused_index` **191** · `multiple_permissive_policies` 146 · `duplicate_index` 1 |

O baseline anterior era **512** por conter 193 `unused_index`. A diferença de 2 é
**melhoria dinâmica de estatística de uso de índices**, não alteração estrutural desta
execução e **não** regressão. Nenhum objeto de banco foi criado, alterado ou removido.

---

## 10. Riscos residuais

| Risco | Severidade | Tratamento |
|---|---|---|
| Bloco continua atômico: falha futura em qualquer tabela cancela as 13 podas | Média | Separação por sentença fica como backlog explícito (fora do escopo autorizado desta fase) |
| Primeira poda real com backlog acumulado ainda não observada (a execução validada removeu 0 linhas) | Baixa | Comportamento validado sintática e funcionalmente; o `DELETE 0` prova que as 13 sentenças executam sem erro de coluna |
| Achados legados de Advisor (146 `multiple_permissive_policies`, 172 FKs sem índice, 191 índices não usados, 10 `rls_enabled_no_policy`, 2 `extension_in_public`, proteção de senha vazada) | Média | Backlog explícito, fora da H8; condicionam a promoção a produção |

---

## 11. Decisão

- **H8-E CONCLUÍDA em homologação** — migration, rollback, ensaio, gates **e validação
  funcional** (runid 7138, `succeeded`, `DELETE 0`) aprovados; ledger 659; job restaurado
  em `15 3 * * *` com md5 `dbc129eaf374196a06f3b911381703da`; invariantes e configuração
  fiscal preservados.
- **Fase H8 concluída em homologação** (A/B/C/D/E).
- **NO-GO produção mantido.** Nenhuma promoção de banco ou aplicação foi realizada, e os
  blockers B1 (proteção contra senha vazada), B3 (credenciamento SEFAZ) e B4 (autorização
  humana de promoção) seguem abertos.
