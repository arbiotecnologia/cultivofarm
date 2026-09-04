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
versionado fora de `supabase/migrations`.

Resultado oficial: performance 1001 → 512 achados (0 ERROR, 147 WARN, 365 INFO), com
`auth_rls_initplan` 436 → 0, `duplicate_index` 28 → 1 (grupo remanescente sustentado por
constraints em `formulacoes`), `unused_index` 219 → 193 por efeito colateral, e
`multiple_permissive_policies` mantido em 146 WARN — os grupos com expressões distintas
foram deliberadamente preservados e passam a ser pendência de H8-B. Segurança permanece
393 achados com 0 ERROR.

Todos os gates de H7 continuam PASS. Detalhes, evidências, rollbacks e decisão GO/NO-GO em
`restoration/homologacao-h8/01-h8a-performance-advisor.md`.

## 9. Status de execução — H8-B (atualizado)

H8-B foi executada no staging `ikaauvsflpmamgxmkhoq` como auditoria com **uma única
alteração de DDL comprovadamente segura**:

- `multiple_permissive_policies`: dos 146 achados, apenas **1** admitiu prova formal de
  equivalência — a policy `SELECT` `Staff can view all client documents` em
  `public.cliente_documentos`, integralmente subsumida pela policy `FOR ALL`
  `Staff can manage client documents` (mesmo role, mesmo `USING`). Removida pela migration
  `20261002000000_h8b1_redundant_select_policy_v1` (ledger 657 → 658), com pré/pós-condições
  fail-fast, auditoria em `private.h8a_policy_audit` e rollback nominal fora de
  `supabase/migrations`. **A remoção não reduziu o Advisor:** ele conta grupos
  tabela+role+ação e o grupo `cliente_documentos / authenticated / SELECT` ainda tem duas
  policies (`Staff can manage client documents` via `FOR ALL` e `Users can only view their
  own client documents`). Portanto `multiple_permissive_policies` **permaneceu 146**; o que
  mudou foram as métricas próprias: policies em `public` 541 → 540 e grupos locais 44 → 43.
  Restam **43 grupos locais** e **117 grupos expandidos/finding-groups oficiais**,
  totalizando as 146 ocorrências — pendência de H8-C.
- `SECURITY DEFINER`: 648 funções auditadas — 0 sem `search_path` fixo, 0 com grant PUBLIC,
  2 com `anon` por desenho, 378 com `authenticated` (superfície já certificada em H7O).
  **Nenhuma revogação e nenhuma conversão para `SECURITY INVOKER`**, por ausência de prova
  nominal de ausência de consumidor.

Gates: binding restaurado e revalidado, repo-only guard PASS, postcheck H7O PASS, harnesses
300/300 e 136/136 PASS, typecheck 0 erro, build OK, Vitest 3.337 PASS / 0 FAIL / 4 skip,
scans de segredo e integração fiscal OK. Invariantes preservados (648 SECDEF, 0 sem
`search_path`, 2 anon, 24 views/23 invoker, 6 cron, 7 RLS fail-closed, fiscal
`HOMOLOGATION|2|false|DRAFT|NOT_READY`).

Detalhes, matriz de equivalência, rollback e decisão em
`restoration/homologacao-h8/02-h8b-policies-rpcs.md`. Decisão: **GO homologação para H8-C /
NO-GO produção**.

### Revalidação independente (2026-09-04)

Validação independente no Supabase oficial de homologação `ikaauvsflpmamgxmkhoq`, após o
commit autoritativo `c322448d258601b4b035f0becca483f968cddb33`, confirmou: `ledger=658`,
policies em `public`=540, policy `Staff can view all client documents` ausente e keeper
`Staff can manage client documents` presente, `SECDEF=648` (0 sem `search_path`, 2 anon,
378 authenticated), 24 views com 23 `security_invoker` (17 `=true` + 6 `=on`) e 1 interna
sem grants, 6 cron. **Advisor de performance permaneceu 512 (147 WARN + 365 INFO)** com
`multiple_permissive_policies=146`, `duplicate_index=1`, `unindexed_foreign_keys=172`,
`unused_index=193`; **Advisor de segurança permaneceu 393 (383 WARN + 10 INFO + 0 ERROR)**.
H8-B teve, portanto, **ganho estrutural sem delta de Advisor**. Decisão mantida:
**GO homologação para H8-C / NO-GO produção**.

### H8-C — reconciliação definitiva das 59 repo-only (2026-09-04)

Fase executada **sem DDL** e sem migration nova: ledger permanece **658** e as 59 migrations
repo-only continuam **ausentes do ledger**, com hashes SHA-256 idênticos na entrada e na saída
(0 DRIFT). As 59 foram reconciliadas **individualmente** por consulta read-only ao catálogo de
homologação `ikaauvsflpmamgxmkhoq`, confirmando a distribuição **36 REFLETIDA / 3 SUPERSEDED /
20 CONFLITANTE** e **0 INCONCLUSIVA**. As 4 entries `destructive` receberam análise de impacto
e bloqueio permanente. O manifesto passou a registrar decisão versionada por entry
(`decision`, `evidence_refs`, `reviewed_at`, `reviewed_commit`, `replay_prohibited`) e a regra
permanente de que qualquer necessidade futura exige **nova** migration posterior a
`20261002000000`; guard e teste estático foram fortalecidos para falhar em drift, aplicação,
entrada no ledger, evidência ausente ou distribuição divergente.

Escopo corrigido: os 43 grupos locais / 117 finding-groups de `multiple_permissive_policies`
**não** pertencem à H8-C (que é ledger/reconciliação) e passam ao backlog de performance/RLS
futuro. H8-D segue como observabilidade e runbook. Detalhes em
`restoration/homologacao-h8/03-h8c-ledger-reconciliation.md`. Decisão: **GO homologação para
H8-D / NO-GO produção**.

### H8-D — observabilidade e runbook operacional (2026-09-04)

Fase executada **sem DDL** e sem migration: ledger permanece **658** e as 59 repo-only seguem
ausentes e íntegras. Binding sofreu drift na entrada e foi restaurado **somente** do baseline
autorizado `6c08a8f8`.

Entregue uma suíte única de healthcheck de homologação (`h8d-healthcheck.sh` +
`h8d-healthcheck.sql`): **read-only** (coleta dentro de `BEGIN READ ONLY`, sem DDL/DML e sem
`SELECT *`), **fail-closed de identidade** (aborta com `exit 10` fora do staging autorizado ou
diante de qualquer referência a produção), **idempotente** (3 execuções com fingerprint de
negócio `658|0|140|648|594` idêntico) e **sanitizada** (sem DSN, token, chave, certificado,
CPF/CNPJ, e-mail, telefone ou payload). São **29 sinais** em 8 categorias — identidade, cron,
comunicação/outbox, superfície pública, RLS/RPC, fiscal, storage, auth e banco — cada um com
status `OK|WARN|CRITICAL|UNKNOWN`, limiar justificado, timestamp UTC e orientação de resposta,
com saída JSON opcional para histórico/CI. Nenhuma tabela, rota ou dashboard paralelo foi criado.

Execução real: **26 OK / 1 WARN / 0 CRITICAL / 2 UNKNOWN**. O WARN corresponde ao achado
operacional da fase: o cron `prune-old-audit-logs` aborta desde 03/09 por referenciar
`created_at` em `public.financial_audit_log` (coluna correta: `performed_at`), e como o job é um
bloco transacional único **nenhuma poda de auditoria ocorre**. Sem risco de perda de dados;
correção proposta e movida para **H8-E** por exigir alteração de job que executa `DELETE`.

Gates: binding OK, guard das 59 PASS, postcheck H7O PASS, harnesses 300/300 e 136/136,
typecheck 0, build OK, Vitest **3.364 PASS / 0 FAIL / 4 skip** (+25 casos estáticos H8-D),
scans fiscais OK, Advisors inalterados (512 / 393, 0 novo ERROR e 0 novo WARN). Relatórios em
`04-h8d-observabilidade-runbook.md` e `05-h8-relatorio-final.md`. Decisão: **GO operacional em
homologação / NO-GO produção**.
