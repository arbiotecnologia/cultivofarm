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
