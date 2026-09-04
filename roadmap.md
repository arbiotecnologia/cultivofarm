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
