# Runbook — Fase 4 (Recibos WhatsApp e observabilidade)

**Estado**: proposta. Não aplicada. Aditiva sobre Fase 2. Nada é publicado nem tem flag ativada.

## Princípio

- `outbox.status='sent'` continua sendo o aceite do provedor (retorno do send Meta com `messages[].id`). Fase 4 **não** altera o enum nem a semântica do worker.
- Webhooks Meta reportam `sent/delivered/read/failed/deleted` para o mesmo `id`, potencialmente fora de ordem. Esses eventos alimentam colunas separadas na outbox e a tabela append-only `comunicacao_provider_receipts`.
- Correlação exclusiva por `(canal='whatsapp', provider_message_id)`.

## Contrato SQL

- Colunas novas em `comunicacao_outbox`: `provider_delivery_status`, `provider_status_at`, `delivered_at`, `read_at`, `provider_failed_at`.
- Tabela `comunicacao_provider_receipts (id, outbox_id, provider, provider_message_id, status, provider_timestamp, received_at, error_code)`.
  - Sem `payload`, sem `recipient_id`, sem telefone, sem nome, sem mensagem, sem token.
  - RLS ON; SELECT restrito a `administrador`; INSERT/UPDATE/DELETE bloqueados para authenticated/anon.
  - Trigger BEFORE UPDATE/DELETE bloqueia mutações mesmo para service_role — só INSERT é aceito.
- RPC `rpc_record_whatsapp_delivery_status(p_provider_message_id text, p_status text, p_timestamp timestamptz, p_error_code text) RETURNS jsonb`:
  - `SECURITY DEFINER`, `GRANT EXECUTE` **apenas** para `service_role`.
  - Bloqueia via `FOR UPDATE`. Sem match → `{ok:true, ignored:true, reason:'unmatched'}`.
  - Idempotente por `(provider, provider_message_id, status, provider_timestamp)`.
  - Máquina monotônica: `sent < delivered < read`; `failed` é lateral e não impede promoção posterior; `deleted` registra evento mas não rebaixa estado; `delivered_at`/`read_at` preservam o menor timestamp válido.

## Ordem de aplicação (kit)

> **Regra transacional (v2 corretiva):** `migration.sql` das Fases 2 e 4 é
> **transaction-neutral** (sem `BEGIN`/`COMMIT` externos). A transação é
> imposta pelo `apply-staging.sh` (`psql --single-transaction`), unindo
> `precheck+migration+postcheck` em UMA única transação por fase. Se qualquer
> etapa falhar, tudo é revertido pelo próprio Postgres. Execução manual só é
> aceita com `--single-transaction` agrupando os três arquivos.

```
apply-staging.sh
  → fase1 postcheck
  → fase2 (precheck+migration+postcheck) atômica (--single-transaction)
  → fase2 harness
  → fase4 (precheck+migration+postcheck) atômica (--single-transaction)
  → fase4 harness
  → seeds Fase 2 opcionais
```

## Rollback

- `ROLLBACK_COMMUNICATION_FASE4=true bash rollback-staging.sh` roda `fase4/rollback.sql` **antes** de qualquer rollback Fase 2 (que continua exigindo `ROLLBACK_COMMUNICATION=true`).
- Sem esse flag, Fase 4 permanece intacta.

## Bloqueios externos (para operação real)

1. Registrar URL do webhook no Meta App Developer → Webhooks → WhatsApp Business Account, campo `messages`.
2. Configurar `WHATSAPP_APP_SECRET` e `WHATSAPP_WEBHOOK_VERIFY_TOKEN` em Project Settings → Secrets. Nunca commitar.
3. Deploy da Edge Function `whatsapp-status-webhook` (allowlist já atualizada no kit).
4. Executar challenge GET no Meta dashboard após deploy.

## Observabilidade

- `communication-health` passa a expor `whatsapp_webhook.configured/enabled` (booleans, sem valores).
- Fila admin exibe status do provedor, timestamps e código sanitizado.
