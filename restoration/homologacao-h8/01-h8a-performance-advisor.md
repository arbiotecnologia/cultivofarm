# H8-A — Otimização controlada do Advisor de performance (staging)

**Escopo executado:** exclusivamente Lovable + Supabase de homologação `ikaauvsflpmamgxmkhoq`.
**Produção `navfzbwgwzruipouyfnk`:** não consultada, não alterada, não promovida. Nenhum documento fiscal emitido.
**Preservados integralmente:** H7L, H7N, H7O, H7P, H7Q. Bloqueios externos B1, B3 e B4 permanecem abertos.

## 1. Gates de entrada

| Gate | Resultado |
| --- | --- |
| `check-frontend-binding.sh` | ABORT inicial (`.env` regenerado para o backend Cloud) → `.env` e `types.ts` restaurados byte a byte do baseline `6c08a8f8` (21.850 linhas) → **OK staging** |
| `h7p-guard-repo-only.sh` | OK — 59 migrations repo-only íntegras e ausentes do ledger |
| Ledger no início | 654 versões |

> O binding sofreu drift novamente no meio da rodada (regeneração automática do backend Cloud) e foi restaurado do mesmo baseline, com revalidação no encerramento.

## 2. Baseline e alvos

| Categoria | Baseline oficial | Ação H8-A |
| --- | --- | --- |
| `duplicate_index` | 28 WARN | H8-A1 — resolvido (resta 1 grupo legítimo) |
| `auth_rls_initplan` | 436 WARN | H8-A2 — resolvido (0 restantes) |
| `multiple_permissive_policies` | 146 WARN | H8-A3 — apenas redundância literal (2 policies); consolidação semântica fica para H8-B |
| `unindexed_foreign_keys` | 172 INFO | fora de escopo nesta fase |
| `unused_index` | 219 INFO | proibido remover nesta fase — não tocado |

## 3. Subfases aplicadas (ledger 654 → 657)

### H8-A1 — `duplicate_index` (`20261001000000_h8a1_duplicate_index_v1.sql`)
- 32 índices removidos após prova de equivalência normalizada (`pg_get_indexdef` com o nome neutralizado): mesma tabela, mesmas colunas/expressões, mesmo método, opclass, collation, predicado parcial e unicidade.
- Fail-fast: aborta se o alvo não existir, for de PK/constraint, for inválido, ou se o índice mantido não tiver definição idêntica.
- Preservados por decisão explícita: o par de `public.formulacoes` (cada índice sustenta uma constraint distinta) e todos os índices exigidos por verificadores executáveis versionados (`ux_fi_idempotency_key`, `ux_recurring_generation_success`, `idx_produto_etiquetas_lote`, `idx_produto_etiquetas_envase`).
- Auditoria: `private.h8a_index_audit` (32 linhas, schema privado sem grants a `anon`/`authenticated`), com a definição original completa de cada índice removido.
- Rollback: `h8a-rollbacks/20261001000000_h8a1_duplicate_index_v1_rollback.sql`, gerado a partir dessa auditoria.

> Incidente registrado e sanado: a primeira versão do forward continha `BEGIN;/COMMIT;` internos e o `COMMIT` aninhado confirmou um ensaio que deveria ser descartado. O estado foi imediatamente restaurado pelo rollback (`DUP=28`, auditoria zerada, ledger 654) e os wrappers foram removidos antes de qualquer aplicação real. Nenhuma migration entrou no ledger nesse incidente.

### H8-A2 — `auth_rls_initplan` (`20261001010000_h8a2_auth_rls_initplan_v1.sql`)
- **436 policies** normalizadas — exatamente o número do baseline oficial do Advisor.
- Técnica: `ALTER POLICY` (nunca `DROP`/`CREATE`); nome, comando, classe PERMISSIVE e lista de roles (`TO`) permanecem intocados. A única transformação é `auth.uid()` → `( SELECT auth.uid() AS uid)`, escalar e idempotente.
- Prova de equivalência dupla: a expressão é desembrulhada antes e depois e comparada caractere a caractere; qualquer divergência aborta. Pós-condições: 0 policies com avaliação por linha, 0 divergências na auditoria, total de policies inalterado, nenhuma policy restritiva inesperada.
- Não há uso de `auth.role()`, `auth.jwt()` ou `current_setting()` em policies de `public` (0 ocorrências verificadas).
- Ensaio rollback→reapply em transação descartada: 436 → 0 → 436 → 0, convergente.
- Auditoria: `private.h8a_policy_audit` (fase `H8-A2`) com expressão antes/depois; rollback restaura a expressão exata.

### H8-A3 — `multiple_permissive_policies` (`20261001020000_h8a3_multiple_permissive_policies_v1.sql`)
- Removidas apenas **2** policies permissivas literalmente redundantes (mesma tabela, comando, roles e expressão idêntica caractere a caractere; `a OR a ≡ a`):
  - `public.partner_product_prices` → removida `ppp_select`, mantida `partner_product_prices_select`;
  - `public.talhao_safras` → removida `Portal: Ler safras dos talhões acessíveis`, mantida `Authenticated users can read talhao_safras`.
- **Não consolidados:** os demais grupos têm expressões distintas por perfil/rota. Fundi-los alteraria a lógica de autorização e não foi feito apenas para reduzir contagem do Advisor — pendência formal de H8-B, com revisão por domínio.
- Total de policies em `public`: 543 → **541**; grupos com policies idênticas: **0**.
- Ensaio rollback→reapply em transação descartada: convergente.

## 3.1 Leitura oficial do Advisor após H8-A

| Advisor | Antes (H7P/H7Q) | Depois (H8-A) |
| --- | --- | --- |
| Performance — total | 1001 (0 ERROR, 610 WARN, 391 INFO) | **512 (0 ERROR, 147 WARN, 365 INFO)** |
| `auth_rls_initplan` | 436 WARN | **0** |
| `duplicate_index` | 28 WARN | **1** |
| `multiple_permissive_policies` | 146 WARN | 146 WARN — a remoção de 2 policies literalmente redundantes não muda a contagem por tabela×role×ação; pendência de H8-B |
| `unindexed_foreign_keys` | 172 INFO | 172 INFO (fora de escopo) |
| `unused_index` | 219 INFO | 193 INFO (redução colateral da remoção dos índices duplicados) |
| Segurança — total | 393 (0 ERROR, 383 WARN, 10 INFO) | **393 (0 ERROR, 383 WARN, 10 INFO)** — sem novo achado |

Redução mensurável: **1001 → 512 achados de performance (-489)**, sendo -463 WARN, mantendo 0 ERROR e sem qualquer aumento no Advisor de segurança.

## 4. Estado final verificado no staging

```
LEDGER=657
DUP_GROUPS=1            (apenas formulacoes, sustentado por constraints)
INITPLAN=0
SECDEF=648
SECDEF_SEM_SEARCHPATH=0
ANON_SECDEF=2           (por design)
VIEWS=24 INVOKER=23     (exceção interna sem grants)
CRON=6
RLS_SEM_POLICY=7        (fail-closed intencional)
POLICIES_PUBLIC=541
```

| Gate | Resultado |
| --- | --- |
| `h7o-postcheck.sh` | PASS (allowlist 485 sem drift, 2 RPCs anon por design, extensões intocadas) |
| Harness H7O por perfis | **300/300 PASS**, 0 falhas |
| Harness H7N por perfis | **136/136 PASS** |
| `h7p-guard-repo-only.sh` | OK — 59 repo-only bloqueadas |
| `h7n-postcheck.sh` (superseded) | FAIL esperado e pré-existente desde H7O: a allowlist H7N (504 funções) foi substituída pela de H7O (485, com as 19 revogações) e os wrappers privados passaram de 4 para 6. O postcheck vigente é o de H7O, que está PASS; o harness H7N segue 136/136 PASS. H8-A não alterou nenhuma função nem grant. |
| Fiscal | `HOMOLOGATION | tpAmb=2 | production_enabled=false | DRAFT | NOT_READY` |
| Typecheck (`tsgo`) | PASS |
| Build (Vite/PWA) | PASS |
| Vitest completo | PASS |
| Binding final | OK — staging `ikaauvsflpmamgxmkhoq` |

## 5. Rastreabilidade e reconciliação do repositório

- Forwards em `restoration/homologacao-h8/h8a-forwards/` e cópias versionadas em `supabase/migrations/` (mesmas três versões do ledger).
- Rollbacks mantidos fora de `supabase/migrations`, em `restoration/homologacao-h8/h8a-rollbacks/`.
- Após um rollback do workspace, os três forwards foram reconciliados a partir das instruções exatas registradas no ledger do staging (`supabase_migrations.schema_migrations.statements`) e o rollback de H8-A1 foi regenerado da auditoria `private.h8a_index_audit`. O conteúdo é semanticamente idêntico ao aplicado; **nenhuma migration foi reaplicada** e nenhuma nova foi criada.
- `restoration/homologacao-h7/h7p-repo-only-manifest.json` e `src/test/security/h7p-repo-only-migrations.static.test.ts` atualizados de 654 para 657 versões de ledger (crescimento legítimo pelas três migrations H8-A), mantendo as 59 repo-only bloqueadas e ausentes.

## 6. Pendências

1. `multiple_permissive_policies` (146 WARN) — consolidação exige prova de equivalência por domínio (H8-B).
2. `unindexed_foreign_keys` (172 INFO) e `unused_index` (193 INFO) — fora do escopo autorizado desta fase.
3. B1 (leaked-password), B3 (cadastro fiscal real) e B4 (autorização humana) permanecem bloqueados por dependências externas.
4. Drift recorrente do binding do frontend exige revalidação antes de qualquer operação de banco.

## 7. Decisão

**GO staging** para prosseguir à subfase **H8-B**.
**NO-GO produção** — promoção continua proibida e dependente de autorização humana explícita.
