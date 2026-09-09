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
- [x] Correção de drift de binding (2026-09-08) — `.env` e `src/integrations/supabase/types.ts` restaurados exatamente do baseline aprovado `6c08a8f8`; `client.ts` preservado (sem divergência real). Nenhuma escrita em banco. Gates reexecutados: binding OK, guard 59 PASS, postcheck H7O PASS, typecheck 0 erro, build OK, Vitest 3.364 PASS / 0 FAIL / 4 skip. Leitura confirmou ledger 659, job 5 `15 3 * * *` ativo, md5 `dbc129eaf374196a06f3b911381703da`, `runid=7138 succeeded`; evidências da H8-E inalteradas. **H8 CONCLUÍDA em homologação / NO-GO produção** (B1, B3, B4 e backlog legado)

## H9-A — Gate de preparação segura para produção (somente auditoria e documentação) — 08/09/2026
- [x] **H8 CONCLUÍDA** em homologação (A–E); **produção NO-GO**
- [x] **H9-A CONCLUÍDA — apenas planejamento**: nenhuma alteração em banco, código funcional, binding, migrations, cron, Storage ou Auth
- [x] Documentos: `restoration/homologacao-h9/00-h9a-inventario-e-plano.md` e `restoration/homologacao-h9/01-h9a-matriz-testes-e-promocao.md`
- [x] Estado lido: ledger **659** (última `20261003000000`), 6 cron ativos, jobid 5 `15 3 * * *` md5 `dbc129eaf374196a06f3b911381703da`
- [x] Inventário nominal: B1/B3/B4; **10** tabelas RLS sem policy = 7 `public` + 3 `private` (todas com 0 grants de API e `SELECT` negado para anon/authenticated → fail-closed; composição resolvida, sem pendência); 2 RPCs `anon` (`rpc_validar_comprovante_entrega`, `rpc_validar_rastreio_produto`, ambas por token em rotas públicas); 378 SECDEF `authenticated` agrupadas por domínio (`search_path` fixo confirmado; autorização interna a comprovar por domínio na onda 3); 2 extensões em `public` (`btree_gist`, `pg_net`); **172** FKs sem índice priorizadas por uso; **146** achados / **43** grupos de policies permissivas; índice duplicado de `formulacoes` (2 constraints UNIQUE equivalentes); **191** índices sem uso com estatística desde 2026-07-15 (insuficiente — sem autorização de remoção)
- [x] 6 ondas de remediação, matriz de testes por perfil (desktop/mobile), checklist de promoção com PITR/dry-run/abort/rollback e requisito de grants+RLS explícitos para nova tabela em `public`
- [ ] Gates externos pendentes: **B1** (proteção contra senha vazada — responsável: administrador do projeto), **B3** (parecer fiscal/contábil — responsável: responsável fiscal), **B4** (autorização humana de promoção — responsável: sponsor)
- [x] Correção obrigatória H9-A (2026-09-08): drift introduzido durante a geração H9-A, detectado na verificação independente e restaurado do baseline `df8bd791` (`.env` idêntico ao baseline; `client.ts`/`types.ts` com diff zero). Binding gate OK (`ikaauvsflpmamgxmkhoq`), guard H7P PASS, postcheck H7O PASS. Nenhuma escrita em banco. Commit-base autoritativo = `df8bd7919c32398dec8fed41332fccb7770e1e02`
- [x] Decisão: **GO para H9-B (onda 2) / NO-GO produção**

### Fase H9-B — Segurança crítica comprovada (homologação)
- [x] Binding restaurado do commit autoritativo `f5071fe0` (drift automático de `.env` detectado no início e registrado); binding gate OK `ikaauvsflpmamgxmkhoq`
- [x] `rpc_validar_comprovante_entrega`: `SECURITY DEFINER`, `search_path` fixo, sem SQL dinâmico, rate-limit (token 10/60s, origem 30/60s, global 600/60s) **antes** da leitura, payload sem PII, respostas idênticas para token nulo/inválido/inexistente — **sem vulnerabilidade**
- [x] `rpc_validar_rastreio_produto`: **vulnerabilidade comprovada** — token inexistente gravava linha em `produto_etiqueta_consultas` sem qualquer limite e sem incrementar contadores
- [x] Correção mínima `20261004000000_h9b1_rate_limit_rastreio_v1` (idempotente, reversível, só homologação) + rollback nominal em `restoration/homologacao-h9/h9b-rollbacks/`; teste: 14 chamadas → 10 linhas e depois `rate_limited`; rollback→reapply comprovado
- [x] 10 tabelas RLS sem policy (7 `public` + 3 `private`) confirmadas fail-closed: 0 policies e 0 privilégios S/I/U/D para `anon` e `authenticated`; schema `private` sem USAGE para papéis de API; negação por papel testada
- [x] `_f42_harness_fixtures` e `_fiscal_staging_marker` marcadas como exclusivas de staging — **não promover**
- [x] Gates: binding OK, guard 59 PASS, postcheck H7O PASS, testes estáticos/T2/T6, typecheck, build e regressão PASS; ledger 659 → **660**; Advisors inalterados (nenhuma tabela/policy/índice/grant criado)
- [x] Limpeza pós-teste com alvos exatos: 13 registros sintéticos de `produto_etiqueta_consultas` (IDs 19–31) e 5 contadores sintéticos de `private.public_validation_rate_counters` removidos; verificação final com **zero remanescentes**
- [x] Zero acesso à produção `navfzbwgwzruipouyfnk`
- [ ] Pendentes: **B1**, **B3**, **B4**; autorização interna das 378 SECDEF `authenticated` a comprovar na **H9-C**
- [x] Decisão: **GO para H9-C / NO-GO produção**

### Fase H9-C — SECURITY DEFINER executáveis por `authenticated` (homologação)
- [x] Binding restaurado do commit autoritativo `ed755d2e` (`.env` apontava para projeto indevido; `types.ts` truncado em 2.052 → 21.850 linhas); HEAD interno observado `a9312005` ≠ commit solicitado, divergência registrada; binding gate OK `ikaauvsflpmamgxmkhoq`
- [x] Inventário determinístico TSV de **378** funções `public` `SECURITY DEFINER` com EXECUTE para `authenticated` (18 campos, MD5 do corpo) em `restoration/homologacao-h9/h9c-inventario/`; `search_path` fixo 378/378, grant `PUBLIC` 0
- [x] Classificação por domínio: 25 admin, 64 financeiro, 38 fiscal, 65 B2B/cliente, 186 operação/relatório; evidência declarada sem sobrealegação (84 com guarda antes da primeira escrita, 106 sem escrita não auditadas em profundidade, 186 `PENDENTE_EVIDENCIA` para onda posterior)
- [x] Auditoria profunda das 32 funções de escrita dos domínios A–E por ordenação guarda × primeira operação sensível; `rpc_create_financial_title` e `rpc_entrega_registrar_conferencia_v1` confirmadas seguras (falso positivo da heurística); SQL dinâmico de `rpc_create_financial_title` e `fn_cockpit_is_hml_environment` sem injeção
- [x] **Duas vulnerabilidades comprovadas** em sessão `authenticated` de baixo privilégio (transação revertida): `check_partner_order_sla()` executou escrita administrativa sem qualquer autorização; `rpc_fiscal_xml_record_v1(uuid,text,jsonb)` alcançou a máquina de estados fiscal sem verificar usuário/papel
- [x] Consumidores reais confirmados: cron `check-partner-order-sla` (jobid 2, `*/30 * * * *`, como `postgres`) e Edge Function `fiscal-xml-engine` (cliente `service_role`); nenhuma chamada em `src/`
- [x] Correção mínima e reversível `20261005000000_h9c1_least_privilege_secdef_v1` — revoga EXECUTE de `authenticated`/`anon`/`PUBLIC` e preserva `service_role`; rollback nominal em `restoration/homologacao-h9/h9c-rollbacks/`
- [x] Desvio registrado: escrita direta em `supabase/migrations/` passou a ser bloqueada pela plataforma; forward versionado em `restoration/homologacao-h9/h9c-forwards/` com registro próprio no ledger
- [x] Verificação: ACLs reduzidas a `{postgres,service_role}`, teste negativo `42501` para ambas, teste positivo `service_role` OK, SECDEF `authenticated` **378 → 376**, ledger **660 → 661**, cron 2 e 5 ativos e inalterados, H9-B intacta, zero fixtures remanescentes
- [x] Zero acesso à produção `navfzbwgwzruipouyfnk`
- [ ] Pendentes: **B1**, **B3**, **B4**; 186 funções do domínio F e 106 funções sem escrita a auditar em onda posterior
- [x] Decisão: **GO homologação / NO-GO produção**
- [x] Retificação final H9-C (08/09/2026, somente repositório/documentação; **zero escrita no banco**): manifesto H7P atualizado para `ledger_versoes` **661** e regra futura "posterior a `20261005000000`" (bloco `h8c` incluso), preservando as 59 entries/hashes/classificações/bloqueios; guard `h7p-guard-repo-only.sh` passa a exigir 661; teste estático H7P alinhado
- [x] Novo rastreio de forward aplicado fora da pasta padrão: `restoration/homologacao-h9/h9c-applied-forwards.json` (versão, caminho, SHA-256 do forward e do rollback, ambiente, aplicada em staging, obrigatória no bundle de promoção, disjunta das 59 repo-only) + gate estático `src/test/security/h9c-applied-forwards.static.test.ts`
- [x] Relatório H9-C retificado: Advisors de segurança **391** = 10 RLS sem policy + 2 extensões em `public` + 2 anon SECDEF + 376 authenticated SECDEF + 1 leaked-password; desempenho **510** inalterado; declarado que a promoção **não** pode depender de varrer apenas `supabase/migrations/` e que o guard H7P **não** cobre o forward fora da árvore (quem cobre é o novo gate)

### Fase H9-D — Funções operacionais, relatórios e exposições de leitura (homologação)
- [x] Binding restaurado do commit-base `5ae6f0bf` (`.env` apontava para projeto indevido; `types.ts` 2.052 → 21.850 linhas); gate de binding OK `ikaauvsflpmamgxmkhoq`; diff líquido zero nos três arquivos
- [x] Inventário determinístico das **376** funções `public` `SECURITY DEFINER` executáveis por `authenticated`, com ACL/herança, `search_path`, objetos sensíveis, DML, SQL dinâmico, posição de guarda × primeiro acesso sensível, MD5 e evidência — `restoration/homologacao-h9/h9d-inventario/`
- [x] **Retificação metodológica (rodada 2)**: regex passa a valer apenas como TRIAGEM; separação obrigatória entre universo bruto **376**, **84** herdadas da H9-C (fora do escopo profundo) e **escopo profundo H9-D = 292**
- [x] Classificação do escopo profundo (soma 292): **153 AUTH_COMPROVADA** com evidência por assinatura (corpo lido, guarda textual e cadeia transitiva), **4 NAO_APLICAVEL**, **1 EXPOSICAO_COMPROVADA_CORRIGIDA**, **134 PENDENTE_EVIDENCIA** em lotes `H9-D-L1..L5`
- [x] **Exposição comprovada** (rodada 1, preservada): `fn_run_recurring_generation()` era executável por qualquer `authenticated` sem papel financeiro, permitindo enumerar templates recorrentes ativos e provocar escritas em `recurring_generation_log` e `financial_audit_log`
- [x] Correção `20261006000000_h9d1_authz_recurring_generation_v1`: guarda `is_financial_staff(auth.uid())` no topo, preservando cron jobid 1 (sem JWT); forward/rollback em `restoration/homologacao-h9/h9d-forwards/` e `h9d-rollbacks/`; ledger **661 → 662**
- [x] Verificações da rodada 2 (somente leitura, transações revertidas): cadeia BI de visitas comprovada segura via `private.h7n_fluxo_visita_tecnica()` (usuário sem papel → 0 linhas); cadeia de entrega via `fn_entrega_assert_confirmador`; validações públicas com rate-limit antes de qualquer leitura; 16 funções sem qualquer referência de autorização lidas uma a uma
- [x] Quatro helpers novos `private.h7n_*` executáveis por `authenticated` identificados e lidos (filtram papel/tenant internamente); ficam para reconciliação formal do universo
- [x] Comentário aritmético do gate H7P corrigido para explicitar `+1 H9-D1` fechando em 662; gate `src/test/security/h9d-inventario.static.test.ts` reescrito para rejeitar evidência genérica e exigir 84 + 292
- [x] Nenhuma escrita no banco na rodada 2: ledger permanece **662**; crons, ACL, RLS, Auth, Storage, certificado, frontend e as 59 repo-only intocados; zero acesso à produção `navfzbwgwzruipouyfnk`
- [x] **Rodada 3 (lote H9-D-L1)**: gerador v2 passa a chavear decisões pela **assinatura canônica completa** (nunca pelo nome, sem colisão por sobrecarga), rejeita evidência vaga e não promove função por presença em readset
- [x] **46 assinaturas** com evidência vaga ("delegação a função guardada") rebaixadas para `PENDENTE_EVIDENCIA`; **30 assinaturas do lote L1** auditadas em profundidade (corpo integral, ACL, `search_path`, cadeia transitiva, `auth.uid()`/papel/tenant, NULL fail-closed, callsites, BOLA/IDOR e SQL dinâmico) → dossiê `h9d-inventario/dossie-l1.json`
- [x] Nova aritmética do escopo (soma 292): **137 AUTH_COMPROVADA**, **4 NAO_APLICAVEL**, **1 EXPOSICAO_COMPROVADA_CORRIGIDA**, **150 PENDENTE_EVIDENCIA** em lotes `H9-D-L2..L6`
- [x] Gate `src/test/security/h9d-inventario.static.test.ts` exige exatamente as 30 assinaturas do L1, unicidade, evidência específica e ausência de colisão por sobrecarga
- [x] Nenhuma escrita no banco na rodada 3: ledger **662**, SECDEF `authenticated` **376** / `anon` **2**, crons 1/2/5/8/9/18 ativos, guarda e ACL de `fn_run_recurring_generation()` preservadas, zero fixtures criadas
- [x] **Rodada 4 (retificação H9-D-L1)**: IDOR/BOLA **comprovado** em `create_technical_visit_secure(...)` — a idempotência por `p_client_uuid` precedia a autorização e devolvia `registro_id` alheio (`idor_oracle_confirmed=true`); reclassificada de `AUTH_COMPROVADA` para `EXPOSICAO_COMPROVADA_CORRIGIDA`
- [x] Forward reversível `20261007000000_h9dl1_authz_before_idempotency_visit_v1` aplicado **somente na homologação** (ledger **662 → 663**, aplicação única) com rollback byte a byte; ordem passa a ser auth → admin → vínculo `execute`/`manage` → idempotência escopada a cliente autorizado + `created_by = auth.uid()`; colisão fora de escopo falha genericamente (`42501 request_rejected`); assinatura, defaults, retorno, validações, insert, auditoria, `search_path` e ACL (`postgres`/`authenticated`/`service_role`) preservados
- [x] Provas dinâmicas em transação revertida (T1 ataque, T2 sem vínculo, T3 criação legítima, T4 retry idempotente, T5 `client_uuid` de outro ator) — antes/depois em `h9d-inventario/prova-idor-*.log`; zero fixtures remanescentes
- [x] Dossiê L1 migrado para fingerprints reproduzíveis do catálogo vivo (`definition_md5 = md5(pg_get_functiondef(oid))`, `definition_len`, `acl`, `proconfig`), com a consulta SQL documentada; gate Vitest exige igualdade exata com a lista explícita das 30 assinaturas canônicas
- [x] Evidência de `fn_generate_recurring_title` retificada: guarda condicional (NULL apenas no caminho interno do cron sem JWT), não é fail-closed genérico
- [x] Nova aritmética do escopo (soma 292): **136 AUTH_COMPROVADA**, **4 NAO_APLICAVEL**, **2 EXPOSICAO_COMPROVADA_CORRIGIDA**, **150 PENDENTE_EVIDENCIA**
- [ ] Pendentes: **B1**, **B3**, **B4**; evidência específica das **91** assinaturas dos lotes `H9-D-L4..L7`; reconciliação dos quatro `private.h7n_*`; menor privilégio de `get_cliente_id_for_user`, `get_cliente_ids_for_user`, `fn_catalogo_preco_canonico`, `fn_fiscal_company_crt`, `fn_microorganism_regulatory_facts` e `fn_onfarm_scope_lote`
- [x] **Rodada 5 (lote H9-D-L2)**: 30 assinaturas auditadas com corpo vivo, ACL, `search_path`, cadeia transitiva, callsites e prova dinâmica em transação revertida
- [x] **12 exposições comprovadas** (BOLA em `get_cliente_id_for_user`, oráculo de papel em nove guardas por UID, leitura interna sem guarda em `fn_fiscal_company_crt` e `fn_microorganism_regulatory_facts`) corrigidas pelo forward reversível `20261008000000`; ledger 663 → 664; SECDEF mantido em 376/2
- [x] Nova aritmética do escopo (soma 292): **153 AUTH_COMPROVADA**, **4 NAO_APLICAVEL**, **14 EXPOSICAO_COMPROVADA_CORRIGIDA**, **121 PENDENTE_EVIDENCIA** em lotes `H9-D-L3..L7`
- [ ] `fn_catalogo_preco_canonico(uuid,uuid,text,numeric)`: preço canônico visível a qualquer `authenticated`; decisão de visibilidade comercial pendente do responsável de negócio
- [x] Decisão: **H9-D CONTINUA (NO-GO para encerramento) / NO-GO produção**; H9-E não iniciada; L3 só após auditoria independente do L2
- [x] **Rodada 6 (lote H9-D-L3)**: 30 assinaturas auditadas com corpo vivo, ACL, `proconfig`, cadeia transitiva, callsites e prova dinâmica em transação revertida; dossiê `h9d-inventario/dossie-l3.json` com fingerprint reproduzível
- [x] **6 exposições comprovadas e corrigidas**: BOLA de tenant em `get_cliente_ids_for_user`, oráculos de papel/vínculo em `has_active_user_cliente_access`, `is_financial_staff`, `is_delivery_staff` e `pode_acessar_recomendacao`, e bypass de RLS de preço em `fn_catalogo_preco_canonico` (produtor lia preço interno sem acesso a `catalogo_volumes`)
- [x] Forward `20261009000000_h9dl3_authz_uid_scope_and_internal_price_v1` aplicado **somente na homologação** (ledger 664 → 665), com rollback simétrico e ensaio rollback→reaplicação sem divergência de fingerprint
- [x] 24 assinaturas restantes do L3 classificadas **AUTH_COMPROVADA** com fail-closed provado dinamicamente; nova aritmética do escopo (soma 292): **177 AUTH_COMPROVADA**, **4 NAO_APLICAVEL**, **20 EXPOSICAO_COMPROVADA_CORRIGIDA**, **91 PENDENTE_EVIDENCIA**
- [x] Riscos funcionais pré-existentes registrados (não são exposições): enum `laboratorio` inexistente em `lab_request_replanning` e colunas inexistentes na família `get_report_*`
- [x] Gate L3 no `src/test/security/h9d-inventario.static.test.ts` (set exato das 30, unicidade, sem overload/herança, interseção L2 declarada), manifesto H7P e guard atualizados para ledger 665
- [x] Decisão: **H9-D CONTINUA (NO-GO para encerramento) / NO-GO produção**; H9-E e o lote L4 não iniciados
- [x] **Rodada 7 (retificação funcional H9-D-L3)**: reproduzidos em homologação `42703 column i.amount` nos três relatórios, `42703 column ar.cliente_id` em `get_report_nfe_pending`, `22P02 enum app_role: laboratorio` em `lab_request_replanning` e escopo devolvendo 5/5 vínculos (inativo, revogado, futuro, expirado, ativo)
- [x] Forward reversível `20261010000000_h9dl3r_report_columns_lab_role_active_scope_v1` aplicado **somente na homologação** (ledger 665 → 666): colunas vivas + fórmula canônica de saldo nos quatro relatórios, remoção do valor inexistente do enum sem ampliar papéis (`administrador|producao|gestor`) e exigência de vínculo `is_active`/`revoked_at IS NULL`/vigência em `get_cliente_ids_for_user`, `get_cliente_id_for_user` e `pode_acessar_recomendacao`
- [x] Provas depois: staff financeiro lê os quatro relatórios; produtor recebe `Acesso negado`/`forbidden`; BOLA cross-uid devolve `{}`/`NULL`; catálogo pós-L3 intacto (views 8/25 linhas, `fn_catalogo_preco_canonico` negada); ensaio rollback→reaplicação com 0 divergências de fingerprint; zero fixtures remanescentes
- [x] Classificações do escopo profundo **inalteradas** (177 / 4 / 20 / 91); manifesto H7P, `h9c-applied-forwards.json`, dossiês L2/L3, inventário e novo gate `src/test/security/h9dl3r-report-columns-active-scope.static.test.ts` atualizados para ledger 666
- [x] Riscos que estavam registrados aqui foram resolvidos na rodada 8: `get_report_customer_statement(uuid,date,date)` corrigido pelo forward `20261011000000`; a suposta divergência de 10 de 58 parcelas era artefato de comparar apenas `is_reversal=false` — pela soma líquida há **0 divergências reais** (58/58)
- [x] Decisão: **H9-D CONTINUA (NO-GO para encerramento) / NO-GO produção**; L4 e H9-E não iniciados
- [x] **Rodada 8 (retificação 2 do H9-D-L3)**: `get_report_customer_statement(uuid,date,date)` reproduzia `42703 column "valor_total" does not exist` para staff financeiro (referenciava `entregas.valor_total`, `entregas.data_entrega` e `i.amount`), derrubando também `get_report_accountability` e as telas de Extrato e Prestação de Contas
- [x] Forward `20261011000000_h9dl3r2_customer_statement_live_columns_v1` aplicado só em homologação: colunas vivas, `delivered` documentado como soma de títulos DISTINTOS vinculados a entregas confirmadas (sem estimar entregas sem vínculo, `delivered_basis`/`delivered_unlinked_count` expostos), saldo canônico, validação de período (`22023`), contrato JSON/guarda/ACL/`search_path` preservados, sem `PUBLIC`/`anon`, sem N+1 nem `SELECT *`
- [x] Integridade financeira: **0 divergências reais** — `received_amount` bate com a soma líquida (originais + estornos) em **58/58**; os 10 estornos têm todos `reversed_payment_id` (`estornos_sem_par=0`). Contrato de `fn_reverse_payment` auditado (append-only, espelho negativo, idempotente por `reversed_payment_id`) e gatilho `trg_recalc_ar_inst` → `fn_recalc_receivable_installment` grava o líquido. **Nenhum dado financeiro alterado**; relatório em `h9d-inventario/relatorio-integridade-received-amount.md`
- [x] Provas: admin/financeiro com JSON reconciliável, `Acesso negado` antes da leitura, cliente inexistente e `customer_id` nulo com zeros, período invertido `22023`, dupla contagem impossível (`uq_entregas_receivable_id`), rollback→reaplicação com fingerprint idêntico e zero fixtures
- [x] Ledger **667** (última `20261011000000`), SECDEF 375/2, crons 1/2/5/8/9/18; classificações do escopo profundo inalteradas (177 / 4 / 20 / 91)
- [x] Riscos da rodada 8 resolvidos na rodada 9 pelo forward `20261012000000`
- [x] **Rodada 9 (retificação 3 do H9-D-L3)**: reproduzido `42703 column e.data_entrega does not exist` em `get_report_deliveries_billing_status` e a superestimativa de `3000.00` em `get_report_monthly_financial` (bruto `15450.00` vs líquido `12450.00`)
- [x] Forward `20261012000000_h9dl3r3_deliveries_report_and_net_cash_v1` aplicado **somente em homologação** (ledger 667 → 668): colunas vivas no relatório de entregas, `total_value` exclusivamente do `accounts_receivable` vinculado e válido (`ar.customer_id = e.cliente_id`, `status <> 'CANCELED'`), `billed` refletindo vínculo válido, e regime **caixa líquido** em `get_report_monthly_financial`/`get_report_customer_statement` com `received_gross`/`paid_gross`/`cash_basis` adicionados sem quebrar consumidores
- [x] `fn_financial_inconsistencies` **não alterada**: a regra viva já exclui originais estornados por `rp2.reversed_payment_id = rp.id`; documentação falsa retificada
- [x] Provas: entregas 42 linhas/16 faturadas/`24000.00`; mensal `received 12450.00`, `by_category` somando o mesmo, `net_cash -550.00`; título cancelado, sem título e de outro cliente ⇒ `0`/`billed=false`; `Acesso negado` para não privilegiado; `22023` em período inválido; rollback→reaplicação sem divergência de definição/ACL; fingerprint canônico verificável `22ad484f0edc6233c2eecdbdd4da1334`; zero fixtures; nenhum dado financeiro alterado
- [x] Ledger **668** (última `20261012000000`), SECDEF 375/2, crons 1/2/5/8/9/18; classificações do escopo profundo inalteradas (177 / 4 / 20 / 91)
- [ ] Risco remanescente: composição própria de `get_report_accountability(jsonb)` e o regime caixa de `get_financial_cashflow`/`get_financial_dre_summary` não reauditados
- [x] Decisão: **H9-D CONTINUA (NO-GO para encerramento) / NO-GO produção**; L4 e H9-E não iniciados

- [x] Adendo de auditoria independente do L4 (`SELECT *` antes de `_assert_visita_editavel`, oráculo confirmado com o UUID real `b906cbf7-c7b1-4736-98c2-a5f281238068`): tratado pelo mesmo forward `20261013000000`, com reprova antes/depois no UUID indicado e rollback simétrico já incluído

- [x] H9-D-L4 retificação (20261014000000, ledger 670): exclusões de diagnóstico e recomendação de visita passam a resolver/autorizar em consulta única escopada ao chamador; UUID inexistente e recurso alheio ficam indistinguíveis também para usuários de domínio. Provas antes/depois com identidades reais em transação revertida, rollback simétrico e fingerprint reproduzido. Produção não tocada; L5/H9-E não iniciados.
- [x] H9-D-L4 retificação 2 (20261015000000, ledger 671): `rpc_converter_visita_em_os` passa a resolver/autorizar em consulta escopada; inexistente e alheio retornam a mesma mensagem genérica. Também restaurado o contrato de tipos do staging (`types.ts`), que causava 12 falhas na suíte.
- [x] H9-D-L4 retificação documental (sem banco): inventário SECDEF, dossiê L4 (`forward_aplicado` com as três versões e fingerprint combinado vivo `e5d1ca64…`), manifesto H7P (`ledger_versoes` 671 + nota 670 → 671) e títulos de teste alinhados ao estado vivo. Ledger permanece 671; produção NO-GO.
- [x] **H9-D-L5** (20261016000000, ledger 672): 30 assinaturas auditadas com corpo vivo, ACL, `proconfig`, cadeia transitiva, callsites e provas dinâmicas em transação revertida — **27 AUTH_COMPROVADA + 3 EXPOSICAO_COMPROVADA_CORRIGIDA**. Oráculo de existência eliminado em `rpc_enviar_visita_aprovacao`, `rpc_get_visita_workspace` e `rpc_get_my_visit_by_client_uuid`: recurso inexistente e recurso alheio ficam indistinguíveis para identidades sem escopo, com acesso legítimo preservado.
- [x] Nova aritmética do inventário (376): **84 herdadas + 231 AUTH_COMPROVADA + 26 EXPOSICAO_COMPROVADA_CORRIGIDA + 4 NAO_APLICAVEL + 31 PENDENTE_EVIDENCIA**; manifesto de applied-forwards em 12 entradas e guard/manifesto H7P em ledger 672.
- [x] Decisão: **L5 CONCLUÍDO**; **H9-D CONTINUA** com 31 pendentes; produção **NO-GO**; L6/H9-E não iniciados.

- [x] **H9-D-L6** (20261017000000, ledger 673): 30 assinaturas auditadas por corpo vivo, ACL, `proconfig`, cadeia transitiva, callsites e provas dinâmicas em transação revertida — **26 AUTH_COMPROVADA + 4 EXPOSICAO_COMPROVADA_CORRIGIDA**. Oráculo de existência eliminado em `rpc_realizar_checkin_visita`, `rpc_realizar_checkout_visita`, `rpc_upsert_diagnostico_visita` e `rpc_salvar_campo_visita` pelo novo helper `public._visita_scope_ok(uuid,uuid)` (EXECUTE só para `service_role`), com assinaturas, retornos, callsites e idempotência preservados.
- [x] Nova aritmética do inventário (376): **84 herdadas + 257 AUTH_COMPROVADA + 30 EXPOSICAO_COMPROVADA_CORRIGIDA + 4 NAO_APLICAVEL + 1 PENDENTE_EVIDENCIA**; manifesto de applied-forwards em 13 entradas e guard/manifesto H7P em ledger 673. Catálogo vivo mantém SECDEF 375/2, zero SECDEF sem `search_path` e crons 1/2/5/8/9/18.
- [x] Risco funcional resolvido na L6R: `rpc_realizar_checkout_visita` comparava `client_uuid = p_client_uuid::text` contra coluna `uuid` e falhava fechada com `42883`; o forward `20261018000000` passou a comparar `uuid = uuid`, preservando assinatura, retorno, gate de escopo, auditoria e idempotência.
- [ ] Advisors gerenciados não medidos por mim (a ferramenta disponível pode atingir outro projeto): valores de referência informados externamente — segurança 390 (baseline exato) e performance 507, com −1 `unused_index` (188 vs 189) e demais 172/146/1; verificação própria feita no catálogo vivo, sem categoria nova.
- [x] Decisão: **L6 CONCLUÍDO**; resta **1 pendente** (`start_technical_visit_secure`, reservada à L7); produção **NO-GO**; L7/H9-E e promoção não iniciados.

- [x] **H9-D-L6R** (20261018000000, ledger 673 → 674, ocorrência única): retificação de rastreabilidade, guard e defeito funcional. Arquivo `20261017000000` reconstituído no conteúdo histórico da primeira aplicação (hotfix não versionado de REVOKE `anon`/`authenticated` declarado explicitamente no manifesto, não escondido) e revogação regularizada de forma versionada pela 180, que também corrige o checkout para comparação UUID tipada.
- [x] Guard e manifestos em **674**: `h9c-applied-forwards.json` com 14 entradas e hashes reais (`applied_at=2026-09-09`), `h7p-repo-only-manifest.json` e `h7p-guard-repo-only.sh` corrigidos de 672 para 674, 59 migrations repo-only intactas em quarentena.
- [x] Provas no staging: recurso alheio × inexistente indistinguíveis nas 4 RPCs (42501), helper não executável por `anon`/`authenticated`/PUBLIC e executável por `service_role`, checkout legítimo sem `42883`, resíduo zero, ensaio de rollback + reaplicação apenas em transação revertida.
- [x] Decisão: **L6R CONCLUÍDA**; produção **NO-GO**; L7, H9-E e promoção não iniciados.
- [x] **H9-D-L7** (20261019000000, ledger 674 → 675, ocorrência única): fechada a última assinatura pendente, `start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid)`. Comprovados dinamicamente oráculo de existência (`registro_not_found` 22023 × `not_visit_owner` 42501) e BOLA/IDOR na idempotência por `client_uuid` (retornava `checkin_id` de terceiro). Correção mínima: `_visita_scope_ok` antes de qualquer leitura e idempotência escopada ao autor do check-in ou administrador, preservando assinatura, retorno, ACL, `search_path`, transições, autoria e auditoria.
- [x] Incidente declarado: o primeiro preflight efetivou forward+rollback fora de transação (artefatos com `BEGIN/COMMIT` próprios); ledger e dados intactos, efeito residual apenas `CRLF`→`LF`, revertido com rollback fiel (`e627fdff…`) antes da aplicação única.
- [x] Inventário H9-D fecha por derivação: 376 = 84 herdadas + 292 do escopo profundo (**257 AUTH_COMPROVADA + 31 EXPOSICAO_COMPROVADA_CORRIGIDA + 4 NAO_APLICAVEL + 0 PENDENTE_EVIDENCIA**).
- [x] Risco aberto (preexistente, fora do escopo): trigger `validate_registro_status_transition` bloqueia `rascunho → em_andamento` no check-in inicial; reproduzido igualmente na definição pré-L7, logo não é regressão da L7.
- [x] Decisão: **H9-D CONCLUÍDA — GO em homologação**; produção **NO-GO**; H9-E e promoção não iniciados.

