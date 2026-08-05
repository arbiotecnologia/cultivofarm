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

## Auditoria corretiva final — prova runtime (2026-08-05)

Ambiente: staging `ikaauvsflpmamgxmkhoq` (guard fail-closed no marcador `_fiscal_staging_marker`). Produção `navfzbwgwzruipouyfnk` não acessada.

### Defeito adicional encontrado durante a prova (não declarado antes)
`rpc_finalizar_visita_v2` e `_assert_visita_editavel` avaliavam a permissão como
`IF NOT (can_manage OR created_by = uid OR consultor_responsavel = uid OR participante)`.
Com `consultor_responsavel` NULL e nenhum termo verdadeiro, a expressão resultava em `NULL`,
`NOT NULL` = `NULL`, e o `IF` não disparava → **fail-open**: técnico não atribuído passava da
checagem de permissão. Corrigido em `20260805154002_...sql` com `COALESCE(..., false)` por termo
e `IF v_ok IS NOT TRUE THEN RAISE 'sem_permissao'`.

### Resultado do harness `restoration/visita-portais-tecnicos/harness-corretiva.sql`
Executado em transação única com `ROLLBACK` final (zero resíduo), cada RPC chamada sob
`SET LOCAL ROLE authenticated` + `request.jwt.claims` do usuário sob teste (service_role não usado como identidade funcional).

| Caso | Cenário | Esperado | Resultado |
|---|---|---|---|
| C1 | Técnico com vínculo `manage` no cliente, **não atribuído**, grava recomendação | `forbidden_visita` | PASS |
| C1b | Nenhuma linha gravada após a negativa | 0 linhas | PASS |
| C2 | Participante ativo atribuído insere recomendação | versão 1 | PASS |
| C3 | Versão desatualizada (`0`) | `version_conflict` / `P0001` | PASS |
| C4 | Versão futura (`99`) | `version_conflict` / `P0001` | PASS |
| C5 | Linha inalterada após ambos os conflitos | snapshot idêntico | PASS |
| C6 | Versão exata (`1`) | versão 2 | PASS |
| C7 | Finalização por técnico não atribuído | `sem_permissao` | PASS |
| C8 | Finalização por participante atribuído passa da autorização | barra em `cultura_obrigatoria` | PASS |

**RESULTADO: 9 PASS / 0 FAIL — `HARNESS_CORRETIVA_PASS`.**

### Regressão local
- `tsgo --noEmit`: PASS (sem saída de erro)
- `vitest run`: 163 arquivos, **2710 PASS**, 4 skipped
- `bun run build`: PASS (PWA gerado)
- `promotion-manifest.json`: **MANIFEST_VALIDATION PASS**, 18 artefatos com sha256/bytes conferidos
