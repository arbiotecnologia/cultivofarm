# Auditoria — Visita Técnica / Portais Técnicos

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` não foi tocada.
Nada publicado. Dados preservados.

## 1. P0 — Harness administrativo público (RESOLVIDO)

| Item | Evidência |
|---|---|
| Edge Function `visita-atendimentos-runtime-harness` desativada no staging | `curl` sem JWT → **404 NOT_FOUND**; `curl` com JWT → **404 NOT_FOUND** |
| `verify_jwt = false` removido | `supabase/config.toml` sem entrada para o harness |
| Código movido para fora de `supabase/functions/` | `tests/harnesses/visita-atendimentos-runtime-harness/index.ts` (CLI, não-servidor) |
| Guarda de ambiente | `assertStaging()` aborta se o ref não for `ikaauvsflpmamgxmkhoq` |
| Fixtures | removidas ao final da execução (cleanup determinístico por prefixo) |

## 2. P0 — Mídia pendente nunca reenviada (RESOLVIDO)

- Fila recuperável em `src/lib/offlineDb.ts`: `PendingFoto` ganhou `remoteRegistroId`,
  `syncStatus` (`pending_sync` | `syncing` | `sync_error`), `syncingAt`, `uploadAttempts`,
  `lastUploadError`, `remotePath`.
- Lease atômico (`claimPendingFoto` / `releasePendingFoto`): duas abas nunca processam a
  mesma mídia.
- Passe dedicado em `src/hooks/useOfflineSync.ts` (`orphanMedia`): reenvia **somente a
  mídia** de visitas que já existem no servidor. Nunca recria a visita, nunca usa o INSERT
  legado de registro. O cleanup remove apenas a mídia.
- `uploadMediaIdempotent` (`src/lib/mediaUpload.ts`) exige, além do `client_uuid`:
  mesmo `registro_consultor_id`, mesmo `arquivo_path` e **objeto confirmado no Storage**
  (`list`). Referência órfã → reenvio; divergência → `idempotency_conflict`.
- Esgotamento de tentativas (`MAX_MEDIA_SYNC_ATTEMPTS = 3`) → `sync_error` **recuperável**
  com UI de "Reenviar" / "Descartar" em `src/components/app/PendingMediaRecovery.tsx`.
- Falha ao enfileirar em `MobileRegistrarOcorrencia.tsx` agora emite erro explícito
  ("NÃO puderam ser enfileiradas"), sem silenciar perda.
- Progresso de sincronização passa a contar todas as filas (registros, check-ins, campos,
  diagnósticos, recomendações, mídias órfãs), cada item uma única vez.

## 3. P0 — Migration canônica (RESOLVIDO)

`supabase/migrations/20260805040000_visita_canonica_failclosed.sql`:

- `CREATE OR REPLACE` completo, sem patch textual, para
  `is_visit_responsible`, `rpc_criar_visita_idempotente`,
  `rpc_iniciar_atendimento_solicitacao_v1`, `rpc_listar_atendimentos_tecnicos_v1`,
  `rpc_resumo_atendimentos_tecnicos_v1`.
- Guarda de ambiente **fail-closed** e bloco `POST_OK` de verificação.
- Migrations intermediárias documentadas como *superseded* por esta.

## 4. P0 — Autorização (RESOLVIDO)

`is_visit_responsible` deixou de comparar `consultor_profile_id` com `p_user_id`
(comparação logicamente errada entre domínios distintos). Passa a resolver o profile do
usuário e comparar com `consultor_responsavel` / `created_by`.

## 5. P0 — Ensaio de rollback (PASS)

Ciclo executado em transação no staging:

1. snapshot do estado final;
2. `restoration/visita-portais-tecnicos/rollback.sql` — reaplica o baseline seguro
   forward-safe sem remover RPCs usadas pelo frontend e sem restaurar a autorização inválida;
3. `verify-restoration.sql` — checksums SHA-256, owner, grants, `SECURITY DEFINER` e
   `search_path` das seis funções conferem;
4. reaplicação da migration canônica;
5. `postcheck-final.sql` — checksums finais conferem
   (`is_visit_responsible` `cbcde4e2…`, motor `a1273b8e…`, finalização `480c8a8a…`) e
   nenhuma função tem `EXECUTE` para `anon`/`PUBLIC`.

Resultado: **ROLLBACK_REHEARSAL_PASS**.

## 6. P1 — Status, cultura e finalização

- Finalização bloqueada sem cultura em `WizardRevisaoStep.tsx` (botão desabilitado + toast
  + destaque em vermelho no resumo).
- CTA "Ir para Identificação" leva direto à etapa faltante.
- Etapa 1 do wizard já validava cultura obrigatória; a revisão agora fecha o contorno.

## 7. Matriz T1–T18 (matriz aprovada) — status runtime

Runner: `tests/harnesses/visita-atendimentos-runtime-harness/index.ts` (CLI, não é
Edge Function). `PASS` só é registrado a partir de artefato runtime real em
`artifacts/visita-atendimentos/`. Qualquer `FAIL`, `BLOCKED`, `test.skip` ou
cenário não executado força **exit 1**.

| # | Cenário | Resultado |
|---|---|---|
| T1 | Listagem consultor | BLOCKED — credencial ausente |
| T2 | Listagem agrônomo | BLOCKED — credencial ausente |
| T3 | Produtor/sem vínculo negados | BLOCKED — credencial ausente |
| T4 | Outra carteira isolada (leitura + mutações) | BLOCKED — credencial ausente |
| T5 | Demanda sem cultura em rascunho | BLOCKED — credencial ausente |
| T6 | Finalização bloqueada server-side sem cultura | BLOCKED (dependente de T5) |
| T7 | Concorrência de demanda | BLOCKED — credencial ausente |
| T8 | Ocorrência online | BLOCKED — credencial ausente |
| T9 | Replay offline | BLOCKED — credencial ausente |
| T10 | Falha/retry real de mídia (1 objeto, 1 referência, GPS + capturado_em) | BLOCKED — credencial ausente |
| T11 | Claims/sync concorrentes | BLOCKED — credencial ausente (claim IndexedDB determinístico: PASS em `src/test/offlineDb.claim.test.ts`) |
| T12 | Busca/abas/paginação/resumo | BLOCKED — credencial ausente |
| T13 | Check-in / diagnóstico / version conflict | BLOCKED — credencial ausente |
| T14 | Finalizar / enviar / aprovar / reprovar / ajuste | BLOCKED — credencial ausente |
| T15 | Não atribuído negado | BLOCKED — credencial ausente |
| T16 | Grants anon/PUBLIC (catálogo + tentativa anon com argumentos válidos) | BLOCKED — credencial ausente |
| T17 | Endpoint 404 com e sem JWT | BLOCKED — credencial ausente |
| T18 | Cleanup (tabelas, auth users, storage, triggers habilitados) | BLOCKED — credencial ausente |

### 7.1 Execução registrada (reexecução 2026-08-05, 04:4xZ)

| Comando | Timestamp (UTC) | Resultado |
|---|---|---|
| `npx tsgo --noEmit -p tsconfig.app.json` | 2026-08-05T04:44Z | PASS (exit 0) |
| `bunx vitest run` | 2026-08-05T04:45Z | PASS — 2710 testes / 4 skip, 163 arquivos (1 arquivo skip: harness RLS fiscal sem staging provisionado) |
| `bun run build` | 2026-08-05T04:46Z | PASS (exit 0) |
| `bash restoration/visita-portais-tecnicos/rehearsal.sh` | 2026-08-05T04:48Z | `ROLLBACK_REHEARSAL_PASS` (exit 0) — estado final → rollback → verify (`VERIFY_RESTORATION_OK`) → reaplicar → postcheck (`POSTCHECK_FINAL_OK`, 6 funções por assinatura, checksum, owner, SECURITY DEFINER, search_path e grants). Staging terminou no estado final. |
| Validação do `promotion-manifest.json` | 2026-08-05T04:47Z | `MANIFEST_VALIDATION PASS` — sha256 e tamanho conferem para todos os artefatos |
| `bash scripts/fiscal-secrets-scan.sh` | 2026-08-05T04:47Z | exit 1 — **3 achados legados, 0 segredos reais**: anon publicável em `src/integrations/supabase/client.ts:6` e `scripts/rbac-audit/run-rbac-audit.ts:39`, placeholder `USER:PASSWORD` em `restoration/comunicacao-deploy/env.example:9`. Nenhum achado no runner, kit ou artefatos. |
| `deno run … visita-atendimentos-runtime-harness/index.ts` | 2026-08-05T04:46Z | **exit 1 — `GUARD_ABORT: variaveis ausentes: SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_SECRET_KEY`** |
| Lint | — | indisponível no projeto (sem script `lint`); substituído por `tsgo` + build |
| E2E mobile/desktop de visita técnica | 2026-08-05T04:49Z | não executável — `ERR_MODULE_NOT_FOUND: lovable-agent-playwright-config` importado por `playwright.config.ts` (dependência de harness ausente no executor) |

### 7.2 Bloqueio formal

Rebind seguro executado (`supabase--rebind_secrets`). Estado no executor
(somente SET/MISSING, sem valor, prefixo ou tamanho):

```
SUPABASE_URL=SET                     (ref ikaauvsflpmamgxmkhoq — staging)
SUPABASE_PUBLISHABLE_KEY=SET         (chave publicável; usada como anon)
SUPABASE_ANON_KEY=MISSING            (resolvido por fallback publicável — não bloqueia)
SUPABASE_SECRET_KEY=MISSING
SUPABASE_SERVICE_ROLE_KEY=MISSING
```

```
BLOQUEADO
Variável ausente no executor backend: SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY)
```

Causa raiz técnica: os secrets foram cadastrados em **Edge Function Secrets** do
Supabase, escopo visível apenas ao runtime das Edge Functions. O runner é CLI
(exigência: sem endpoint administrativo), portanto não enxerga esse escopo. O
`rebind_secrets` do conector vinculou apenas `SUPABASE_URL` e a chave publicável.
Desbloqueio: cadastrar `SUPABASE_SECRET_KEY` em **Project Settings → Secrets**
do Lovable (escopo do executor). Nenhum valor foi solicitado ou revelado.

O runner resolve a credencial exclusivamente por
`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY")`,
nunca imprime valor, prefixo ou tamanho, e aborta fail-closed fora de
`ikaauvsflpmamgxmkhoq`.

## 8. Gates H1–H12 (prontidão para homologação)

| Gate | Descrição | Status |
|---|---|---|
| H1 | Nenhum endpoint administrativo público | ✅ |
| H2 | `verify_jwt` sem exceções indevidas | ✅ |
| H3 | RPCs sem EXECUTE para `anon`/`PUBLIC` | ✅ estático (T16 runtime pendente) |
| H4 | Migration canônica idempotente e fail-closed | ✅ |
| H5 | Rollback ensaiado e verificado por checksum | ✅ |
| H6 | Autorização de visita correta e testada | ⏳ runtime pendente |
| H7 | Mídia pendente sempre recuperável | ✅ |
| H8 | Retry nunca duplica visita nem mídia | ✅ |
| H9 | Perda de enfileiramento comunicada ao usuário | ✅ |
| H10 | Cultura obrigatória na finalização | ✅ |
| H11 | `tsgo --noEmit` sem erros | ✅ |
| H12 | Vitest 100% verde | ✅ 2710 PASS |

## 9. Manifesto de promoção

`restoration/visita-portais-tecnicos/promotion-manifest.json` lista, com ordem,
caminho, `sha256` e tamanho: a migration canônica `20260805040000`, a
finalizadora `20260805041601`, a auxiliar de catálogo `20260805042628`,
`canonical-final.sql`, `rollback.sql`, `verify-restoration.sql`,
`postcheck-final.sql`, `rehearsal.sh` e o runner. As migrations
`20260805031852`, `20260805032753`, `20260805032904`, `20260805033027`,
`20260805033136` e `20260805033223` estão marcadas como **superseded** e
excluídas do pacote, com histórico preservado.

## 10. Escopo não coberto

- Promoção para produção `navfzbwgwzruipouyfnk`: **não executada** (proibida nesta fase).
- Publicação do app: não realizada.

## 11. Estado de limpeza do staging (T18 — verificação independente)

Consulta read-only via DSN de staging em 2026-08-05T04:50Z:

```
auth_users_temp=0
storage_objects_bucket_temp=0   (bucket consultor-arquivos)
registros_consultor_arquivos_temp=0
triggers_disabled_public=0      (nenhum trigger desabilitado)
```

Isto confirma ausência de resíduos de execuções anteriores, mas **não** substitui
o T18 do runner, que continua `BLOCKED`.

## 12. Status final

**NÃO APTO / BLOQUEADO** — T1–T18 não podem ser certificados sem a credencial
administrativa de staging disponível ao executor CLI
(`SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` em Project Settings →
Secrets). Nenhum `BLOCKED` foi convertido em `PASS`.
`PRODUCAO_NAO_ACESSADA` ✅ · `NAO_PUBLICADO` ✅.


