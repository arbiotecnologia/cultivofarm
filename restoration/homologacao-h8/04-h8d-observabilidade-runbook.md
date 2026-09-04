# H8-D — Observabilidade e Runbook Operacional de Homologação

**Ambiente único da fase:** homologação `ikaauvsflpmamgxmkhoq`.
**Produção `navfzbwgwzruipouyfnk`: não consultada, não alterada, não configurada.**
**Commit inicial autoritativo:** `61b41c74027ae526444326ab3607eec0eea134c9`.
**Data de execução:** 2026-09-04 (UTC).
**DDL executado nesta fase: nenhum. Migration criada: nenhuma. Ledger: 658 (inalterado).**

---

## 1. Gate inicial (fail-fast)

| Verificação | Resultado |
|---|---|
| Binding | Drift detectado na entrada (`.env` apontava para outro ref). **Somente binding** foi restaurado do baseline autorizado `6c08a8f8` (`.env`, `client.ts`, `types.ts` com 21.850 linhas). Gate final: `H7d BINDING GATE: OK — staging ikaauvsflpmamgxmkhoq` |
| `STAGING_REF` | Igual ao esperado (`ikaauvsflpmamgxmkhoq`) — comparação sem imprimir DSN |
| Ledger | **658** |
| Guard das 59 repo-only | PASS — 59 íntegras, 0 no ledger, 4 destrutivas bloqueadas |
| H8-A / H8-B presentes | Sim (`h8a-forwards`, `20261002000000_h8b1_...`) |
| Advisors oficiais | performance **512** (147 WARN + 365 INFO), segurança **393** (383 WARN + 10 INFO + 0 ERROR) — herdados de H8-B/H8-C, sem DDL nesta fase que pudesse alterá-los |
| Invariantes | 648 SECDEF, 0 sem `search_path`, 2 anon por desenho, 378 authenticated, 24 views / 23 `security_invoker`, 6 cron, 7 tabelas RLS fail-closed, fiscal `HOMOLOGATION / tpAmb=2 / production_enabled=false / DRAFT / NOT_READY` |

Nenhuma divergência de identidade → fase liberada.

---

## 2. Arquitetura de observabilidade atual (o que já existe)

A H8-D **não criou fluxo paralelo**. O que existe hoje, e que a suíte apenas lê:

| Camada | Mecanismo existente | Natureza |
|---|---|---|
| Agendamento | `cron.job` + `cron.job_run_details` (pg_cron) | histórico nativo, podado pelo próprio pg_cron |
| Comunicação | `comunicacao_eventos` → `comunicacao_outbox` (status, attempts, lease, dead_letter) + `comunicacao_audit_log`, `comunicacao_dlq_replay_audit`, `comunicacao_provider_receipts`, `comunicacao_inapp_dispatch` | fila transacional com idempotência e trilha |
| Superfície pública | `private.public_validation_rate_policy` / `_counters` / `_pepper` + `private.fn_public_validation_rate_check` (H7O P3) | rate limit privado, chave com pepper (sem PII) |
| Edge Functions | 37 funções publicadas; `communication-health`, `fiscal-binding-diagnostics`, `fiscal-preflight` já expõem diagnóstico | endpoints de saúde já existentes |
| Fiscal | `company_fiscal_settings` + views `v_fiscal_*_readiness` + `fiscal_audit_log` | somente configuração/readiness |
| Auditoria de negócio | ~20 tabelas `*_audit_log` / `*_eventos` | trilha por módulo |
| Aplicação | `check-frontend-binding.sh`, `h7o-postcheck.sh`, `h7p-guard-repo-only.sh`, harnesses de perfis, Vitest/typecheck/build, scans fiscais | gates de repositório |

**Lacuna real encontrada:** os sinais existiam, mas dispersos, sem limiar, sem severidade e sem
uma execução única. A H8-D fecha exatamente essa lacuna — com script read-only, **sem tabela,
sem rota e sem dashboard novo**, e portanto **sem DDL**.

---

## 3. Inventário

### 3.1 Cron (6 jobs, todos ativos)

| Job | Schedule | Alvo | Estado |
|---|---|---|---|
| `recurring-financial-daily` | `0 6 * * *` | `fn_run_recurring_generation()` | OK |
| `check-partner-order-sla` | `*/30 * * * *` | `check_partner_order_sla()` | OK |
| `prune-old-audit-logs` | `15 3 * * *` | DELETE em 13 tabelas de auditoria | **FALHANDO** (ver 8.1) |
| `refresh-mv-esteira-laboratorio` | `*/30 * * * *` | `REFRESH MATERIALIZED VIEW` | OK |
| `refresh-mv-fluxo-visita-tecnica` | `*/30 * * * *` | `REFRESH MATERIALIZED VIEW` | OK |
| `h7o-prune-public-validation-rate-limit` | `25 3 * * *` | `private.fn_public_validation_rate_prune()` | OK |

### 3.2 Outbox / comunicação
`comunicacao_outbox` vazia (0 em todos os status); `comunicacao_eventos` = 140, **todos**
`processed`; 0 dead-letter, 0 lease expirado, 0 retry alto. Flags de entrega permanecem OFF —
o estado esperado em homologação é fila vazia com eventos processados.
Idempotência: `idempotency_key` na outbox; replay somente pelo fluxo auditado
(`comunicacao_dlq_replay_audit`).

### 3.3 Superfície pública
2 RPCs `SECURITY DEFINER` executáveis por `anon`, por desenho:
`rpc_validar_comprovante_entrega` (com rate limit) e `rpc_validar_rastreio_produto`.
Contadores em `private.public_validation_rate_counters`: 0 chaves na janela, pico 0;
**nenhum GRANT** a `anon`/`authenticated` no schema `private` (não exposto pela Data API).
As chaves são hash com pepper privado — nunca desidentificar.

### 3.4 Edge Functions
37 funções no repositório/staging. Diagnóstico já disponível por
`fiscal-binding-diagnostics` (`binding_ok`, `STAGING`, `production_emission_allowed=false`) e
`communication-health`. Erros por função continuam em logs da plataforma — **não** replicados
em tabela, para não criar trilha paralela com risco de PII.

### 3.5 Fiscal (apenas saúde/configuração)
`HOMOLOGATION | tpAmb=2 | production_enabled=false | configuration_status=DRAFT |
nfe_readiness_status=NOT_READY`. Nenhum documento emitido, certificado e senha **não** acessados.
`fiscal_invoices|fiscal_events|fiscal_sefaz_transmissions = 0|0|1` (transmissão de homologação).

### 3.6 Auth (sem PII)
18 usuários; **4** sem `profiles` e **4** sem `user_roles` — contas técnicas de homologação;
esse valor é o baseline registrado (limiar `<= 4`). Bloqueio **B1** (proteção contra senha
vazada) permanece externo e não resolvível por esta fase.

### 3.7 Storage
14 buckets, **1 público** (`logos`); todos os demais privados, inclusive
`fiscal-certificates`, `fiscal-xml`, `financial-*`, `entrega-documentos`.
52 policies em `storage.objects`. Nenhum conteúdo de arquivo foi lido.

### 3.8 Banco e aplicação
17/60 conexões, 0 locks longos > 5 min, ledger 658, invariantes preservados.
Aplicação: binding OK, typecheck 0 erro, build OK, Vitest 3.364 PASS / 4 skip / 0 FAIL,
scans fiscais OK.

---

## 4. A suíte de healthcheck

**Arquivos:** `restoration/homologacao-h8/h8d-healthcheck.sh` (orquestrador) e
`h8d-healthcheck.sql` (coleta).

```bash
# leitura humana
bash restoration/homologacao-h8/h8d-healthcheck.sh

# JSON sanitizado (histórico/CI)
bash restoration/homologacao-h8/h8d-healthcheck.sh --json --out /tmp/h8d-YYYYMMDD.json
```

Garantias, todas verificadas por teste estático:

- **Read-only**: a coleta roda dentro de `BEGIN READ ONLY`; o `.sql` não contém
  `INSERT/UPDATE/DELETE/DDL` e o próprio script recusa executar se contiver.
- **Fail-closed de identidade** (`exit 10`, sem consultar nada): `STAGING_REF` diferente do
  esperado, DSN ou `.env` com o ref de produção, ou `.env` sem o ref de homologação.
- **Sanitização**: apenas contagens, idades, flags e nomes de objeto. Sem DSN, token, chave,
  senha, certificado, CPF/CNPJ, e-mail, telefone, nome de pessoa ou payload.
- **Sem `SELECT *`**; leituras agregadas ou com `LIMIT`.
- **Exit codes**: `0` OK · `1` WARN · `2` CRITICAL · `10` gate de identidade · `11` erro de execução.
- Reexecuta os gates de repositório (binding do `.env` e guard das 59 repo-only) como sinais.

---

## 5. Matriz de sinais, limiares, severidade e resposta

29 sinais em 8 categorias. Responsável padrão: **operador de homologação**; escalonamento:
**engenharia AR Bio**; decisões de promoção: **somente autorização humana explícita**.

| # | Categoria / sinal | Limiar | Sev. máx. | Reação | Procedimento |
|---|---|---|---|---|---|
| 1 | identidade / `ledger_migrations` | = 658 | CRITICAL | imediata | 7.2 |
| 2 | identidade / `repo_only_destrutivas_aplicadas` | = 0 | CRITICAL | imediata | 7.3 |
| 3 | identidade / `guard_repo_only_59` | íntegro | CRITICAL | imediata | 7.3 |
| 4 | cron / `jobs_ativos` | 6 de 6 | CRITICAL | 1 dia útil | 7.4 |
| 5 | cron / `falhas_24h` | 0; 1–2 WARN; >2 CRITICAL | CRITICAL | 1 dia útil | 7.4 |
| 6 | cron / `execucao_mais_antiga` | <= 26h | WARN | 1 dia útil | 7.4 |
| 7 | comunicacao / `outbox_backlog` | 0; <=50 WARN | CRITICAL | 4h | 7.5 |
| 8 | comunicacao / `outbox_item_mais_antigo_min` | <=60 OK; <=1440 WARN | CRITICAL | 4h | 7.5 |
| 9 | comunicacao / `outbox_dead_letter` | 0; <=5 WARN | CRITICAL | 1 dia útil | 7.5 |
| 10 | comunicacao / `outbox_leases_expirados` | 0; <=3 WARN | CRITICAL | 4h | 7.5 |
| 11 | comunicacao / `outbox_retry_alto` | 0; <=5 WARN | CRITICAL | 1 dia útil | 7.6 |
| 12 | comunicacao / `eventos_nao_processados` | 0; <=10 WARN | CRITICAL | 4h | 7.5 |
| 13 | superficie_publica / `rate_limit_validacao_publica` | pico < `max_hits` | WARN | 4h | 7.7 |
| 14 | superficie_publica / `rate_limit_sem_data_api` | 0 grants | CRITICAL | imediata | 7.7 |
| 15 | superficie_publica / `rpcs_executaveis_por_anon` | = 2 | CRITICAL | imediata | 7.9 |
| 16 | rls_rpc / `security_definer_sem_search_path` | = 0 | CRITICAL | imediata | 7.9 |
| 17 | rls_rpc / `security_definer_total` | = 648 | WARN | 1 dia útil | 7.9 |
| 18 | rls_rpc / `tabelas_publicas_sem_rls` | = 0 | CRITICAL | imediata | 7.9 |
| 19 | rls_rpc / `tabelas_rls_fail_closed` | = 7 | WARN | 1 dia útil | 7.9 |
| 20 | rls_rpc / `views_security_invoker` | 23 de 24 | CRITICAL | imediata | 7.9 |
| 21 | fiscal / `ambiente_homologacao` | HOMOLOGATION / tpAmb=2 / produção OFF | CRITICAL | imediata | 7.10 |
| 22 | fiscal / `readiness_esperada` | DRAFT / NOT_READY | WARN | 1 dia útil | 7.10 |
| 23 | storage / `buckets_publicos` | exatamente 1 (`logos`) | CRITICAL | imediata | 7.8 |
| 24 | storage / `policies_storage_objects` | > 0 | CRITICAL | imediata | 7.8 |
| 25 | auth / `usuarios_sem_perfil` | <= 4 (baseline); <=8 WARN | CRITICAL | 1 dia útil | 7.11 |
| 26 | auth / `usuarios_sem_papel` | <= 4 (baseline); <=8 WARN | CRITICAL | 1 dia útil | 7.11 |
| 27 | banco / `conexoes_em_uso` | <= 70% de `max_connections` | CRITICAL | 4h | 7.12 |
| 28 | banco / `locks_longos` | 0 acima de 5 min | CRITICAL | 4h | 7.12 |
| 29 | banco / `indices_duplicados_conhecidos` | Advisor é a fonte oficial | UNKNOWN | semanal | 7.13 |

**Justificativa dos limiares.** Nenhum baseline foi inventado: limiares vieram do estado medido
em homologação (ledger 658, 648 SECDEF, 2 anon, 23/24 views, 7 fail-closed, 6 cron, 1 bucket
público, 4 contas técnicas) ou do próprio agendamento (26h = 1x/dia + 2h de folga). Onde não há
histórico suficiente — fila sempre vazia e `duplicate_index`, que só o Advisor mede — o sinal é
**UNKNOWN** e o próprio texto explica como obter baseline (48h de coleta / rodar o Advisor no
ritual semanal). UNKNOWN nunca vira OK e nunca escala sozinho.

---

## 6. Política de privacidade e redação

1. Proibido registrar, imprimir ou gravar: DSN, senha, token, JWT, chave anon/service, pepper,
   certificado ou sua senha, XML/payload fiscal, CPF, CNPJ, e-mail, telefone, nome de pessoa.
2. Sinais só carregam contagem, razão, idade em minutos/horas, flag booleana e nome de objeto.
3. Chaves de rate limit são hash com pepper privado — jamais tentar reverter ou correlacionar.
4. Conteúdo de bucket privado nunca é lido; Storage é medido só por contagem e configuração.
5. O JSON é seguro para histórico/CI; um teste estático falha se aparecer JWT, DSN, e-mail,
   CPF, CNPJ, chave `sb_*` ou o ref de produção.
6. Nenhuma notificação externa real é disparada por esta suíte.

---

## 7. Procedimentos de incidente

Todos começam por: **rodar a suíte, anotar o timestamp UTC e preservar o JSON**. Nenhum passo
autoriza tocar produção.

### 7.1 Drift de binding
Sintoma: gate aborta com `exit 10`, ou `check-frontend-binding.sh` acusa incompatibilidade.
Ação: restaurar **somente** `.env`, `client.ts` e `types.ts` do baseline autorizado
`6c08a8f8`; reexecutar o gate. Nunca editar valores à mão. Se o drift reaparecer na mesma
sessão, parar toda atividade de banco e escalar — é indício de reconexão automática de backend.

### 7.2 Ledger fora de 658
Não aplicar nem reverter nada. Listar as versões extras/faltantes, comparar com
`h7p-repo-only-manifest.json` e com os forwards H7N/H7O/H8-A/H8-B, e escalar. Rollback só com
o par nominal correspondente e autorização humana.

### 7.3 Migration bloqueada aplicada ou guard falhando
As 4 destrutivas são de replay proibido. Se aparecerem no ledger: congelar migrations,
verificar perda de dados derivados (financeiro/ACL), acionar engenharia. Se o guard falhar por
hash, o arquivo foi editado — restaurar do commit de referência antes de qualquer coisa.

### 7.4 Cron parado ou falhando
Ler `cron.job_run_details` do job (sem copiar payload), identificar o erro, corrigir a **função
alvo** por migration aprovada — não alterar schedule para mascarar. Job inativo: confirmar se a
desativação foi intencional antes de reativar.

### 7.5 Fila acumulada / evento preso / lease expirado
Confirmar se as flags de entrega continuam OFF (backlog com produtor ativo é esperado nesse
caso). Verificar `process-communication-outbox` e leases vencidos — o motor reclama sozinho.
Nunca editar linhas da outbox manualmente; reprocessar só pelo replay auditado.

### 7.6 Webhook duplicado / retry crescente
A idempotência (`idempotency_key`, `comunicacao_provider_receipts`) absorve duplicatas.
Retry alto com provedor OFF indica erro determinístico de template/destinatário: inspecionar
`comunicacao_audit_log` pelo código de erro, **não** pelo conteúdo da mensagem.

### 7.7 Abuso de RPC pública
Pico no teto de `max_hits`: manter o limite, não afrouxar. Se houver GRANT indevido em
`private.public_validation_rate_*`, revogar imediatamente (rollback H7O P3) e registrar.

### 7.8 Erro de Storage
Bucket sensível público: privar imediatamente. Falha de upload/download: checar policies de
`storage.objects` e o papel do chamador; nunca abrir bucket para "testar".

### 7.9 Regressão de RLS/RPC
Qualquer variação em 15–20 da matriz: reverter a mudança que a causou (rollback nominal H7N/H7O)
antes de investigar a fundo. `SECURITY DEFINER` sem `search_path` e view definer exposta são
corrigidos na mesma janela.

### 7.10 Tentativa fiscal fora de homologação
`fiscal_environment` ≠ HOMOLOGATION, `tpAmb` ≠ 2 ou `production_enabled=true`: bloquear a
operação, preservar evidência e escalar. Produção fiscal segue **NO-GO** até B3.

### 7.11 Usuário sem perfil/papel
Criar perfil e papel pelos fluxos administrativos; `user_roles` é a única fonte de papel.
Proibido `INSERT` manual ou papel em `profiles`.

### 7.12 Saturação de conexões / lock longo
Identificar por `state`/`wait_event` e `pg_blocking_pids`. Não encerrar sessão de terceiros sem
autorização. Durante migration, lock longo = abortar a janela.

### 7.13 Novo finding de Advisor
O Advisor é a fonte oficial de performance/segurança. Comparar com os números vigentes
(512 / 393). Novo **ERROR** bloqueia a fase; novo WARN entra no backlog com dono e prazo.

---

## 8. Achado operacional da fase

### 8.1 `prune-old-audit-logs` falha desde, pelo menos, 03/09 (severidade: WARN → corrigir em H8-E)

Evidência (`cron.job_run_details`, 2026-09-03 e 2026-09-04 às 03:15 UTC):
`ERROR: column "created_at" does not exist ... FROM public.financial_audit_log`.
A coluna correta nessa tabela é `performed_at`. Como o job roda como **um único bloco
transacional**, o erro na 3ª sentença aborta as 13 — ou seja, **nenhuma** poda de auditoria
está ocorrendo.

Impacto: crescimento indefinido das tabelas de auditoria; **nenhum risco de perda de dados**
(o efeito é o oposto: nada é apagado). Não há urgência de segurança.

Decisão desta fase: **documentar, não corrigir**. A correção exige alterar o comando de um cron
job que executa `DELETE` em 13 tabelas — mudança destrutiva por natureza, fora do escopo
read-only da H8-D e sujeita a autorização explícita. Fica registrada como pendência **H8-E**
com a correção proposta: trocar `created_at` por `performed_at` apenas na sentença de
`financial_audit_log` e, preferencialmente, tornar cada `DELETE` independente para que a falha
de uma tabela não aborte as demais.

---

## 9. Evidências de teste

| Teste | Resultado |
|---|---|
| Healthcheck — execução real | 29 sinais: **26 OK / 1 WARN / 0 CRITICAL / 2 UNKNOWN** → `WARN` (exit 1), pelo achado 8.1 |
| Read-only / idempotência | 3 execuções consecutivas; fingerprint de negócio `658\|0\|140\|648\|594` (ledger, outbox, eventos, SECDEF, policies) **idêntico** nas três; conjunto de sinais/status idêntico entre execuções |
| Cenários simulados | fixtures `cenario-ok` (exit 0), `cenario-warn` (exit 1), `cenario-critical` (exit 2, inclui ledger 659 e fiscal em produção), `cenario-unknown` (UNKNOWN não escala) — nenhuma notificação disparada |
| Sanitização | 0 ocorrências de DSN/JWT/chave/e-mail/CPF/CNPJ no JSON; teste estático cobre todos os fixtures |
| Testes estáticos H8-D | `src/test/security/h8d-healthcheck.static.test.ts` — **25/25 PASS** (inclui teste negativo de detecção de escrita) |
| Binding | `H7d BINDING GATE: OK — staging ikaauvsflpmamgxmkhoq` |
| Gate fail-closed comprovado em campo | Durante a fase o `.env` sofreu drift novamente; a suíte **abortou sozinha** com `H8-D GATE: ABORT — .env não está vinculado ao staging autorizado`, sem consultar o banco. Binding restaurado do baseline `6c08a8f8` e execução repetida com sucesso |
| Guard 59 repo-only | PASS — hashes íntegros, 0 no ledger |
| Ledger | **658** |
| Postcheck H7O | **PASS** (todas as linhas, incl. allowlist 485, fiscal `HOMOLOGATION\|2\|false\|false\|false\|DRAFT\|NOT_READY`) |
| Postcheck H7N | FAIL **pré-existente e esperado** desde H7O (allowlist 504→485, wrappers privados 4→6). Referência vigente é o H7O; não é regressão da H8-D |
| Harness H7O por perfis | **300/300 PASS** (ROLLBACK) |
| Harness H7N por perfis | **136/136 PASS** (ROLLBACK) |
| Typecheck | 0 erro |
| Build | `build OK` |
| Vitest completo | **3.364 PASS / 0 FAIL / 4 skip** (214 arquivos; +25 casos H8-D) |
| Scans | `FISCAL SECRETS SCAN: OK`, `FISCAL INTEGRATION SCAN: OK` |
| Advisors | inalterados por construção — a fase não executou DDL; valores oficiais seguem 512 (performance) e 393 (segurança), **0 novo ERROR e 0 novo WARN** |
| Invariantes | 648 SECDEF · 0 sem `search_path` · 2 anon · 23/24 views invoker · 7 RLS fail-closed · 6 cron · 1 bucket público · fiscal em homologação |

---

## 10. Rotinas operacionais

**Diária (5 min).** Rodar a suíte, arquivar o JSON com data, tratar CRITICAL na hora e abrir
item para WARN. Conferir 8.1 até correção.

**Semanal.** Rodar o Advisor (performance e segurança) e comparar com 512/393; revisar
`cron.job_run_details` dos 7 dias; conferir dead-letter e retry da outbox; rodar
`h7o-postcheck.sh` e o guard das 59.

**Mensal.** Reexecutar harnesses H7O (300) e H7N (136), Vitest completo, typecheck, build e
scans; revisar limiares contra o histórico acumulado de JSONs e promover UNKNOWN a limiar real
quando houver baseline; revisar contas sem perfil/papel.

**Antes de qualquer migration.** Suíte sem CRITICAL, ledger no valor esperado, guard PASS,
0 lock longo, binding OK, rollback nominal escrito e revisado.

**Depois de qualquer migration.** Suíte novamente, ledger +N esperado, postcheck H7O, harnesses,
Advisor, typecheck/build/Vitest; registrar no ledger documental da fase.

---

## 11. Pendências, riscos e blockers

| Item | Situação |
|---|---|
| **B1** — proteção contra senha vazada | Aberto; depende de configuração externa. Fora do alcance desta fase |
| **B3** — credenciamento SEFAZ + validação contábil | Aberto; mantém fiscal em `NOT_READY` e produção NO-GO |
| **B4** — autorização humana de promoção | Aberto por definição; nenhuma automação de promoção foi criada |
| **H8-E** — `prune-old-audit-logs` (achado 8.1) | Aberto; correção proposta, exige janela autorizada |
| Backlog performance/RLS | 146 `multiple_permissive_policies`, 172 `unindexed_foreign_keys`, 193 `unused_index`, 1 `duplicate_index` — fora da H8 |
| Baselines UNKNOWN | Fila vazia e `duplicate_index` sem histórico local; coletar 30 dias de JSON antes de fixar limiar |
| Drift recorrente de binding | Ocorreu de novo na entrada da fase; procedimento 7.1 é obrigatório no início de toda sessão |

---

## 12. Decisão

Healthcheck é **read-only, idempotente, sanitizado, fail-closed e testado**; todos os gates
vigentes passaram; Advisors e invariantes estáveis; ledger **658**; 59 repo-only ausentes e
íntegras; fiscal em homologação com produção desligada.

**H8-D concluída. Decisão: GO operacional em homologação / NO-GO produção.**
Produção só poderá ser tratada em fase de promoção separada, após B1, B3 e B4, com autorização
humana explícita.
