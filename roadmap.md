# Roadmap

- [x] H7e — CORS canônico, release marker, gate de release, relatório
- [ ] Publicar release H7e/H7 no staging autorizado (bloqueado: ferramenta de deploy está vinculada ao backend ativo, não ao staging `ikaau...`; nenhuma função foi deixada publicada no alvo errado)
- [x] Corrigir erros de typecheck do preview (drift de `types.ts` gerado)
- [x] H7k — preflight fiscal por campo, integridade aritmética de itens, menor privilégio (staging, 8/8 postchecks + harness PASS)
- [ ] Provisionar certificado A1 de homologação para o smoke real SEFAZ (cStat 100/204/539), somente pela UI canônica após o deploy correto
- [x] Restaurar binding `.env`/`types.ts` para o baseline `c75bb87f` e revalidar guard de staging
- [x] P0/P1 promoção staging→produção: inventário, contrato `expected/`, manifesto de migrations, manifesto de dados, scripts read-only e dry-run (nenhum DDL/DML em produção)
- [ ] P2 promoção: exige `PROD_DSN` humano, PITR confirmado, quarentena das 20 migrations de sandbox e reconciliação do ledger do staging
- [x] H7A — guard de `certificate_ref` aplicado exclusivamente no staging; postcheck 7/7 PASS; upload/assinatura aguardam publicação correta das Edge Functions
- [x] H7 revalidada em 2026-09-03: binding restaurado, 77 postchecks PASS, typecheck/Vitest(3.301)/build/scan OK; ressalva única = publicação das Edge Functions no staging autorizado

## H7n — P0/P1 Security Advisor (staging) — CONCLUÍDO (04/09/2026)
- [x] Auditoria read-only: views, grants, dependências, inventário de funções (restoration/homologacao-h7/97-h7n-p0p1-auditoria.md)
- [x] P0: 5 views `security_invoker=true` + wrappers `private` (migration 20260904130615 aplicada no staging e versionada); harness por perfil 136/136 PASS
- [x] P1: 27 triggers e 42 helpers sem EXECUTE direto; guards nas 13 RPCs; allowlist de RPCs + `h7n-postcheck.sh` (falha em drift)
- [x] Rollbacks por migração em `restoration/homologacao-h7/h7n-rollbacks/` + ensaio rollback→reapply em transação descartada (fingerprint idêntico)
- [x] Advisor antes 5/479/7 → depois 0/402/7 (splinter oficial); typecheck/build/vitest (3.318 efetivos)/scan de segredos PASS; relatórios atualizados
- [ ] P1 residual (pré-promoção): revisar individualmente os 397 SECURITY DEFINER executáveis por authenticated (348 com guard textual) a partir de `rpc_allowlist.tsv`
- [ ] P2: rate-limit em banco para `rpc_validar_comprovante_entrega`; `extension_in_public` (btree_gist, pg_net); leaked-password protection; alinhar `rpc_b2b_aging`/`rpc_b2b_partner_profitability` para `RAISE 42501`
- [ ] Ledger: versionar/decidir `20260903182144_h7l_security_advisor_hardening` (no staging, sem arquivo no repo) e ordem das migrations posteriores a `20260904131341`

## H7o — Auditoria SECURITY DEFINER, rate-limit público e views (staging) — CONCLUÍDO (04/09/2026)
- [x] Rodada 1: auditoria read-only das 397 SECURITY DEFINER, recuperação byte a byte de H7L, mapa de consumidores
- [x] Rodada 2: 4 migrations aplicadas (guardas 42501, 19 revogações, rate-limit privado anti-enumeração, reafirmação das 5 views) + rollbacks fora de `supabase/migrations`
- [x] Rodada 3: postcheck PASS, allowlist 504 → 485 (19 removidas / 0 adicionadas), Advisor 0 ERROR, ensaio rollback→reapply com fingerprint idêntico
- [x] Gates novos na suíte: ordem de migrations das views protegidas (com teste negativo) e gate de binding de staging sem exposição de segredos
- [x] Typecheck / build / Vitest 3.326 PASS / scans de segredo e integração fiscal OK; binding restaurado ao baseline autorizado
- [ ] P2 remanescente: reconciliar as 59 migrations repo-only com o ledger, `extension_in_public` (btree_gist, pg_net), leaked-password protection e redução do Grupo B de SECURITY DEFINER

## H7p — Reconciliação final e prontidão pré-produção (staging) — CONCLUÍDO (04/09/2026)
- [x] Gate de binding no início e no fim; `.env`/`client.ts`/`types.ts` restaurados do baseline `6c08a8f8`
- [x] Reconciliação das 59 migrations repo-only por catálogo/definições normalizadas: 36 refletidas, 3 superadas, 20 conflitantes — 0 pendentes, nenhum DDL aplicado (ledger 654)
- [x] Mecanismo determinístico anti-reaplicação: manifesto sha256 + `h7p-guard-repo-only.sh` + teste estático no Vitest
- [x] 648 SECURITY DEFINER revalidadas (0 sem `search_path`, 2 anon por design); nenhuma revogação em massa
- [x] `btree_gist`/`pg_net` mantidas em `public` com justificativa (constraint `cpr_no_overlap` e `net.http_post`)
- [x] Postcheck H7O PASS, harness 300 + 136 PASS, 5/5 views invoker, rate-limit e cron ativos, rollback→reapply reconvergido
- [x] Typecheck / build / Vitest 3.337 PASS / scans OK; relatório final `restoration/homologacao-h7/99-h7-relatorio-final.md`
- [x] Verificação independente pós-entrega com o Advisor oficial: Security 393 = **0 ERROR** / 383 WARN / 10 INFO; Performance 1001 = **0 ERROR** / 610 WARN / 391 INFO — WARN/INFO tratados como dívida aceita ou bloqueio externo, sem correção ampla de performance nesta fase
- [x] Catálogo independente: 24 views públicas, 23 com `security_invoker`; a única exceção (`_src_vw_esteira_laboratorio`) é interna e sem grants
- [ ] Bloqueio externo B1: habilitar leaked-password protection no staging e testar rejeição de senha vazada
- [ ] Bloqueio externo B2: publicar as Edge Functions no staging pelo runner autorizado e validar `fiscal-binding-diagnostics`
- [ ] Bloqueio externo B3: preencher dados fiscais reais do emitente (`DRAFT` → `READY`)
- [ ] Bloqueio externo B4: autorização humana explícita para promoção a produção

## H7q — Resolução dos bloqueios externos e gate definitivo (staging) — CONCLUÍDO COM BLOQUEIOS (05/09/2026)
- [x] Gate de binding no início (drift para o Cloud `yzszl…` corrigido pelo baseline `6c08a8f8`) e revalidação
- [ ] B1 — leaked-password protection: **bloqueado**, sem runner/PAT vinculado ao staging; instrução operacional documentada (seção 10.2 do relatório final)
- [x] B2 — Edge Functions: 37 funções + `_shared` inventariadas; **37/37 publicadas no staging**; `fiscal-binding-diagnostics` → `binding_ok=true`, `STAGING`, `production_emission_allowed=false`; nenhum secret lido/rotacionado
- [ ] B2 residual — republicação de funções exige runner `--project-ref ikaauvsflpmamgxmkhoq` (indisponível nesta sessão)
- [ ] B3 — emitente fiscal: **bloqueado** por `EMITTER_ACCREDITATION_MISSING` e `EMITTER_ACCOUNTING_NOT_VALIDATED`; nenhum dado fiscal inventado
- [ ] B4 — autorização humana explícita para promoção a produção
- [x] Gates reexecutados: repo-only guard, postcheck H7O integral, harness 300 + 136 PASS, ledger 654 inalterado, 648 SECURITY DEFINER (0 sem `search_path`, 2 anon), 5/5 views invoker, 7 RLS fail-closed, 6 cron jobs
- [x] Typecheck 0 erro, build OK, Vitest 3.337 PASS / 0 FAIL / 4 skip, scans de segredo e integração fiscal OK
- [x] Decisão: **H7 tecnicamente concluída com bloqueios externos — GO staging / NO-GO produção**

## H8 — Abertura formal (somente diagnóstico, sem execução) — 05/09/2026
- [x] Diagnóstico inicial, objetivos, dependências, riscos, critérios de aceite, plano de testes e prompt de execução: `restoration/homologacao-h8/00-h8-abertura-diagnostico.md`
- [x] H8-A — dívida de performance do Advisor: **executada no staging** (relatório `restoration/homologacao-h8/01-h8a-performance-advisor.md`)
  - [x] H8-A1 `duplicate_index` — 32 índices redundantes removidos com prova de equivalência normalizada; 28 → 1 (só `formulacoes`, sustentado por constraints)
  - [x] H8-A2 `auth_rls_initplan` — 436 policies normalizadas via `ALTER POLICY` (`auth.uid()` → `( SELECT auth.uid() AS uid)`), sem mudar nome/comando/roles/USING/WITH CHECK; restantes 0
  - [x] H8-A3 `multiple_permissive_policies` — apenas 2 policies literalmente redundantes removidas; 146 WARN seguem como pendência de consolidação semântica em H8-B
  - [x] `unused_index` (219 → 193, redução colateral) e `unindexed_foreign_keys` (172) não tocados diretamente
  - [x] Advisor oficial: performance 1001 → **512** (0 ERROR, 147 WARN, 365 INFO); security **393** (0 ERROR, 383 WARN, 10 INFO), sem novo achado
  - [x] Ledger 654 → 657; 59 repo-only continuam ausentes e bloqueadas (manifesto e teste estático atualizados para 657)
  - [x] Repositório reconciliado com as três migrations e rollbacks (nenhuma reaplicação, nenhuma migration nova)
  - [x] Postcheck H7O PASS, harness 300 + 136 PASS, 648 SECURITY DEFINER / 0 sem `search_path` / 2 anon, 24 views (23 invoker), 6 cron, 7 RLS fail-closed, fiscal `HOMOLOGATION|2|false|DRAFT|NOT_READY`
  - [x] Typecheck, build, Vitest completo e scans PASS; binding revalidado no início e no fim
  - [x] Decisão: **GO staging para H8-B / NO-GO produção**
- [x] H8-C — reconciliação definitiva das 59 migrations repo-only: **executada em homologação** (relatório `restoration/homologacao-h8/03-h8c-ledger-reconciliation.md`)
  - [x] Fase somente leitura + documentação/guard: **nenhum DDL, nenhuma migration nova, ledger permanece 658**
  - [x] Binding restaurado ao baseline autorizado (`6c08a8f8`) e revalidado para `ikaauvsflpmamgxmkhoq` no início e no fim
  - [x] 59/59 entries reconciliadas individualmente contra o catálogo por consulta read-only; distribuição confirmada **36 REFLETIDA / 3 SUPERSEDED / 20 CONFLITANTE**; **0 INCONCLUSIVA**
  - [x] Lacunas aparentes resolvidas nominalmente (`ux_lotes_programacao_id` ≡ `idx_lotes_programacao_id_unique`; policy `%I` = artefato de `format()`; 5 migrations de ACL/patch comprovadas por `proacl`/`relacl`/`proconfig`)
  - [x] 4 migrations `destructive` (`20260825000000`, `20260916000000`, `20260917000000`, `20260927000000`) com análise de impacto e **bloqueio permanente**
  - [x] Hashes SHA-256 das 59 idênticos na entrada e na saída (0 DRIFT); nenhum arquivo aplicado, movido, renomeado ou editado; 0 presentes no ledger
  - [x] Manifesto com decisão versionada por entry (`decision`, `evidence_refs`, `reviewed_at`, `reviewed_commit`, `replay_prohibited`) e regra permanente: necessidade futura exige NOVA migration posterior a `20261002000000`
  - [x] Guard `h7p-guard-repo-only.sh` e teste estático fortalecidos (9/9 PASS); guard falha em drift de hash, arquivo ausente, `apply_to_staging=true`, entrada no ledger, decisão/evidência ausente ou distribuição divergente
  - [x] Decisão: **GO homologação para H8-D / NO-GO produção**
- [ ] Backlog performance/RLS (fora de H8): consolidação semântica dos 43 grupos locais / 117 finding-groups de `multiple_permissive_policies`, `unindexed_foreign_keys` (172) e `unused_index` (193)
- [x] H8-D — observabilidade e runbook operacional de homologação: **executada em homologação** (relatórios `restoration/homologacao-h8/04-h8d-observabilidade-runbook.md` e `05-h8-relatorio-final.md`)
  - [x] Suíte única `h8d-healthcheck.sh` + `h8d-healthcheck.sql`: read-only (`BEGIN READ ONLY`, sem DDL/DML, sem `SELECT *`), fail-closed de identidade (`exit 10`), idempotente (fingerprint de negócio idêntico em 3 execuções) e sanitizada (sem DSN/token/chave/certificado/PII)
  - [x] 29 sinais em 8 categorias com status `OK|WARN|CRITICAL|UNKNOWN`, limiar justificado, timestamp UTC e resposta; saída JSON opcional para histórico/CI
  - [x] Runbook: matriz de severidade/responsável/prazo, 13 procedimentos de incidente, política de privacidade e rotinas diária/semanal/mensal e pré/pós-migration
  - [x] Testes estáticos + fixtures OK/WARN/CRITICAL/UNKNOWN (`src/test/security/h8d-healthcheck.static.test.ts`, 25/25 PASS), sem disparo de notificação
  - [x] Sem DDL e sem migration: ledger permanece **658**; 59 repo-only ausentes e íntegras
  - [x] Achado: cron `prune-old-audit-logs` falha por `created_at` em `financial_audit_log` (correta `performed_at`) e aborta as 13 sentenças — nenhuma poda ocorre; sem perda de dados
  - [x] Decisão: **GO operacional em homologação / NO-GO produção**
- [x] H8-E — correção segura do cron `prune-old-audit-logs`: **executada em homologação** (relatório `restoration/homologacao-h8/06-h8e-cron-retention-fix.md`)
  - [x] Achado adicional comprovado: `clientes_audit_log` usa `changed_at` (não `created_at`) — corrigido junto, pois o bloco é atômico e falharia mesmo assim
  - [x] Correção mínima por `cron.alter_job(job_id := 5, …)`; `jobid`/`jobname`/`schedule`/`database`/`username`/`active` preservados; 13 sentenças mantidas atômicas
  - [x] Migration `20261003000000_h8e_fix_prune_audit_logs_performed_at_v1` + rollback nominal fora de `supabase/migrations`; ensaio em transação descartada PASS; ledger **658 → 659**
  - [x] md5 do `command`: `6fcccc17696cc2409fa5afba2a593e78` → `dbc129eaf374196a06f3b911381703da`
  - [x] Manifesto/guard/testes/healthcheck atualizados para ledger 659; 59 repo-only seguem ausentes e íntegras
  - [x] Decisão: **H8-E CONCLUÍDA** — GO técnico em homologação / NO-GO produção
- [x] H8-E (verificação funcional) — **execução antecipada explicitamente autorizada** em 2026-09-08 15:04 UTC: `runid=7138`, `status=succeeded`, `return_message=DELETE 0`, sem erro de coluna; zero registros elegíveis (> 180 dias) antes e depois nas 13 tabelas; agenda restaurada (`15 3 * * *`, `active=true`, md5 `dbc129eaf374196a06f3b911381703da`); ledger permaneceu **659**; falha de 2026-09-08 03:15 UTC preservada como histórica
  - [x] Invariantes revalidados: 648 SECDEF, 0 sem `search_path`, 2 anon, 378 authenticated, 6 cron ativos, 24 views / 23 `security_invoker`
  - [x] Advisors: segurança **393** inalterado (0 ERROR); performance **510** (era 512, por `unused_index` 193 → 191) — variação dinâmica de estatística de uso, **não** estrutural e **não** regressão
- [x] **FASE H8 CONCLUÍDA em homologação (A/B/C/D/E)** — NO-GO produção mantido; promoção depende de B1, B3, B4 e do backlog legado de performance/RLS
- [ ] Backlog pós-H8-E — separar as 13 sentenças do bloco de retenção em execuções independentes (muda atomicidade; exige fase própria)
- [x] H8 consolidada: relatório final `restoration/homologacao-h8/05-h8-relatorio-final.md` — ledger 658, Advisors 512/393 (0 ERROR), invariantes estáveis, blockers B1/B3/B4 abertos
- [ ] H8 permanece separada da promoção a produção; nenhuma migration H8 aplicada nesta rodada
- [x] H8-B — consolidação de políticas RLS e revisão de RPCs `SECURITY DEFINER`: **executada no staging** (relatório `restoration/homologacao-h8/02-h8b-policies-rpcs.md`)
  - [x] Inventário integral das 146 ocorrências de `multiple_permissive_policies` (44 grupos locais / 117 expandidos) com `USING` e `WITH CHECK` completos
  - [x] H8-B1 `20261002000000_h8b1_redundant_select_policy_v1` — única consolidação provada (`cliente_documentos`: policy `SELECT` subsumida pela `FOR ALL` idêntica)
  - [x] Métricas separadas: policies em `public` 541 → **540** e grupos locais 44 → **43** (métricas próprias); Advisor oficial `multiple_permissive_policies` **permaneceu 146** — o grupo `cliente_documentos/authenticated/SELECT` ainda tem duas policies, então o finding persiste
  - [x] Remanescentes: **43 grupos locais** + **117 grupos expandidos/finding-groups oficiais** = 146 ocorrências do Advisor — **movidos para backlog de performance/RLS futuro** (fora do escopo da H8-C, que é reconciliação de ledger)
  - [x] Revalidação independente no Supabase oficial de homologação (2026-09-04, após `c322448d258601b4b035f0becca483f968cddb33`): performance **512** (147 WARN + 365 INFO) e segurança **393** (383 WARN + 10 INFO + 0 ERROR) — **delta zero**, ganho apenas estrutural
  - [x] 648 `SECURITY DEFINER` auditadas: 0 sem `search_path`, 0 grant PUBLIC, 2 anon por desenho, 378 `authenticated` (allowlist H7O sem drift) — **nenhuma revogação insegura**
  - [x] Ensaio rollback → reapply em transação descartada; rollback nominal fora de `supabase/migrations`; auditoria em `private.h8a_policy_audit`
  - [x] Ledger 657 → **658**; 59 repo-only continuam ausentes (manifesto e teste estático atualizados para 658)
  - [x] Postcheck H7O PASS, harness 300 + 136 PASS, typecheck/build/Vitest 3.337 PASS / 0 FAIL / 4 skip, scans OK, binding revalidado
  - [x] Decisão: **GO homologação para H8-C / NO-GO produção** — redução estrutural segura, sem redução de findings do Advisor
