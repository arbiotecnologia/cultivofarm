# H8 — Abertura formal (diagnóstico inicial, sem execução)

Data: 2026-09-05 · Escopo autorizado: staging `ikaauvsflpmamgxmkhoq`
Produção `navfzbwgwzruipouyfnk`: **proibida** — não consultar, não alterar, não promover.

Este documento **não implementa nada**: nenhuma migration, nenhuma mudança de produto,
nenhuma alteração de banco, secret, certificado, flag ou binding. Ele apenas formaliza o
escopo que a documentação existente já previa como remanescente após H7.

## 1. Diagnóstico inicial (estado herdado de H7Q)

- Ledger do staging em **654** versões; **59 migrations repo-only** conciliadas
  (36 refletidas no catálogo, 3 superadas pelo banco, 20 em quarentena por virem do
  backend Cloud acidental) e protegidas por manifesto sha256 + guard + teste estático.
- Segurança: **0 ERROR** no Advisor. 648 `SECURITY DEFINER` em `public`, 0 sem
  `search_path` fixo, 2 executáveis por `anon` por design. 7 tabelas com RLS e sem
  policy, fail-closed intencional. 5 views protegidas em `security_invoker`.
- Performance: **1001 achados, 0 ERROR** — 436 `auth_rls_initplan` (WARN),
  146 `multiple_permissive_policies` (WARN), 28 `duplicate_index` (WARN),
  172 `unindexed_foreign_keys` (INFO), 219 `unused_index` (INFO). Dívida preexistente,
  deliberadamente **não** tratada em H7.
- Edge Functions: 37 publicadas e validadas no staging; republicação depende de runner
  vinculado ao project ref autorizado.
- Bloqueios externos abertos: **B1** leaked-password protection, **B3** emitente fiscal
  `DRAFT|NOT_READY` (credenciamento SEFAZ + validação contábil), **B4** autorização
  humana de promoção.

## 2. Objetivos de H8

- **H8-A — Performance com risco controlado.** Reduzir os WARN de maior impacto
  (`auth_rls_initplan` via `(select auth.uid())`, consolidação de policies permissivas
  duplicadas, remoção de índices duplicados) sem alterar semântica de acesso.
- **H8-B — Superfície de RPC.** Reduzir o Grupo B de `SECURITY DEFINER` executáveis por
  `authenticated`, partindo de `rpc_allowlist.tsv`, com revogações individuais e
  reversíveis — nunca em massa.
- **H8-C — Ledger.** Fechar formalmente as 59 repo-only: quarentena documentada das 20
  conflitantes e decisão versionada para as 3 superadas.
- **H8-D — Observabilidade e runbook.** Consolidar runbook operacional de homologação
  (cron, outbox de comunicação, rate-limit, harnesses) e alarmes de regressão.

## 3. Dependências

- Binding de staging válido antes de qualquer operação (`check-frontend-binding.sh`).
- Acesso `STAGING_DSN` ao staging; nenhum acesso a produção.
- Para republicar Edge Functions: runner com `--project-ref ikaauvsflpmamgxmkhoq`.
- B1/B3 continuam externos e **não** são pré-requisito de H8-A a H8-D.

## 4. Riscos

| Risco | Mitigação |
| --- | --- |
| Reescrita de policy alterar visibilidade de dados | Harness por perfis (300 + 136) obrigatório antes/depois; migração transacional com rollback versionado |
| Remoção de índice degradar consulta crítica | Só remover `duplicate_index` comprovadamente redundante; `unused_index` fica como observação |
| Revogação de EXECUTE quebrar tela em produção futura | Mapa de consumidores por RPC antes de revogar; uma revogação por migration |
| Drift de binding durante a fase | Gate de binding no início e no fim de cada rodada |
| Escopo vazar para produção | Runner fail-closed `staging-psql.sh`; proibição explícita mantida |

## 5. Critérios de aceite

1. Advisor de performance com redução mensurável dos WARN, mantendo **0 ERROR**.
2. Advisor de segurança sem novo ERROR e sem aumento de achados.
3. Harness por perfis 300/300 e 136/136 PASS antes e depois de cada migration.
4. Postchecks H7N/H7O/H7P continuam PASS (nenhuma regressão de H7).
5. Ledger reconciliado; nenhuma das 59 repo-only entra no ledger sem decisão explícita.
6. Typecheck, build, Vitest completo e scans de segredo/integração fiscal PASS.
7. Fiscal permanece `HOMOLOGATION | tpAmb=2 | production_enabled=false`.
8. Cada migration H8 tem rollback versionado e ensaio rollback→reapply com fingerprint
   idêntico em transação descartada.

## 6. Plano de testes

- Estático: testes Vitest de ordem de migrations, allowlist de RPCs, repo-only guard,
  binding gate.
- Banco: harnesses por perfil, postchecks H7N/H7O/H7P, comparação de fingerprint de
  catálogo pré/pós, contagem de policies e índices por tabela afetada.
- Aplicação: typecheck, build, Vitest completo, scans fiscal/segredos.
- Runtime: `fiscal-binding-diagnostics` deve permanecer `binding_ok=true`, `STAGING`,
  `production_emission_allowed=false`.

## 7. Prompt de execução sugerido para H8-A

> Execute a fase H8-A exclusivamente no staging `ikaauvsflpmamgxmkhoq`. Produção
> `navfzbwgwzruipouyfnk` permanece proibida. Rode o gate de binding antes de tocar o
> banco e restaure o baseline se houver drift. Trate a dívida de performance do Advisor
> nesta ordem: `duplicate_index` (28), `auth_rls_initplan` (436) e
> `multiple_permissive_policies` (146), uma migration por grupo, cada uma com rollback
> versionado fora de `supabase/migrations` e ensaio rollback→reapply em transação
> descartada. Não altere semântica de acesso: rode os harnesses por perfis (300 e 136)
> antes e depois de cada migration e os postchecks H7N/H7O/H7P. Não remova
> `unused_index`. Não toque em Edge Functions, secrets, certificado, flags fiscais nem
> em schemas gerenciados. Ao final: Advisor security/performance, typecheck, build,
> Vitest completo, scans, atualização de relatório e roadmap, e decisão GO/NO-GO.

## 8. Status de execução — H8-A (atualizado)

H8-A foi executada no staging `ikaauvsflpmamgxmkhoq` em três subfases independentes
(H8-A1, H8-A2, H8-A3), todas aplicadas e registradas no ledger (654 → 657), com rollback
versionado fora de `supabase/migrations` e ensaio rollback→reapply em transação descartada.

Resultado resumido: `duplicate_index` 28 → 1 grupo (o remanescente é sustentado por
constraints em `formulacoes`), `auth_rls_initplan` 436 → 0, `multiple_permissive_policies`
reduzido apenas nos 2 casos de redundância literal — os 44 grupos com expressões distintas
foram deliberadamente preservados e passam a ser pendência de H8-B. `unused_index` e
`unindexed_foreign_keys` não foram tocados.

Todos os gates de H7 continuam PASS. Detalhes, evidências e decisão GO/NO-GO em
`restoration/homologacao-h8/01-h8a-performance-advisor.md`.
