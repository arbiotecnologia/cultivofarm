# Fluxo unificado de atendimento técnico

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção (`navfzbwgwzruipouyfnk`) não foi tocada.

## Problema corrigido

Os portais do **consultor técnico** e do **técnico agrônomo** tinham o atendimento
fragmentado em telas independentes (`/app/solicitacoes`, `/app/registros`,
`/app/registrar`), cada uma com sua própria lógica de criação de visita:

- `useFluxoVisitaTecnica.criarOuObterVisitaPorSolicitacao` fazia `INSERT` direto em
  `registros_consultor` + `UPDATE` em `portal_solicitacoes` sem transação nem trava —
  dois técnicos podiam assumir a mesma demanda e gerar visitas duplicadas.
- `MobileRegistrarOcorrencia` fazia `INSERT` direto, sem idempotência real no servidor.
- `iniciarVisita` navegava para `/visita-tecnica/:id` (rota administrativa), quebrando
  a continuidade no mobile.
- O painel técnico contava registros com `select(count)` direto nas tabelas, divergindo
  do que o técnico realmente enxerga.

## Modelo canônico

### Origem do atendimento

`registros_consultor.origem_atendimento` (`text`, com *check*):

| valor | significado |
| --- | --- |
| `ocorrencia_campo` | ocorrência registrada em campo |
| `solicitacao_produtor` | demanda aberta pelo produtor |
| `agenda` | atendimento agendado |
| `retorno_monitoramento` | retorno derivado de monitoramento |
| `visita_avulsa` | visita criada diretamente pelo técnico |

Backfill aplicado apenas onde a inferência é inequívoca (`solicitacao_id`,
`registro_origem_id`, `natureza_registro = 'ocorrencia'`).

### RPCs (todas `SECURITY DEFINER`, `search_path = public`, `GRANT` só para `authenticated`)

| RPC | Papel |
| --- | --- |
| `rpc_criar_visita_idempotente` | **motor único** de criação. Evoluído (não duplicado) para aceitar `p_origem` e os campos estruturados da ocorrência. Idempotente por `client_uuid`. Retorna `registro_id`, `status`, `version`, `origem`, `can_edit`, `next_route`. |
| `rpc_iniciar_atendimento_solicitacao_v1` | aceite de demanda em **uma transação**: `pg_advisory_xact_lock` + `SELECT ... FOR UPDATE`, atribuição atômica do técnico, delegação ao motor único, avanço de status e timeline. Retorna `already_assigned` para o perdedor da disputa. |
| `rpc_listar_atendimentos_tecnicos_v1` | listagem única (demandas + ocorrências + visitas) com busca, aba e paginação no servidor, filtrada por `can_view_technical_visit`. |
| `rpc_resumo_atendimentos_tecnicos_v1` | contadores do painel, coerentes com a listagem. |

## Frontend

| Arquivo | Mudança |
| --- | --- |
| `src/hooks/useAtendimentosTecnicos.ts` | fonte única da listagem e do resumo |
| `src/pages/app/MobileAtendimentos.tsx` | workspace único (`/app/atendimentos`), abas Todos/Demandas/Em andamento/Aguardando/Monitoramento/Ocorrências/Concluídos |
| `src/hooks/useFluxoVisitaTecnica.ts` | sem `INSERT`/`UPDATE` direto; usa a RPC transacional e navega por `next_route` |
| `src/pages/app/MobileRegistrarOcorrencia.tsx` | usa o motor único e segue para o wizard |
| `src/pages/app/MobileDashboardConsultor.tsx` | contadores da RPC; rotas técnicas apenas |
| `src/config/navigation.ts` | aba **Atendimentos** substitui *Demandas* |
| `src/App.tsx` | `/app/registros` e `/app/solicitacoes` redirecionam para `/app/atendimentos` |

Rotas legadas preservadas como redirecionamento — nenhum link antigo quebra.

## Rollback

`restoration/visita-portais-tecnicos/rollback.sql` (forward-safe, transacional).

## Validação

- `tsgo --noEmit`: limpo
- Vitest: **2707 passed | 4 skipped**

## Certificação T1–T18 — reexecução 2026-08-05 (04:4xZ)

| Comando | Timestamp (UTC) | Resultado |
| --- | --- | --- |
| `npx tsgo --noEmit -p tsconfig.app.json` | 04:44Z | PASS (exit 0) |
| `bunx vitest run` | 04:45Z | PASS — 2710 passed / 4 skipped, 163 arquivos |
| `bun run build` | 04:46Z | PASS (exit 0, `built in 25.69s`) |
| `bash restoration/visita-portais-tecnicos/rehearsal.sh` | 04:48Z | `ROLLBACK_REHEARSAL_PASS` (exit 0) |
| Validação do `promotion-manifest.json` (sha256 + tamanho) | 04:47Z | `MANIFEST_VALIDATION PASS` |
| `bash scripts/fiscal-secrets-scan.sh` | 04:47Z | exit 1 — 3 achados **legados**, 0 segredos reais (anon publicável em `src/integrations/supabase/client.ts` e `scripts/rbac-audit/run-rbac-audit.ts`; placeholder `USER:PASSWORD` em `restoration/comunicacao-deploy/env.example`) |
| Runner T1–T18 (`deno run … visita-atendimentos-runtime-harness/index.ts`) | 04:46Z | **exit 1 — `GUARD_ABORT: variaveis ausentes: SUPABASE_SERVICE_ROLE_KEY\|SUPABASE_SECRET_KEY`** |
| E2E mobile/desktop de visita técnica | 04:49Z | não executável — `ERR_MODULE_NOT_FOUND: lovable-agent-playwright-config` (dependência de harness ausente no executor) |

Rebind executado (`supabase--rebind_secrets`): vinculou apenas `SUPABASE_URL` e a
chave publicável. Estado no executor, sem valores: `SUPABASE_URL=SET`,
`SUPABASE_PUBLISHABLE_KEY=SET` (usada como anon), `SUPABASE_ANON_KEY=MISSING`,
`SUPABASE_SECRET_KEY=MISSING`, `SUPABASE_SERVICE_ROLE_KEY=MISSING`.
Os secrets cadastrados em **Edge Function Secrets** do Supabase só são visíveis
ao runtime das Edge Functions, não ao executor CLI — e o gate proíbe endpoint
administrativo, então não há caminho alternativo sem expor a credencial.

O runner CLI implementa realmente os 18 cenários da matriz aprovada (perfis
temporários reais: gestor, consultor, agrônomo, produtor, sem vínculo e técnico
de outra carteira; setup/cleanup em `try/finally`; T6 vira `BLOCKED` se T5
falhar). A credencial administrativa é resolvida só no backend por
`SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_SECRET_KEY` e nunca é impressa.

**BLOQUEIO TÉCNICO EXATO** — variável ausente no executor backend:
`SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`).
Status: **NÃO APTO**. `PRODUCAO_NAO_ACESSADA` · `NAO_PUBLICADO`.

Manifesto de promoção: `restoration/visita-portais-tecnicos/promotion-manifest.json`.
