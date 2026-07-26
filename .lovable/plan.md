# Correção Fase 2 — Módulo de Comunicação

Escopo: aplicar as 9 correções listadas pela auditoria sobre o commit `28d739e9…`, sem publicar, sem aplicar migration externa, sem ativar flags e sem envio real. Todos os artefatos permanecem em `restoration/comunicacao-fase2/` e código Deno/React em `supabase/functions/` e `src/features/comunicacao/`.

## 1. Seeds e coerência de schema

- `seeds.sql`: reescrever para conformidade com Fase 1
  - trocar `ativo` por `status` ('draft'), adicionar `nome`
  - `locale = 'pt-BR'` (com hífen)
  - `estrategia` válida da Fase 1 (ex.: `manual`/`auto` — confirmar enum)
  - `ON CONFLICT (chave, canal, versao)` alinhado à UNIQUE real
  - manter regras `enabled=false`

## 2. Constraints de metadados WhatsApp / assunto Email

- Ajustar migration para exigir metadados/assunto **apenas** quando `status = 'active'`; drafts podem ser incompletos.
- Ativação (RPC `rpc_set_communication_template_metadata` ou similar) valida completude antes de mudar para `active`.
- Atualizar `postcheck.sql`, `rollback.sql`, `harness-rls.sql`, `precheck.sql` para refletir constraints/objetos reais.

## 3. Source-aware para OS on-farm

- Fase 1 `_comunicacao_resolve_recipients`/`_comunicacao_build_snapshot` só olham `ordens_servico`. UNION cego confunde OS regular com on-farm em colisão UUID.
- Criar helpers Fase 2 internos:
  - `_comunicacao_resolve_recipients_v2(_source_type text, _source_id uuid, …)`
  - `_comunicacao_build_snapshot_v2(_source_type text, _source_id uuid, …)`
  - Allowlist estrita (`ordem_servico`, `ordem_servico_onfarm`, `system`, `administrative`); dispatch por CASE (sem SQL dinâmico).
- Triggers `pronto_entrega` (comum e on-farm) chamam a versão v2 com o source correto.
- RPCs Fase 1 permanecem intactas.

## 4. Worker/Payload

- Corrigir tipo `ClaimRow.payload_snapshot`: é o próprio objeto de variáveis (não `{ payload }`).
- Passar snapshot direto a `renderTemplate` e ao mapping do WhatsApp.
- Criar RPC nova `rpc_fail_communication_delivery_v2(uuid, text, text, text, boolean)` service_role-only, lease-safe:
  - permanente → `dead_letter`
  - transitório → `retry` com backoff
  - preserva `worker_id/lease`
- Worker migra para v2; verifica `error` de TODAS as RPCs de terminação (complete/skip/cancel/defer/fail_v2) — se qualquer uma falhar, marca resultado como erro (sem PII) e loga.

## 5. Defer em vez de cancel para canal desligado

- Nova RPC `rpc_defer_communication_delivery(uuid, text, text, int)` service_role-only:
  - devolve item a `pending`, incrementa contador de defer (não de tentativa de provedor), agenda `next_attempt_at = now() + p_delay`.
  - lease-safe (só o worker atual).
- Worker: `provider_not_configured` e adapter OFF → chamar defer (não cancel). `invalid_recipient` continua cancel.

## 6. In-app idempotente por outbox_id

- Nova tabela `comunicacao_inapp_dispatch (outbox_id uuid PK, notification_id uuid NOT NULL, created_at timestamptz)` com RLS deny-all + GRANT só service_role.
- RPC `rpc_dispatch_inapp_notification(p_outbox_id uuid, …)` faz UPSERT: se já existe, retorna notification_id existente sem novo INSERT em `notificacoes_portal`.
- Adapter `inapp-adapter.ts` passa `outbox_id` e usa a nova RPC.
- Atualizar `rollback.sql`, `postcheck.sql`, `harness-rls.sql`, testes.

## 7. WhatsApp Cloud API

- Adicionar coluna `provider_template_status text CHECK IN ('draft','pending','approved','rejected','paused')` em `comunicacao_templates`, snapshot copia esse campo.
- Adapter recusa envio se `≠ 'approved'` (`permanent_error` código `wa_template_not_approved`).
- Validar `WHATSAPP_API_VERSION` contra allowlist em código (`['v20.0','v21.0','v22.0']`); `WHATSAPP_PHONE_NUMBER_ID` numérico via regex `^\d+$`; sem default silencioso.
- `communication-health` reflete essas validações em `configured`.
- Mapping: variável ausente/nula → `permanent_error` `wa_variable_missing` **antes** do fetch.
- Manter sanitização de logs.

## 8. Email

- Timeout real via `Promise.race` com abort do transport (denomailer expõe `.close()`); testes injetam client mock.
- HTML: escape do corpo texto com helper `escapeHtml`, ou enviar somente `text`. Preferir texto puro; se HTML, escape + `<pre>` ou `<br>`.
- Validar `SMTP_PORT` (numérica 1-65535) e modo TLS (`tls`/`starttls`); falha de configuração → **defer** (não cancel).

## 9. UI/UX

- Aba Comunicados: adicionar ação manual `produto_pronto_aplicacao` para admin:
  - seletor de OS regular (query filtrando `origem != 'onfarm'`), exibe código/status
  - confirmação, servidor valida existência e `payload={}`.
- Broadcast idempotency: gerar `crypto.randomUUID()` por intenção; preservar em `useState` durante retries; renovar após sucesso ou reset.
- Modo somente-leitura para `gestor`: aplicar `disabled` em TODAS as áreas mutáveis (templates, regras, comunicados, ação manual OS), não só broadcast.

## 10. Testes e relatório

- Trocar testes regex por comportamentais:
  - payload_snapshot direto na render
  - fail_v2 permanente vs transitório
  - defer de canal desabilitado (sem cancel)
  - terminalização com erro propagado
  - in-app reexecução retorna mesmo `notification_id`
  - mapping ausente aborta sem fetch
  - `WHATSAPP_API_VERSION` inválida → not configured
  - nonce de publicação estável em retries
  - trigger on-farm resolve destinatários on-farm
- Sem rede real (fetch mock + client mock).
- Rodar `bunx tsgo --noEmit`, `vitest src/test/comunicacao/`, suíte completa.
- Atualizar `.lovable/comunicacao-fase2-report.md` com resultados honestos; listar falhas preexistentes; auditoria cruzada final; **não** declarar pronto para staging se houver divergência.

## Arquivos afetados

```text
restoration/comunicacao-fase2/
  migration.sql      (constraints condicionais, helpers v2, RPCs fail_v2/defer/dispatch_inapp, tabela inapp_dispatch, coluna provider_template_status, trigger on-farm)
  seeds.sql          (reescrito conforme Fase 1)
  precheck.sql       (novos objetos)
  postcheck.sql      (novas assinaturas; to_regprocedure)
  rollback.sql       (drop reverso completo)
  harness-rls.sql    (RLS deny-all da nova tabela; grants)
  runbook.md         (novas assinaturas e passos)

supabase/functions/_shared/comunicacao/
  adapters-types.ts  (payload_snapshot direto; provider_template_status)
  email-adapter.ts   (timeout real, escape HTML, defer em config)
  whatsapp-adapter.ts (status approved, version allowlist, mapping strict)
  inapp-adapter.ts   (usa rpc_dispatch_inapp_notification + outbox_id)

supabase/functions/process-communication-outbox/index.ts
  (payload_snapshot direto, fail_v2, defer em canal off, verificação de erro em todas RPCs)

supabase/functions/communication-health/index.ts
  (validações wa version/phone id, smtp port/tls)

src/features/comunicacao/
  api.ts, types.ts   (provider_template_status; ação manual OS; defer)
  ui/ComunicacaoAdminPage.tsx (ação manual, nonce UUID, gestor readonly global)

src/test/comunicacao/fase2.test.ts  (testes comportamentais, sem rede)

.lovable/comunicacao-fase2-report.md (relatório atualizado)
```

## Restrições invioláveis

- `COMMUNICATION_DELIVERY_ENABLED=false`, adapters OFF, VITE flags OFF por default.
- Sem secrets em código/log/UI.
- Sem deploy/publish/migration externa.
- `produto_pronto_aplicacao` continua sem trigger automático.

Aprovação necessária antes de executar por ser mudança extensa e cross-artifact.
