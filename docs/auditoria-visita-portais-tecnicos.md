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
2. `restoration/visita-portais-tecnicos/rollback.sql` — remove RPCs da fase e restaura o
   baseline exato (status `ajuste_solicitado` **removido**);
3. `verify-restoration.sql` — checksums SHA-256 do baseline conferem
   (`is_visit_responsible` `42e3a861…`, motor `078fef67…`);
4. reaplicação da migration canônica;
5. `postcheck-final.sql` — checksums finais conferem
   (`is_visit_responsible` `cbcde4e2…`, motor `a1273b8e…`) e nenhuma função tem
   `EXECUTE` para `anon`/`PUBLIC`.

Resultado: **ROLLBACK_REHEARSAL_PASS**.

## 6. P1 — Status, cultura e finalização

- Finalização bloqueada sem cultura em `WizardRevisaoStep.tsx` (botão desabilitado + toast
  + destaque em vermelho no resumo).
- CTA "Ir para Identificação" leva direto à etapa faltante.
- Etapa 1 do wizard já validava cultura obrigatória; a revisão agora fecha o contorno.

## 7. Matriz T1–T18

| # | Cenário | Resultado |
|---|---|---|
| T1 | Criação idempotente de visita (mesmo `client_uuid`) | PASS |
| T2 | Criação concorrente (advisory lock) retorna a mesma visita | PASS |
| T3 | Criação sem cultura via solicitação do produtor resolve cultura ativa | PASS |
| T4 | Criação com cultura explícita preserva o valor | PASS |
| T5 | `rpc_iniciar_atendimento_solicitacao_v1` idempotente | PASS |
| T6 | Solicitação já atendida não gera segunda visita | PASS |
| T7 | Listagem de atendimentos: consulta relacional pura, sem N+1 | PASS |
| T8 | Listagem expõe metadados de urgência | PASS |
| T9 | Resumo de atendimentos bate com a listagem | PASS |
| T10 | `is_visit_responsible` autoriza o responsável | PASS |
| T11 | `is_visit_responsible` nega terceiro sem vínculo | PASS |
| T12 | Nenhuma RPC de visita concede EXECUTE a `anon`/`PUBLIC` | PASS |
| T13 | Reenvio de mídia órfã não recria a visita | PASS |
| T14 | Reenvio de mídia com objeto já confirmado é no-op | PASS |
| T15 | `client_uuid` de outro registro → `idempotency_conflict` | PASS |
| T16 | Esgotamento de tentativas → `sync_error` recuperável na UI | PASS |
| T17 | Finalização sem cultura é bloqueada | PASS |
| T18 | Rollback + verify + reapply + postcheck (checksums) | PASS |

Execução: `tests/harnesses/visita-atendimentos-runtime-harness` (T1–T12) com identidades
autenticadas de staging; T13–T17 por Vitest; T18 por
`restoration/visita-portais-tecnicos/rehearsal.sh`.

## 8. Gates H1–H12 (prontidão para homologação)

| Gate | Descrição | Status |
|---|---|---|
| H1 | Nenhum endpoint administrativo público | ✅ |
| H2 | `verify_jwt` sem exceções indevidas | ✅ |
| H3 | RPCs sem EXECUTE para `anon`/`PUBLIC` | ✅ |
| H4 | Migration canônica idempotente e fail-closed | ✅ |
| H5 | Rollback ensaiado e verificado por checksum | ✅ |
| H6 | Autorização de visita correta e testada | ✅ |
| H7 | Mídia pendente sempre recuperável | ✅ |
| H8 | Retry nunca duplica visita nem mídia | ✅ |
| H9 | Perda de enfileiramento comunicada ao usuário | ✅ |
| H10 | Cultura obrigatória na finalização | ✅ |
| H11 | `tsgo --noEmit` sem erros | ✅ |
| H12 | Vitest 100% verde | ✅ |

## 9. Escopo não coberto

- Promoção para produção `navfzbwgwzruipouyfnk`: **não executada** (proibida nesta fase).
- Publicação do app: não realizada.
