# Consolidação final — Visita técnica (auditoria)

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção (`navfzbwgwzruipouyfnk`) **não acessada**.
**Não publicado.** Nenhuma migration histórica foi editada; nenhum fluxo paralelo criado.

## Entrega

| Artefato | Descrição |
| --- | --- |
| `supabase/migrations/20260805152009_fea820c5-e032-4a57-adf8-38f010843bf2.sql` | Migration nova, idempotente (`CREATE OR REPLACE`, sem `DROP`), com guard que aborta no ref de produção |
| `restoration/visita-portais-tecnicos/rollback-consolidacao.sql` | Rollback lógico forward-safe (reaplica o baseline `20260805040000` + `20260805041601`), transacional e guardado |
| `restoration/visita-portais-tecnicos/postcheck-consolidacao.sql` | Postcheck read-only: SHA-256 das 18 funções, owner, `SECURITY DEFINER`, `search_path`, ausência de `PUBLIC`/`anon`, ausência de `registros_consultor.data_aprovacao` |
| `playwright.config.ts`, `playwright-fixture.ts` | Executor E2E autossuficiente (`@playwright/test`), sem dependência de harness externo |
| `tests/harnesses/visita-atendimentos-runtime-harness/index.ts` | Runner oficial T1–T18 corrigido |

Nenhum harness destrutivo foi adicionado a `supabase/migrations`.

## Pontos consolidados (1–12)

| # | Item | Estado no repositório |
| --- | --- | --- |
| 1 | `rpc_realizar_checkin_visita` sem `uuid = text` | `p_client_uuid uuid` comparado a `visitas_checkin.client_uuid` (índice único tipado); sem coerção |
| 2 | `has_active_user_cliente_access` | Suporte global **apenas** para `administrador`; demais perfis (inclusive `gestor`) exigem `user_clientes` ativo e vigente |
| 3 | Escopo técnico/consultor | Edição, diagnóstico, check-in, finalização e envio exigem responsável/criador ou participante ativo; gestor decide só na carteira autorizada (`_visita_lock_and_check` + `is_visit_org_manager` + escopo `manage`) |
| 4 | `rpc_upsert_diagnostico_visita` | Autorização (`_assert_visita_editavel` + `can_manage`/participante) **antes** de qualquer escrita; aliases do payload; sincroniza `problema_principal`, `categoria_problema`, `nivel_pressao`, `percentual_area_afetada`, `observacoes_tecnicas`, `urgencia`; incrementa `version`; `forbidden` sem efeito colateral |
| 5 | `rpc_finalizar_visita_v2` | Técnico não atribuído bloqueado; exige cultura, check-in e diagnóstico; `version_conflict` antes de qualquer `UPDATE`, sem escrita parcial nem timeout |
| 6 | Recomendação e aprovação | `btrim` aplicado somente a `estrategia_manejo::text`; aprovação só em `enviado_aprovacao` e por `administrador` ou `gestor` com escopo; `SELECT ... FOR UPDATE`; `version` incrementada; status/timeline/logs; **sem** referência a `registros_consultor.data_aprovacao`; `now()` como timestamp canônico |
| 7 | Reprovação e ajuste | Escopo de aprovador, transições válidas (`enviado_aprovacao` → `reprovado` / `rascunho`), versionamento e logs imutáveis em `aprovacoes_tecnicas`, `registros_consultor_status_log` e `visitas_logs` |
| 8 | Segurança | 18 funções `SECURITY DEFINER` com `search_path=public`, owner `postgres`; `REVOKE` de `PUBLIC` e `anon`; `EXECUTE` mínimo (`authenticated` + `service_role`; `_visita_lock_and_check` apenas interno) |
| 9 | Runner oficial | `user_clientes` inserido **antes** de `user_roles`, com erro de vínculo abortando o setup; recomendação criada **antes** do cenário de aprovação (T14); nenhum segredo impresso |
| 10 | Playwright | `defineConfig`/`devices` de `@playwright/test`; `baseURL` via `E2E_BASE_URL`; `webServer` opcional (`E2E_SKIP_WEBSERVER=1`) |
| 11 | Rotas | `/app/atendimentos` → `rpc_listar_atendimentos_tecnicos_v1`; `MobileDashboardConsultor` → `rpc_resumo_atendimentos_tecnicos_v1`; `/app/visita/novo`, `/app/visita/:id` e `/visita-tecnica/:id` → `rpc_get_visita_workspace`; sete etapas do wizard mobile e estados loading/vazio/erro/bloqueio/offline preservados; `/app/registros` e `/app/solicitacoes` seguem como redirecionamentos |
| 12 | Rollback e postcheck | Criados e executados (ver abaixo) |

## Matriz runtime T1–T18

Evidência independente informada pela auditoria: run **`d5d7582f`** — **18 PASS, 0 FAIL, 0 BLOCKED**;
cleanup PASS (sem usuários, objetos ou fixtures sintéticos remanescentes); triggers habilitados.

Reexecução local do runner **não foi possível**: o executor CLI não expõe
`SUPABASE_SERVICE_ROLE_KEY` nem `SUPABASE_SECRET_KEY` (cadastrados como Edge Function
Secrets, visíveis apenas ao runtime das Edge Functions). O guard fail-closed abortou
com `GUARD_ABORT: variaveis ausentes: SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY`
(exit 1), como projetado — nenhuma credencial foi exposta e nenhum endpoint
administrativo foi criado como contorno.

## Gates locais executados

| Gate | Resultado |
| --- | --- |
| `npx tsgo --noEmit -p tsconfig.app.json` | PASS (exit 0) |
| `bunx vitest run` | PASS — 2710 passed / 4 skipped (163 arquivos) |
| `bun run build` | PASS (exit 0) |
| `npx playwright test --list` | PASS — 76 testes em 9 arquivos (configuração viável, sem dependência externa) |
| `postcheck-consolidacao.sql` | **`POSTCHECK_CONSOLIDACAO_OK`** — 18/18 checksums, owner, `search_path`, grants |
| Verificação de grants | `anon = false` em todas as 18 funções; `PUBLIC` sem `EXECUTE` |

`service_role` não é usado como identidade funcional em nenhum caminho da aplicação —
apenas no runner de certificação, para provisionar e remover fixtures.

## Situação

**APTO NO REPOSITÓRIO** — o repositório reflete exatamente o staging certificado
(checksums conferidos) e todos os gates locais executáveis passaram.
A matriz T1–T18 permanece sustentada pela evidência externa `d5d7582f`; a reexecução
local segue bloqueada pela ausência da credencial administrativa no executor CLI.

`PRODUCAO_NAO_ACESSADA` · `NAO_PUBLICADO`

## Manifesto de promoção

`restoration/visita-portais-tecnicos/promotion-manifest.json` atualizado com os
artefatos da consolidação (migration `20260805152009`, rollback e postcheck de
consolidação, este relatório, `playwright.config.ts` e `playwright-fixture.ts`) e
com o checksum atualizado do runner T1–T18.

Validação sha256 + tamanho dos 15 artefatos: **`MANIFEST_VALIDATION PASS`**.
