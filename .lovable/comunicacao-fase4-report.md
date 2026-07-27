# Comunicação — Fase 4 (Recibos WhatsApp e Observabilidade)

**Data:** 2026-07-27  
**Base:** commit `b09c7bcda5e308032524327aa0dbf276865f0257`  
**Estado:** proposto e verificado localmente. **NÃO aplicado**, **não publicado**, **sem secrets configurados**, **todas as flags de entrega permanecem OFF**.

## Escopo entregue

Aditivo sobre Fase 2, respeitando as regras: o enum `comunicacao_outbox_status` e a semântica do worker **não** foram alterados. `outbox.status='sent'` continua sendo o aceite do provedor (retorno Meta `messages[].id`); o estado posterior de entrega vive em colunas próprias e em uma tabela append-only.

### 1. SQL (`restoration/comunicacao-fase4/`)
- `migration.sql` — colunas de recibo (`provider_delivery_status`, `provider_status_at`, `delivered_at`, `read_at`, `provider_failed_at`) e `CHECK` allowlist; índice parcial de correlação `(canal='whatsapp', provider_message_id)`; tabela `comunicacao_provider_receipts` (RLS ON; SELECT admin; trigger `BEFORE UPDATE/DELETE` que bloqueia mutação inclusive para service_role); RPC `rpc_record_whatsapp_delivery_status(text,text,timestamptz,text)` `SECURITY DEFINER`, `GRANT EXECUTE` **somente** para `service_role`, com máquina monotônica (`sent<delivered<read`; `failed` lateral; `deleted` só registra), lock `FOR UPDATE` na outbox e idempotência atômica via `ON CONFLICT (provider, provider_message_id, status, provider_timestamp)`.
- `precheck.sql` — exige Fase 2 aplicada, aborta se houver `provider_message_id` duplicado em whatsapp, garante ambiente limpo.
- `postcheck.sql` — valida colunas, CHECK, índice, RLS, política única admin, trigger append-only, RPC (assinatura + retorno `jsonb`), grants (positivos e negativos) e integridade do enum outbox.
- `rollback.sql` — remove exclusivamente objetos Fase 4; nada da Fase 1/2 é tocado.
- `harness-rls.sql` — read-only; simula `authenticated` e `anon`, exige falha em SELECT/INSERT/EXECUTE.
- `runbook.md` — princípios, contrato SQL, ordem de aplicação e bloqueios externos.

### 2. Edge Function `whatsapp-status-webhook`
- **GET**: challenge Meta com comparação constant-time do `hub.verify_token` contra `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; devolve `hub.challenge` como `text/plain` só em 200.
- **POST**: público (Meta não envia JWT). `verify_jwt=false` **apenas** para essa função em `supabase/config.toml` (nenhuma outra função foi alterada).
- Body limitado a 128 KiB antes de `JSON.parse`; verificação HMAC-SHA256 do RAW body via `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`, comparação constant-time real via WebCrypto.
- Após assinatura, valida `object`, `field`, `messaging_product`, `metadata.phone_number_id == WHATSAPP_PHONE_NUMBER_ID`, limites de entries/changes/statuses/strings; extrai **apenas** `id/status/timestamp/error_code`; ignora mensagens recebidas, contatos e mídia; nada de PII em logs/respostas.
- Chama `rpc_record_whatsapp_delivery_status` com service_role; contadores agregados `received/recorded/unmatched/errors/ignored` sem PII.
- Parser + HMAC extraídos para módulo puro `whatsapp-webhook-parser.ts` (importável em Node/Deno) — usado pelos testes contratuais.

### 3. Observabilidade e UI
- `WorkerEnv` estendido com `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_ENABLED`; `healthBooleans()` passa a expor **apenas booleans** `whatsapp_webhook.configured/enabled` (sem valores).
- Fila de Comunicação admin (`ComunicacaoAdminPage.tsx`, `FilaPanel`) exibe agora status do provedor, timestamps (via `title`) e código sanitizado; filtros locais por canal e `provider_delivery_status` (sem polling agressivo). Gestor continua sem acesso à Fila (RLS de eventos/outbox já restringe a administrador).
- Tipos manuais (`src/features/comunicacao/types.ts`) receberam campos Fase 4 na `ComunicacaoOutbox` e nova `ComunicacaoProviderReceipt` (compat até regen de `types.ts`).

### 4. Kit de deploy (`restoration/comunicacao-deploy/`)
- `apply-staging.sh` — passo Fase 4 (`precheck+migration+postcheck` atômico) + harness Fase 4, sequenciado **após** o harness Fase 2 e **antes** dos seeds opcionais.
- `deploy-functions-staging.sh` — allowlist agora com **três** funções: `communication-health`, `process-communication-outbox`, `whatsapp-status-webhook`.
- `verify-staging.sh` — reexecuta postcheck/harness Fase 4 e roda `smoke-staging-fase4.sql` (novo, estritamente read-only); health check inclui `whatsapp_webhook.enabled == false` na validação.
- `rollback-staging.sh` — Fase 4 removível isoladamente sob `ROLLBACK_COMMUNICATION_FASE4=true`, sempre antes da Fase 2 (que continua exigindo `ROLLBACK_COMMUNICATION=true`).
- `env.example` — documenta nomes de segredos WhatsApp (sem valores). Nenhum segredo é enviado ao webhook via kit; as variáveis vivem em Project Settings → Secrets.
- `checklist-manual.md` — bloco Fase 4 cobrindo challenge GET, POST com/sem assinatura válida, promoção `sent→delivered→read`, chegada fora de ordem, `failed`/`deleted`, duplicata idempotente e `id` desconhecido (`unmatched`).

## Testes

- `bash -n` em todos os scripts do kit: **OK**.
- Suíte comunicação: `10/10 arquivos, 178/178 testes verdes` (inclui `fase4.test.ts` com 23 casos: SQL, kit, parser, HMAC, health, `config.toml`).
- Suíte completa: **2267/2271 verdes** (4 skipped, nenhum novo flaky). Typecheck (`tsgo --noEmit`) sem erros.

## Bloqueios externos (não executados aqui)

1. Registrar URL do webhook no App Meta → Webhooks → WhatsApp Business Account, campo `messages`.
2. Configurar em Project Settings → Secrets: `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_ENABLED=true` (o `WHATSAPP_PHONE_NUMBER_ID` já é usado pelo worker).
3. Rodar `restoration/comunicacao-deploy/apply-staging.sh` e `deploy-functions-staging.sh` em staging.
4. Executar o challenge GET pelo dashboard Meta após o deploy.

## Parecer

Fase 4 é aditiva, idempotente e reversível. O estado de entrega Meta fica desacoplado do aceite do provedor, sem alterar `outbox.status` nem tocar no worker. A superfície de PII no banco/logs é zero por construção — recibos armazenam apenas `provider_message_id`, `status`, `timestamp` e `error_code` sanitizado. Nenhuma flag é habilitada, nenhum segredo é comitado e nenhuma função além da webhook Meta teve `verify_jwt` alterado.
