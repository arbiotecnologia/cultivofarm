# Comunicação · Fase 4 · Correção Final (v3)

Base: commit `a72a3dd89f567b1257267b3e42b74646ebc95215`. Não aplicado externamente. Nenhum segredo tocado.

## 1) Feature flag real + health
- `whatsapp-status-webhook/index.ts`: lê `WHATSAPP_WEBHOOK_ENABLED`. Com POST **assinado válido** e flag `false` → `200 {ok:true,disabled:true,received:0}` sem parse JSON, sem RPC, sem tocar banco. `413` (payload_too_large) e `401` (invalid_signature) continuam ocorrendo antes do gate. GET challenge segue operante para configuração inicial.
- `adapters-types.ts::isWhatsappWebhookConfigValid`: agora exige `WHATSAPP_APP_SECRET` **e** `WHATSAPP_WEBHOOK_VERIFY_TOKEN` **e** `WHATSAPP_PHONE_NUMBER_ID` numérico. `healthBooleans.whatsapp_webhook` continua exclusivamente `{enabled,configured}` (só booleans).

## 2) Desempenho
- Novo helper puro `_shared/comunicacao/concurrency.ts` com `runWithConcurrency(items, limit, worker)` e clamp `MAX_WEBHOOK_CONCURRENCY=8` (default `DEFAULT_WEBHOOK_CONCURRENCY=8`). Pool determinístico, preserva ordem dos resultados, cancela reserva de trabalho novo ao primeiro erro e rejeita com o primeiro erro observado.
- Webhook: substituído o loop sequencial por `runWithConcurrency(parsed.statuses, DEFAULT_WEBHOOK_CONCURRENCY, ...)`. Nenhum `Promise.all` direto no arquivo do webhook. Qualquer RPC com erro → `500 internal_error` (idempotência via unique idem index garante retry seguro).

## 3) SQL
- `comunicacao_provider_receipts.outbox_id`: agora `NOT NULL REFERENCES public.comunicacao_outbox(id) ON DELETE RESTRICT` (append-only + retenção explícita; a outbox não pode ser apagada em cascata).
- `normalizeErrorCode` no parser: consome **apenas** `errors[0].code` ou `errors[0].error_code`. Removido fallback textual `title`.
- Máquina fora de ordem (RPC `rpc_record_whatsapp_delivery_status`):
  - `sent` só define estado se `provider_delivery_status IS NULL`. Nunca rebaixa outros estados. Se estado atual já é `sent`, apenas avança `provider_status_at` para o `p_timestamp` mais recente.
  - `failed` é lateral. Comparação explícita com sent atual:
    - `failed` com `p_timestamp < provider_status_at (sent)` → **NÃO substitui** sent.
    - `failed` com `p_timestamp >= provider_status_at (sent)` → substitui sent enquanto não houver `delivered_at`/`read_at` e o estado não for `deleted`.
    - Se já `failed`, mantém `provider_status_at` original (não avança).
  - `delivered`/`read` monotônicos como antes, preservando primeiro timestamp em `delivered_at`/`read_at`.
- `postcheck.sql`: valida `outbox_id NOT NULL` e FK `confdeltype='r'` (RESTRICT); mantém validações de índice UNIQUE parcial, grants restritos, RLS, trigger append-only e enum intacto.

## 4) Rollback
- `restoration/comunicacao-fase4/rollback.sql`: transaction-neutral (removido `BEGIN`/`COMMIT` externos). Atomicidade delegada ao caller via `psql --single-transaction`.
- `restoration/comunicacao-deploy/rollback-staging.sh`:
  - Ordem obrigatória: **Fase 4 primeiro**, depois Fase 2.
  - `detect_fase4_installed()` (read-only): verifica `to_regprocedure('public.rpc_record_whatsapp_delivery_status(...)')` e `information_schema.tables`.
  - Se `ROLLBACK_COMMUNICATION=true` e Fase 4 ainda instalada, o script **recusa** com mensagem clara ("Fase 4 ainda instalada. Rode com ROLLBACK_COMMUNICATION_FASE4=true no MESMO run"). Rollback F4 confirma ausência pós-execução (defesa em profundidade).
  - Cada rollback roda via `psql --single-transaction -f rollback.sql`.
- `env.example`: documenta `WHATSAPP_WEBHOOK_ENABLED` como feature flag real (não apenas health) e `WHATSAPP_PHONE_NUMBER_ID` como obrigatório para o webhook. Nenhum valor incluído.

## 5) Resultados
- `bash -n restoration/comunicacao-deploy/rollback-staging.sh` → **OK**.
- `vitest src/test/comunicacao` → **205/205** (fase4 sozinho: 50/50).
- `vitest` completo → **2293 passed / 4 skipped / 1 failed** (falha isolada em `portalAcompanhamentoProdutor.test.tsx` por timeout; pré-existente e não relacionada ao módulo de comunicação).

## Arquivos alterados
- `supabase/functions/whatsapp-status-webhook/index.ts` (feature flag + concorrência)
- `supabase/functions/_shared/comunicacao/concurrency.ts` (novo helper puro)
- `supabase/functions/_shared/comunicacao/whatsapp-webhook-parser.ts` (normalizeErrorCode sem title)
- `supabase/functions/_shared/comunicacao/adapters-types.ts` (isWhatsappWebhookConfigValid mais estrito)
- `restoration/comunicacao-fase4/migration.sql` (outbox_id NOT NULL RESTRICT + state machine failed/sent)
- `restoration/comunicacao-fase4/postcheck.sql` (valida NOT NULL/FK RESTRICT)
- `restoration/comunicacao-fase4/rollback.sql` (transaction-neutral)
- `restoration/comunicacao-deploy/rollback-staging.sh` (guarda F4-first + detecção read-only)
- `restoration/comunicacao-deploy/env.example` (flag real + phone_number_id)
- `src/test/comunicacao/fase4.test.ts` (novos vetores contratuais: flag, concorrência, error_code sem title, FK RESTRICT, state machine, rollback guard, config validator)
