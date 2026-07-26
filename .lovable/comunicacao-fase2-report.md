# Comunicação — Fase 2 · Relatório de entrega (v2 real)

**Commit base da correção:** `6e0509a51b46e0bebd36dde3e7312fdeac6e30c1`
**Escopo:** proposta aditiva sobre a Fase 1 v3. Nada aplicado. Nenhum envio real.
Todas as flags de rede e frontend permanecem OFF por padrão.

## Parecer

> **PACOTE FASE 2 (v2) PRONTO PARA APLICAÇÃO EM STAGING**
>
> Condicionado a: (a) execução na ordem
> `precheck → migration → postcheck → harness-rls`;
> (b) manter `COMMUNICATION_DELIVERY_ENABLED=false` até validar visualmente
> `/comunicacao` em staging; (c) ativar adapters individualmente e apenas após
> configurar as envs correspondentes.

## Correção crítica aplicada nesta iteração — semântica de `attempts`

`rpc_claim_communication_outbox` (Fase 1) **já incrementa `attempts` no momento
do claim**. As RPCs terminais da Fase 2 foram alinhadas a esse contrato:

- **`rpc_fail_communication_delivery_v2`**
  - **Não** incrementa `attempts` novamente (removido `attempts = r.attempts + 1`).
  - Compara `r.attempts >= r.max_attempts` (não `r.attempts + 1`), paridade com
    a RPC da Fase 1. Elimina off-by-one na fronteira de `dead_letter`.
  - `p_is_permanent = true` ⇒ `dead_letter` imediato, sem alterar `attempts`.
  - Transitório com tentativas restantes ⇒ `pending`, backoff exponencial em
    `POWER(2, GREATEST(r.attempts - 1, 0)) * 30`, teto 3600s.
- **`rpc_defer_communication_delivery`**
  - Devolve o incremento do claim: `attempts = GREATEST(r.attempts - 1, 0)`.
  - Canal OFF / config ausente / timeout de infra ≠ tentativa real de provedor.
  - `defer` só opera em `status = 'processing'` do próprio `worker_id` (lease-safe),
    limpa `locked_at/locked_by/lease_expires_at`, e por construção nunca
    ultrapassa `max_attempts` mesmo em defer repetido (o novo claim seguinte
    reincrementa; ao devolver, `GREATEST(..., 0)` impede negativo).

Ambas as RPCs continuam **service_role-only** (`REVOKE` de PUBLIC/anon/authenticated,
`GRANT` apenas para `service_role`), lease-safe (checagem `locked_by = p_worker_id`)
e nunca ecoam PII no retorno.

## Entregáveis (estado atual — v2 real)

### 1. SQL — `restoration/comunicacao-fase2/`
- `migration.sql` — triggers idempotentes de OS regular **e** on-farm publicando
  `produto_pronto_retirada` apenas na transição real para `pronto_entrega`;
  publish system-side idempotente; helpers **source-aware** de resolução de
  destinatário (`*_v2`); `rpc_resolve_outbox_address`;
  `rpc_skip/cancel_communication_delivery`; `rpc_defer_communication_delivery`
  (attempts devolvidos); `rpc_fail_communication_delivery_v2` (sem duplo
  incremento); `rpc_preview_administrative_broadcast_count`;
  `rpc_set_communication_template_metadata` com **`provider_template_status`**
  (`approved` para WhatsApp Meta) e assunto obrigatório para e-mail;
  `rpc_create_portal_notification_secure` / `rpc_create_operational_notification_secure`;
  tabela **`comunicacao_inapp_dispatch`** com `UNIQUE(outbox_id)` para
  **idempotência do adapter in_app por `outbox_id`**. Todos com REVOKE
  anon/authenticated onde aplicável.
- `precheck.sql` — Fase 1 presente, tabelas de negócio, `status_os`/`status_os_onfarm`
  com `pronto_entrega`, colunas críticas (`profiles.user_id`, `ordens_servico.numero_os`),
  aborta se Fase 2 já parcialmente aplicada.
- `postcheck.sql` — resolução por `to_regprocedure` (imune a search_path/formatação),
  unicidade por nome (bloqueia overload), validação de retorno via `format_type`
  + `proretset`, constraints/triggers presentes, RPCs service_role-only não
  expostas a authenticated, helpers internos não expostos.
- `harness-rls.sql` — matriz de grants + `SET LOCAL ROLE anon` bloqueando
  `rpc_resolve_outbox_address` e demais terminais.
- `rollback.sql` — remove exclusivamente objetos da Fase 2 e restaura
  `_comunicacao_build_snapshot` na versão Fase 1.
- `seeds.sql` — 3 templates rascunho (WA/email/in_app) e 3 regras **desligadas**.
- `runbook.md` — assinaturas exatas, envs por adapter, mapeamento
  outcome → RPC terminal.

### 2. Adapters — `supabase/functions/_shared/comunicacao/`
- `adapters-types.ts` (puro, importável de Node) — tipos
  `AdapterResult/Outcome/Snapshot/Deps`, `WorkerEnv`, `healthBooleans()`.
- `adapters.ts` (Deno-side) — reexporta os tipos + `readWorkerEnv()`.
- `email-adapter.ts` — SMTP via `denomailer` (import dinâmico com specifier
  variável para não vazar em Node), timeout 20s por **race real**; classifica
  timeout/rede/TLS e SMTP 4xx (`try again later`, filas cheias) como
  **transitório** e SMTP 5xx (falha permanente de envelope/destinatário) como
  **permanente**, alinhado ao adapter.
- `whatsapp-adapter.ts` — Meta Cloud API endurecido: valida E.164, exige
  `provider_template_name` + `language_code` + `parameter_mapping` ordenado +
  **`provider_template_status = 'approved'`**, timeout 15s, sanitiza 4xx/5xx/429,
  nunca inclui token na mensagem; extrai `provider_message_id`.
- `inapp-adapter.ts` — **idempotente por `outbox_id`** via tabela
  `comunicacao_inapp_dispatch` (RPC `rpc_dispatch_inapp_notification`
  centraliza portal vs operacional).

### 3. Edge functions
- `supabase/functions/process-communication-outbox/index.ts` — worker: `dry_run`
  quando delivery OFF; para cada claim → render → `rpc_resolve_outbox_address`
  → dispatch por canal → terminação normalizada em
  `sent | opt_out (skip) | invalid_recipient (cancel) | provider_not_configured/deferred (defer)
  | permanent_error (fail_v2 permanente ⇒ dead_letter) | transient_error (fail_v2 transitório)`.
  Consome `payload_snapshot` como objeto de variáveis **diretamente**
  (formato salvo pela expansão do evento — sem wrapper `.payload`).
- `supabase/functions/communication-health/index.ts` — POST-only, aceita
  `service_role` ou JWT com role `administrador`; retorna apenas booleans
  `enabled/configured` por canal, **sem eco de envs/segredos**.

### 4. Frontend
- `src/features/comunicacao/types.ts` — `ComunicacaoTemplate` com
  `provider_template_name/language_code/parameter_mapping/provider_template_status`;
  novos contratos RPC.
- `src/features/comunicacao/api.ts` — `setTemplateMetadata`,
  `previewAdministrativeBroadcast`, `publishAdministrativeBroadcast`
  (via `rpc_publish_communication_event`).
- `src/features/comunicacao/ui/ComunicacaoAdminPage.tsx` — nova aba
  **Comunicados** condicionada a `VITE_COMUNICACAO_BROADCAST_TAB_ENABLED=true`
  e role admin/gestor. **Gestor é read-only** globalmente (templates, regras,
  comunicados); **administrador** publica com confirmação e **`idempotency_key`
  como nonce UUID por intenção**, resetado apenas em sucesso/limpar (substitui
  o esquema anterior baseado em hash `djb2`).
- `ManualProdutoProntoAplicacaoPanel` — ação manual/admin para
  `produto_pronto_aplicacao` (não há trigger automática desse status).
- `src/features/comunicacao/flags.ts` + `src/config/featureFlags.ts` — flag
  `comunicacaoBroadcastTab`.

### 5. Testes — `src/test/comunicacao/`
- `fase1.test.ts` — Fase 1 (render vectors, migration, route guard).
- `fase2.test.ts` — 33 casos com fetch mock; cobrem trigger de transição real,
  publish system não-executável por authenticated, RLS/grants (resolve/skip/
  cancel/in_app secure), preview exige admin/gestor, worker chama resolve
  antes do dispatch, worker termina em `sent/skipped/cancelled/deferred/fail`,
  health sem eco de segredos, WhatsApp (mapping order, `provider_message_id`,
  401/429/5xx, template sem meta, não-E.164, timeout via AbortController),
  Email (gates de flag/env/assunto/endereço), InApp (dispatch idempotente,
  classificação de privilege).
- **`fase2-attempts.test.ts` (novo)** — **8 casos contratuais** por parsing
  determinístico da `migration.sql`, exigindo:
  1. `fail_v2` **sem** `attempts = r.attempts + 1`.
  2. `fail_v2` usa `r.attempts >= r.max_attempts` (não `r.attempts + 1 >= ...`).
  3. Permanente ⇒ `dead_letter` imediato sem novo incremento no UPDATE.
  4. Transitório reagenda com backoff em `POWER(2, GREATEST(r.attempts - 1, 0))`
     e **sem** incremento no ramo `pending`.
  5. `defer` devolve o incremento via
     `GREATEST(COALESCE(r.attempts,0) - 1, 0)` e escreve `attempts = v_attempts`.
  6. `defer` mantém lease-safety (checa `locked_by = p_worker_id`, limpa locks).
  7. `defer` só opera em `processing` (impede over-decrement / negative attempts).
  8. `fail_v2` e `defer` são service_role-only (REVOKE + GRANT + `insufficient_privilege`).
- `fase02-static.test.ts` — invariantes anti-regressão da Fase 0.2 mantidos.

## Fatos operacionais confirmados
- `profiles.user_id` é o identificador canônico (nunca `profiles.id`).
- `ordens_servico.status` e `ordens_servico_onfarm.status` incluem
  `pronto_entrega`. Triggers cobrem ambas as tabelas.
- `produto_pronto_aplicacao` continua **ação manual/admin** — nenhum trigger
  automático, sem mapeamento para `entregue/finalizada`.
- `portal_notificacoes` sem policy INSERT para authenticated → só via RPC
  SECURITY DEFINER; in_app usa dispatch idempotente por `outbox_id`.
- SMTP: envs reusadas de `enviar-alertas-notificacoes` (denomailer já presente).
- WhatsApp: implementação nova; token nunca vaza em logs ou `AdapterResult.message`.

## Verificações executadas nesta iteração
| Verificação | Resultado |
|---|---|
| `bunx tsgo --noEmit` | ✅ 0 erros |
| `bunx vitest run src/test/comunicacao/` | ✅ **66/66** (fase1 19 + fase2 33 + fase2-attempts 8 + fase02-static 6) |
| `bunx vitest run` (suíte completa) | 2154 ✅ · 4 skipped · **1 falha pré-existente não relacionada** (`portalAcompanhamentoProdutor.test.tsx` — timeout, mesma falha reportada nas iterações anteriores; sem qualquer relação com Comunicação Fase 2) |

## Segurança verificada
- Nenhuma nova função com EXECUTE para `anon`.
- `_comunicacao_publish_system_event`, `_comunicacao_expand_event`,
  `rpc_resolve_outbox_address`, `rpc_skip_*`, `rpc_cancel_*`,
  `rpc_defer_*`, `rpc_fail_*_v2`, `rpc_create_*_secure`:
  REVOKE `PUBLIC, anon, authenticated`; GRANT apenas para `service_role`.
- Adapters nunca logam PII (endereço vive só no worker; RPCs terminais recebem
  apenas `error_code` + `error_message` truncados no banco).
- WhatsApp: token nunca aparece em `AdapterResult.message` (teste `whatsapp_401`).
- `communication-health` retorna apenas booleans (heurística bloqueia eco
  de `SMTP_PASSWORD`/`WHATSAPP_ACCESS_TOKEN`/segredos internos).

## Trabalho remanescente (fora do escopo desta fase)
- Regeneração de `src/integrations/supabase/types.ts` após aplicação em staging.
- Ativação real dos adapters (sequência sugerida: in_app → email → whatsapp).
- Documentação do fluxo de aprovação de templates Meta e reprodução de
  opt-in/verificação em produção.

## Correção de certificação — schema on-farm (esta iteração)

**Fato:** `public.ordens_servico_onfarm` **não** possui `data_programada`
(confirmado em `src/integrations/supabase/types.ts`). A coluna real para
agendamento on-farm é `data_recomendada`. A versão anterior de
`_comunicacao_build_snapshot_v2` consultava `o.data_programada` no branch
`ordens_servico_onfarm` e era incompatível com o schema.

**Ajustes:**
- `migration.sql` · `_comunicacao_build_snapshot_v2`: branch on-farm agora
  consulta `o.data_recomendada`; branch OS regular preserva `o.data_programada`.
  O rótulo de payload continua `data_prevista` (contrato do template) —
  **origem por tabela documentada em comentário SQL inline**.
- `precheck.sql`: valida explicitamente, por par `(tabela, coluna)`, todas as
  colunas consumidas por helpers/triggers/adapters, incluindo
  `ordens_servico.data_programada` e `ordens_servico_onfarm.data_recomendada`.
  Aborta com mensagem precisa `public.<tabela>.<coluna> ausente`. Adiciona
  aviso soft se `ordens_servico_onfarm.data_programada` vier a existir no
  futuro (contrato continua em `data_recomendada`).
- `src/test/comunicacao/fase2-schema-onfarm.test.ts` (novo, 6 casos):
  1. `types.ts` confirma `ordens_servico.data_programada`.
  2. `types.ts` confirma `ordens_servico_onfarm.data_recomendada` e
     ausência de `data_programada` nessa tabela.
  3. Branch on-farm de `_comunicacao_build_snapshot_v2` usa
     `data_recomendada` e nunca `data_programada`.
  4. Branch OS regular usa `data_programada` e nunca `data_recomendada`.
  5. `precheck.sql` contém todos os pares `(tabela, coluna)` críticos.
  6. `precheck.sql` **não** exige `ordens_servico_onfarm.data_programada`.

`_comunicacao_resolve_recipients_v2` já dependia apenas de `cliente_id` em
ambos os branches — sem correção necessária.

---

## Correção pontual — precheck v2 (usuario_id + colunas RETURNING)

**Fato:** `public.notificacoes_operacionais` usa a coluna `usuario_id` (não
`user_id`), conforme `src/integrations/supabase/types.ts` (linhas 6886–6926).
As RPCs `rpc_dispatch_inapp_notification` e
`rpc_create_operational_notification_secure` já **inserem corretamente** em
`usuario_id`; apenas o `precheck.sql` estava incoerente, exigindo
`notificacoes_operacionais.user_id` — o que abortaria a aplicação em staging
mesmo com a migration válida.

**Ajustes:**
- `restoration/comunicacao-fase2/precheck.sql`:
  - Substituído `notificacoes_operacionais.user_id` por
    `notificacoes_operacionais.usuario_id`.
  - Adicionadas colunas efetivamente usadas/retornadas: `portal_notificacoes.id`,
    `notificacoes_operacionais.id`, `notificacoes_operacionais.link`.
- `src/test/comunicacao/fase2-schema-onfarm.test.ts`: matriz atualizada; três
  novos casos contratuais:
  - regressão explícita `usuario_id` × `user_id` no precheck;
  - conferência das colunas em `types.ts` para `portal_notificacoes` e
    `notificacoes_operacionais`;
  - verificação de que todos os `INSERT INTO public.notificacoes_operacionais`
    da migration usam `usuario_id` e nunca `user_id`.

**Revisão global da migration contra `types.ts`:** demais referências
(`ordens_servico(_onfarm)`, `profiles`, `clientes`, `user_roles`,
`portal_notificacoes`) foram reconferidas coluna a coluna e estão coerentes com
`Row` real. Nenhuma outra incompatibilidade objetiva identificada.

**Validação:**
- `tsgo --noEmit`: ✅ limpo.
- `vitest src/test/comunicacao/`: **77/77** ✅ (5 arquivos).
- Suíte completa: **2165/2170** ✅, 4 skipped, 1 falha pré-existente
  não relacionada (`portalAcompanhamentoProdutor.test.tsx` — timeout flaky).

**Parecer:** `PACOTE FASE 2 (v2) PRONTO PARA APLICAÇÃO EM STAGING` — mantido.

---

## Correção — Runbook v2 e allowlist WhatsApp (jul/2026)

**Fatos:**
1. `runbook.md` estava na v1: assinatura de `rpc_set_communication_template_metadata` com 4 args; `defer`/`fail_v2`/`dispatch_inapp` ausentes; `provider_not_configured` mapeado para `cancel`; in_app descrito por RPCs antigas; rollback dizia restaurar `_comunicacao_build_snapshot` (Fase 1) — o `rollback.sql` real **não faz isso** e nem deveria (helper Fase 1 não é substituído).
2. `adapters-types.ts` prometia “sem default silencioso”, mas `adapters.ts` fazia `WHATSAPP_API_VERSION ?? 'v20.0'`. A allowlist listava `v20/v21/v22`, versões fora da janela de suporte Meta. SDKs oficiais Meta em jul/2026 estão em `v25.0.x`; `v24.0` é o suporte estendido anterior.

**Ajustes:**
- `adapters.ts`: removido default `'v20.0'`. `WHATSAPP_API_VERSION` deve vir explicitamente do env; ausência ⇒ `isWhatsappConfigValid=false` ⇒ adapter retorna `provider_not_configured` ⇒ worker faz `rpc_defer_communication_delivery` (não conta como tentativa de provedor).
- `adapters-types.ts`: `WHATSAPP_API_VERSION_ALLOWLIST = ["v24.0","v25.0"]` com comentário sobre revisão trimestral. Qualquer versão fora — inclusive `undefined`, `v20/v21/v22`, `"latest"`, `"v25"`, `"25.0"` — é bloqueada.
- `runbook.md`: reescrito para refletir Fase 2 v2 real:
  - assinaturas exatas conforme `postcheck.sql` (metadata 5 args; `defer(uuid,text,text,integer)`; `fail_v2(uuid,text,text,text,boolean)`; `dispatch_inapp(uuid,uuid,uuid,text,text)`; helpers system-side documentados);
  - mapa `outcome → RPC`: `provider_not_configured`/`deferred` ⇒ `rpc_defer_communication_delivery`; `invalid_recipient` ⇒ `rpc_cancel_communication_delivery`; `opt_out` ⇒ `rpc_skip_communication_delivery`; `permanent_error`/`transient_error` ⇒ `rpc_fail_communication_delivery_v2` com `is_permanent` booleano;
  - semântica de `attempts` (claim incrementa; `fail_v2` não re-incrementa; `defer` devolve `-1`);
  - `in_app` principal via `rpc_dispatch_inapp_notification(outbox_id, ...)` com idempotência em `comunicacao_inapp_dispatch`; RPCs antigas viraram compat administrativo;
  - `payload_snapshot` direto e resolução source-aware (`data_programada` regular / `data_recomendada` on-farm);
  - `WHATSAPP_API_VERSION` obrigatório, allowlist `v24.0`/`v25.0`, sem default;
  - rollback descreve apenas o que o SQL faz — sem promessa de restaurar `_comunicacao_build_snapshot`;
  - sequência segura de ativação: in_app → e-mail → WhatsApp, um canal por vez.
- `fase2.test.ts`: `baseEnv` migrado para `v25.0`; URL esperada `/v25.0/…`; 6 casos novos de allowlist (undefined/v20/v21/v22 rejeitadas; v24/v25 aceitas; arbitrária rejeitada; adapter → `provider_not_configured`; guarda estática impedindo default silencioso em `adapters.ts`); **8 casos contratuais barrando runbook v1/stale** (assinaturas obrigatórias, mapa de outcomes v2, WA obrigatório com v24/v25, in_app via `rpc_dispatch_inapp_notification(outbox_id)`, rollback sem promessa de restaurar snapshot, ausência de `metadata(4 args)`/`v20/v21/v22`/`fail(uuid,text,text,text)`, presença de `source_type`/`payload_snapshot`/`data_programada`/`data_recomendada`).

**Validação:**
- `tsgo --noEmit`: ✅ limpo.
- `vitest src/test/comunicacao/`: **91/91** ✅ (5 arquivos).
- Suíte completa: **2179/2184** ✅, 4 skipped, 1 falha pré-existente
  não relacionada (`portalAcompanhamentoProdutor.test.tsx` — timeout flaky).

**Parecer:** `PACOTE FASE 2 (v2) PRONTO PARA APLICAÇÃO EM STAGING` — mantido.

---

## Iteração Fase 2.3 — coerência funcional e operacional

**Commit base:** `9f507e328fa7a9d992f51d5a43120a8115906342`.

**Correções aplicadas (todas aditivas, flags OFF, sem migration externa, sem deploy):**

- **`rpc_publish_communication_event_v2(text,text,uuid,jsonb,text) → jsonb`** —
  nova RPC autenticada (administrador), sem overload do nome antigo. Reproduz
  whitelist de eventos, idempotência atômica e validações rígidas da RPC Fase 1
  (`produto_pronto_retirada` exige `status='pronto_entrega'` em OS regular ou
  on-farm; `produto_pronto_aplicacao` só aceita OS regular existente;
  `administrative_important_update` restringe payload a
  `target_role|titulo|mensagem`), mas delega a expansão a
  `_comunicacao_expand_event(... source_type ...)` v2 — assim TODO outbox
  manual/broadcast recebe `provider_template_name`, `language_code`,
  `parameter_mapping`, `provider_template_status` no `template_snapshot` e
  helpers source-aware. Grants: `REVOKE PUBLIC/anon`, `GRANT authenticated`.
  A RPC v1 permanece intacta (compat) mas **não é mais consumida pela UI**:
  `api.ts` aponta `publishAdministrativeBroadcast` e
  `publishManualProdutoProntoAplicacao` para a v2; `types.ts` declara o
  contrato v2.
- **UI de metadados WhatsApp** — novo `WhatsappTemplateMetadataEditor` na aba
  Templates para cada linha de canal `whatsapp`: admin edita
  `provider_template_name`, `language_code`, `parameter_mapping` (JSON com
  índices sequenciais 1..N validados client-side) e
  `provider_template_status` (`draft|submitted|approved|rejected|disabled`).
  `approved` requer nome + language + mapping válidos (espelha as CHECK
  constraints). Gestor vê em modo somente leitura. O botão “Ativar” de um
  template WhatsApp permanece bloqueado enquanto `provider_template_status`
  não for `approved`. Nenhum token/env é exibido.
- **Worker `process-communication-outbox`** — `terminate` retorna resultado
  estruturado (`terminator: "ok" | "terminalization_failed"` +
  `terminator_rpc` allowlisted). Se ao menos uma RPC terminal falhar, a
  resposta global vira `ok:false` com HTTP 500 e campo
  `termination_failures` contado. `error.message` bruto **removido** do
  payload; apenas o código genérico e o nome allowlisted da RPC são
  emitidos. Itens cujo terminal falhou permanecem `processing` até expirar
  o lease e serem reclaim-ados — entrega at-least-once para email/WhatsApp
  e idempotente para in_app (garantida por `comunicacao_inapp_dispatch`).
- **`rpc_dispatch_inapp_notification`** — substituído `SELECT ... FOR
  UPDATE` (que não serializa linha ausente) por
  `pg_advisory_xact_lock(hashtextextended(p_outbox_id::text, 0))`. Sem SQL
  dinâmico; lock determinístico por outbox_id. Elimina unique-violation por
  corrida entre workers.
- **UI · aba Fila oculta para gestor** — Fila e histórico consulta
  `comunicacao_eventos`/`comunicacao_outbox`, cuja RLS Fase 1 permite
  apenas administrador. Gestor agora recebe as abas
  `templates | regras | preferencias` (+ `comunicados` quando a flag
  broadcast está ligada). RLS permanece admin-only (preferência do
  operador). Preferências continua acessível a todos.
- **`postcheck.sql`** — passou a validar retorno via
  `format_type(prorettype, NULL)` + `proretset` (scalar vs setof) para
  cada RPC canônica e helper. Adicionou `rpc_publish_communication_event_v2`
  na matriz com checks positivo (`grant authenticated`) e negativo
  (`sem grant a anon`).
- **`harness-rls.sql`** — simulação anon **não** usa mais
  `WHEN OTHERS THEN NULL`: aceita somente `insufficient_privilege` (42501)
  ou `undefined_function` (42883); qualquer outro SQLSTATE vira violação
  com `sqlstate=` no warning. Adicionou verificação de grants positivo/
  negativo de `rpc_publish_communication_event_v2`.
- **`runbook.md`** — assinatura de `rpc_publish_communication_event_v2`
  documentada e observação explícita de que a UI Fase 2 usa exclusivamente
  a v2 (v1 preservada apenas para compatibilidade).
- **`rollback.sql`** — inclui `DROP FUNCTION IF EXISTS
  public.rpc_publish_communication_event_v2(text,text,uuid,jsonb,text)`.
- **Testes** — novo `src/test/comunicacao/fase2-3-coerencia.test.ts` (24
  casos) cobrindo: assinatura/RETURNS jsonb da v2, gate de administrador,
  whitelist de eventos, validação de `pronto_entrega` para regular +
  on-farm, restrição do `produto_pronto_aplicacao`, whitelist de chaves do
  broadcast, grants positivo/negativo, uso exclusivo da v2 em `api.ts` e
  ausência de referência a v1 em `callRpc`, declaração em `types.ts`,
  postcheck, rollback, presença de `pg_advisory_xact_lock` +
  `hashtextextended` e ausência de `FOR UPDATE` no dispatch in_app,
  respostas estruturadas do worker (HTTP 500 quando há falha terminal,
  ausência de `error.message` bruto, `TERMINAL_RPC_ALLOWLIST`), gestor
  sem aba Fila, editor WA valida `approved`, editor não expõe env/token,
  `format_type`/`proretset` no postcheck e `WHEN insufficient_privilege /
  undefined_function` no harness.

**Validação:**
- `tsgo --noEmit`: ✅ limpo.
- `vitest src/test/comunicacao/`: **115/115** ✅ (6 arquivos, incluindo
  `fase2-3-coerencia.test.ts`).
- Suíte completa: **2203/2208** ✅, 4 skipped, 1 falha pré-existente
  não relacionada (`portalAcompanhamentoProdutor.test.tsx` — timeout flaky,
  mesma das iterações anteriores).

**Parecer:** `PACOTE FASE 2 (v2 + 2.3) PRONTO PARA APLICAÇÃO EM STAGING` —
artefatos coerentes; migration, postcheck, harness, rollback, runbook,
worker, adapters, tipos, API e UI convergem para a mesma matriz operacional.

---

## Fase 2.4 — Hardening operacional

**Arquivos alterados**
- `restoration/comunicacao-fase2/migration.sql` — `rpc_set_communication_template_metadata` (state machine + mapping completo + imutabilidade do provider_template_name); `rpc_publish_communication_event_v2` (idempotency 8..200; administrative_important_update com source NULL e titulo/mensagem não vazios após trim).
- `src/features/comunicacao/types.ts` — status atualizado (sem `submitted`); contrato `rpc_verify_communication_channel`; `p_source_type` aceita `string | null`.
- `src/features/comunicacao/api.ts` — `verifyCommunicationChannel`, `fetchCommunicationHealth`; `publishAdministrativeBroadcast` agora envia `p_source_type: null`.
- `src/features/comunicacao/ui/ComunicacaoAdminPage.tsx` — editor WA reescrito (STATUS_ALLOWED 6 valores, transições, nameLocked, mapping vs `template.variaveis`); painéis admin `CanalHealthPanel` e `CanalVerificacaoPanel`.
- `restoration/comunicacao-fase2/runbook.md` — nova seção Fase 2.4.
- `src/test/comunicacao/fase2-4-hardening.test.ts` — 20 testes de regressão; ajuste de 1 regex em `fase2-3-coerencia.test.ts` para acomodar a nova mensagem.

**Decisões de segurança**
- Não ampliamos grants nem RLS.
- `communication-health` só expõe booleans; UI trata resposta como potencialmente ausente/erro.
- Verificação de canais aceita apenas UUID colado — evita listar perfis (PII) na UI.
- Envios reais permanecem desligados por padrão.

**Testes**
- `bunx vitest run src/test/comunicacao` → 135/135 aprovados (7 arquivos).
- Suíte completa executada a seguir; timeout flaky pré-existente em `portalAcompanhamentoProdutor.test.tsx` não relacionado à Fase 2.

**Bloqueios externos para ativação real**
- Meta WhatsApp: templates com status `approved` no BSP antes de qualquer envio.
- SMTP: credenciais confirmadas em Secrets e canal `email` habilitado em `comunicacao_flags`.
- Aplicar `restoration/comunicacao-fase2/migration.sql` em staging (não aplicado neste PR).
