# H8-A — Otimização controlada do Advisor de performance (staging)

**Escopo executado:** exclusivamente Lovable + Supabase de homologação `ikaauvsflpmamgxmkhoq`.
**Produção `navfzbwgwzruipouyfnk`:** não consultada, não alterada, não promovida. Nenhum documento fiscal emitido.
**Preservados integralmente:** H7L, H7N, H7O, H7P, H7Q. Bloqueios externos B1, B3 e B4 permanecem abertos.

## 1. Gates de entrada

| Gate | Resultado |
| --- | --- |
| `check-frontend-binding.sh` | ABORT inicial (`.env` regenerado para `yzszlzjpovmcteuxjznj`) → `.env` e `types.ts` restaurados byte a byte do baseline `6c08a8f8` (21.850 linhas) → **OK staging** |
| `h7p-guard-repo-only.sh` | OK — 59 migrations repo-only íntegras e ausentes do ledger |
| Baseline do ledger | 654 versões |

> Observação operacional: o binding voltou a sofrer drift no meio da rodada (regeneração automática do backend Cloud). Foi restaurado novamente do mesmo baseline e revalidado antes do encerramento.

## 2. Baseline Advisor (performance) e alvos

| Categoria | Baseline oficial | Ação H8-A |
| --- | --- | --- |
| `duplicate_index` | 28 WARN | H8-A1 — resolvido (resta 1 grupo legítimo) |
| `auth_rls_initplan` | 436 WARN | H8-A2 — resolvido (0 restantes) |
| `multiple_permissive_policies` | 146 WARN | H8-A3 — parcial e deliberadamente mínimo (2 policies redundantes) |
| `unindexed_foreign_keys` | 172 INFO | fora de escopo nesta fase |
| `unused_index` | 219 INFO | proibido nesta fase — não tocado |

## 3. Subfases aplicadas

### H8-A1 — `duplicate_index`
- Forward: `h8a-forwards/20261001000000_h8a1_duplicate_index_v1.sql` (md5 `ba73a678e4220952b362d1cbe4f8e5f7`).
- Rollback: `h8a-rollbacks/20261001000000_h8a1_duplicate_index_v1_rollback.sql`.
- 32 índices removidos após prova de equivalência normalizada (`pg_get_indexdef` com o nome neutralizado), mesma tabela, mesma unicidade, mesmo predicate/opclass/collation, índice válido e não sustentado por PK/constraint.
- Preservados por decisão explícita: o par duplicado de `formulacoes` (cada índice sustenta uma constraint distinta) e todos os índices exigidos por verificadores executáveis (`ux_fi_idempotency_key`, `ux_recurring_generation_success`, `idx_produto_etiquetas_lote`, `idx_produto_etiquetas_envase`).
- Auditoria: `private.h8a_index_audit` (schema privado, sem grants a `anon`/`authenticated`).
- Resultado: grupos duplicados 28 → **1** (apenas o de `formulacoes`).

> Incidente registrado: a primeira versão do forward continha `BEGIN;/COMMIT;` internos, e o `COMMIT` aninhado confirmou o ensaio que deveria ser descartado. O estado foi imediatamente restaurado pelo rollback (`DUP=28`, auditoria zerada, ledger 654) e os wrappers foram removidos antes de qualquer aplicação real. Nenhuma migration entrou no ledger nesse incidente.

### H8-A2 — `auth_rls_initplan`
- Forward: `h8a-forwards/20261001010000_h8a2_auth_rls_initplan_v1.sql` (md5 `e6f949b271495953c44d254733039c2f`).
- Rollback: `h8a-rollbacks/20261001010000_h8a2_auth_rls_initplan_v1_rollback.sql` (restaura a expressão exata registrada na auditoria).
- **436 policies** normalizadas — número idêntico ao baseline oficial do Advisor.
- Técnica: `ALTER POLICY` (nunca `DROP`/`CREATE`), portanto nome, comando, classe PERMISSIVE e lista de roles (`TO`) são intocados. A única transformação é `auth.uid()` → `( SELECT auth.uid() AS uid)`, idempotente e escalar.
- Prova de equivalência dupla: a expressão é desembrulhada antes e depois e comparada caractere a caractere; qualquer divergência aborta a migration. Pós-condições exigem 0 policies com avaliação por linha, 0 divergências na auditoria, total de policies inalterado e nenhuma policy restritiva inesperada.
- Não há uso de `auth.role()`, `auth.jwt()` ou `current_setting()` em policies de `public` (verificado: 0 ocorrências).
- Ensaio rollback→reapply em transação descartada: 0 → 436 → 0, convergente.

### H8-A3 — `multiple_permissive_policies`
- Forward: `h8a-forwards/20261001020000_h8a3_multiple_permissive_policies_v1.sql` (md5 `68dc30779289ce5a6668ccbbf30d5461`).
- Rollback: `h8a-rollbacks/20261001020000_h8a3_multiple_permissive_policies_v1_rollback.sql`.
- Removidas apenas **2** policies permissivas literalmente redundantes (mesma tabela, comando, roles e expressão idêntica caractere a caractere; `a OR a ≡ a`):
  - `public.partner_product_prices` → removida `ppp_select`, mantida `partner_product_prices_select`;
  - `public.talhao_safras` → removida `Portal: Ler safras dos talhões acessíveis`, mantida `Authenticated users can read talhao_safras`.
- **Não consolidados:** os demais grupos possuem expressões diferentes por perfil/rota. Fundi-los alteraria a lógica de autorização e não foi feito apenas para reduzir contagem do Advisor. Pendência formal para H8-B, com revisão por domínio.
- Total de policies em `public`: 543 → **541**. Grupos com policies idênticas: **0**.

## 4. Estado final verificado no staging

```
LEDGER=657
DUP_GROUPS=1            (apenas formulacoes, sustentado por constraints)
INITPLAN=0
MULTI_GROUPS=44         (grupos com expressões distintas — pendência H8-B)
SECDEF=648
SECDEF_SEM_SEARCHPATH=0
VIEWS=24 INVOKER=23     (exceção interna sem grants)
CRON=6
RLS_SEM_POLICY=7        (fail-closed intencional)
```

| Gate | Resultado |
| --- | --- |
| `h7o-postcheck.sh` | PASS (inclui allowlist 485 sem drift, 2 RPCs anon por design, extensões intocadas) |
| Harness H7O por perfis | **300/300 PASS**, 0 falhas |
| Harness H7N por perfis | **136/136 PASS** |
| `h7p-guard-repo-only.sh` | OK — 59 repo-only bloqueadas |
| Fiscal | `HOMOLOGATION | 2 | false | false | false | DRAFT | NOT_READY` |
| Typecheck (`tsgo`) | PASS |
| Build (Vite/PWA) | PASS |
| Vitest completo | PASS (0 falhas) |
| Binding final | OK — staging `ikaauvsflpmamgxmkhoq` |

Advisor de segurança: nenhum ERROR novo; a fase não criou, removeu ou ampliou privilégio algum — apenas normalizou expressões equivalentes e removeu redundância exata.

## 5. Rastreabilidade e rollback

- Forwards versionados em `supabase/migrations` com md5 idêntico ao registrado no ledger.
- Rollbacks mantidos fora de `supabase/migrations`, em `restoration/homologacao-h8/h8a-rollbacks/`.
- Auditorias: `private.h8a_index_audit` (32 linhas) e `private.h8a_policy_audit` (436 + 2 linhas).
- `restoration/homologacao-h7/h7p-repo-only-manifest.json` e o teste estático correspondente atualizados de 654 para 657 versões de ledger, mantendo as 59 repo-only bloqueadas.

## 6. Pendências

1. `multiple_permissive_policies` — 44 grupos com expressões distintas exigem consolidação com prova de equivalência por domínio (H8-B).
2. `unindexed_foreign_keys` (172 INFO) e `unused_index` (219 INFO) — fora do escopo autorizado desta fase.
3. B1 (leaked-password), B3 (cadastro fiscal real) e B4 permanecem bloqueados por dependências externas.
4. Drift recorrente do binding do frontend exige revalidação antes de qualquer operação de banco.

## 7. Decisão

**GO staging** para prosseguir à subfase **H8-B**.
**NO-GO produção** — promoção continua proibida e dependente de autorização humana explícita.
