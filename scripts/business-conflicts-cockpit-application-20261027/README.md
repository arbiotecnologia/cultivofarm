# Auditoria 40001 — dois conflitos Cockpit/aplicação

**INATIVO. Não aplicado. Não publicado.** Produção exclusivamente `swzpzcwiasxmjutrmvkm`. Base inicial desta etapa: `e2b04a8149e49dd9fcf26d4120b0a46a7d6512ef`; commits da plataforma são gerenciados automaticamente. Nenhuma fixture, papel ou dado hospedado alterado.

## Delta exato

Fontes e metadados capturados via consultas de catálogo somente leitura em 27/10/2026, 15:58–16:00 UTC, após confirmar config/ref externo canônico e `fiscal_environment_marker`.

| Assinatura public | OID LIVE | MD5 LIVE | MD5 candidato |
|---|---:|---|---|
| `rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)` | 41896 | `3c7fa9255984f2c7498c6e32af738611` | `ee9e7a45f7e81e2ba6e2a4e55ca10f78` |
| `rpc_salvar_aplicacao_v1(uuid,jsonb,uuid,jsonb,uuid[])` | 100776 | `f8bc9d5f000abef7f13e6ca340988734` | `0c102f7735a44ccba6ce1364b1f30c32` |

Somente `ERRCODE='40001'` → `ERRCODE='PT409'` nos RAISE `COCKPIT_LOTE_CONCORRENTE` (única violação de unicidade fora do código do lote) e `application_version_conflict` (predecessora não é versão atual). Mensagens preservadas. O retry interno já existente de colisão de `lotes_codigo_lote_key` (até três códigos) permanece byte-exato; não é retry do conflito de negócio.

Assinaturas/defaults, owner postgres, SECURITY DEFINER, `search_path=''`, ACL, corpos restantes, locks, autorização, validações, efeitos, dados e recibos não mudam. Nenhuma substituição global, DML, novo endpoint ou alteração de `legacy_closed`. Erros de serialização genuínos não são interceptados/mapeados. Migrações anteriores ficam intocadas.

## Arquivos e revisão independente

- `live-targets.json`, `baseline.sql.review`: fontes implantadas exatas e metadados.
- `live-dependencies.json`, `live-auth-readonly.json`: pinos de dependências/config/ACL e proteções das tabelas; helpers de autorização capturados para análise, não alterados.
- `functions.sql.review`, `delta-sql.diff`: exclusivamente duas alterações.
- `candidate.sql.review`: **migration candidata fora de `supabase/migrations`**, uma transação, PRE+POST internos, `SET LOCAL lock_timeout='3s'` apenas na transação de implantação. Não muda proconfig nem tempo de espera runtime.
- `preflight-readonly.sql` / `postflight-readonly.sql`: scripts read-only preparados, não executados em produção nesta etapa. Pinos de OIDs/hash e definição integral dos dois alvos; owner/ACL/SECURITY DEFINER/config, helpers e fingerprints ordenados das policies/triggers+corpos/ACL/RLS das tabelas relevantes. Não há comparação fabricada por contagem.
- `rollback-conditioned.sql.review`: somente candidato exato → baseline LIVE exata, PRE+POST integrais; falha fechada se houver drift. Sem revogar/restaurar permissões, remover guards, apagar histórico ou usar estado temporário. **Reintroduz deliberadamente os dois 40001 negociais conhecidos**, não uma vulnerabilidade de autorização; somente o auditor decide se a reversão é apropriada. Não equivale a rollback deny-only e não reabre writers contidos.
- `assemble.py`: reprodução determinística dos arquivos a partir dos snapshots; nunca consulta/atualiza banco.
- `test-local.py`, `results-local.json`: PostgreSQL 17.9 descartável, corpos exatos, schema reduzido/Auth sintética; dependências históricas de setup explicitamente reutilizadas sem executar seus assemblers nem sobrescrever evidências.
- `delta-frontend-tests.diff`: apenas regressões dos consumidores existentes; **nenhuma mudança de implementação frontend necessária**.
- `LOCK-REVOCATION-REVIEW.md`: riscos e ensaio independente bounded, sem afirmar homologação.

Pinos de OID correspondem à produção canônica, não a um clone/restauração. PRE/POST rejeitam clones com outros OIDs. Auditor deve executar PRE fresco, revisar delta, aplicar a candidata somente após aprovação e executar POST/REST próprios; não substituir pinos automaticamente em caso de drift.

## Resultados discriminados

- **36/36 checks PostgreSQL local**, zero falhas: reprodução LIVE dos dois 40001; candidato PT409; rollback sem lote/evento/ticket/recibo parcial; replay e concorrência duas conexões; autorização A/B e anon; sucesso dentro de transação revertida; serialização PostgreSQL genuína 40001; falha forçada no POST sem persistir alteração de definição; preservação de aplicações ao restaurar baseline local.
- Lote: ramo unique_violation exercitado por **trigger de injeção de falha exclusivamente local**, com constraint única real; não é prova de writer concorrente de produção. Concorrência real local da RPC demonstra uma criação e um replay, não necessariamente esse ramo excepcional.
- Aplicação: retificações concorrentes reais locais produzem exatamente uma vencedora e uma PT409; replay da retificação concluída funciona mesmo com predecessora não atual.
- Os quatro scripts completos de revisão são executados **sem modificações** no cluster local e rejeitam o catálogo/OIDs reduzidos antes de escrita. Não é PASS de instalação integral em clone de produção. Testes de corpos exatos e rollback local são separados dessa negativa.
- **87/87 Vitest**, três arquivos: `salvar.test.ts` 15, `gerar-lote-fences.test.tsx` 47, `geracao-codigo.test.ts` 25; quatro regressões novas 40001/PT409. UI do lote conserva formulário, não fecha/confirma/invalida nem repete; helper de aplicação preserva tentativa/uploads e propaga erro sem retry automático. Auth/transporte simulados, não JWT real.
- Nenhuma mudança de `src` fora desses dois arquivos de testes. Não executados builds/typechecks manuais; harness da plataforma responsável. Sem homologação HTTP/JWT produtiva, revogação real durante espera ou alteração contábil. Contabilidade real pendente e SU-518022 adiado.

Reprodução na raiz:

```sh
python3 scripts/business-conflicts-cockpit-application-20261027/assemble.py
python3 scripts/business-conflicts-cockpit-application-20261027/test-local.py
bun run test -- src/test/aplicacoes/salvar.test.ts src/test/lotes/gerar-lote-fences.test.tsx src/test/lotes/geracao-codigo.test.ts
sha256sum -c scripts/business-conflicts-cockpit-application-20261027/SHA256SUMS
```

## Consumidores

`src/hooks/useEsteiraLaboratorio.ts:174–225` → `GerarLoteDialog`: chamada única, scope/abort após await, erro genérico orientando consultar OS, sem retry. Regressão confirma mesma conduta para PT409/40001.

`src/lib/aplicacoes/salvar.ts:26–73` → `AplicacaoFormDialog`: prepare/upload/finalize não é retry cego. Erros da RPC são propagados e o formulário conserva tentativa/rascunho; reenvio depende de ação explícita. A mensagem de `application_version_conflict` continua a existente, sem tradução nova ou alteração de payload/Storage. Nenhuma limpeza automática após conflito. Não se afirma auditoria global de todos fluxos/offline/cache.
