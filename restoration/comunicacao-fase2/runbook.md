# Runbook — Comunicação · Fase 2 (staging)

> **Estado do pacote:** proposta. Nada aplicado. Todas as feature flags e
> adapters de rede permanecem **desligados**.

## Objetivo
Adicionar, sobre a Fase 1 v3, os seguintes componentes canônicos:

1. Trigger server-side idempotente em `ordens_servico` e `ordens_servico_onfarm`
   que publica `produto_pronto_retirada` **somente** na transição real para
   `status = 'pronto_entrega'`.
2. Broadcast administrativo (`administrative_important_update`) por
   `app_role`, com **preview server-side** de contagem estimada.
3. RPC service_role-only `rpc_resolve_outbox_address` que revalida
   opt-in/verificação e normaliza e-mail (lowercase) e telefone (E.164 BR).
4. Adapters reais **separados e desligados**: e-mail (SMTP via `denomailer`,
   reusando envs `SMTP_*` já presentes), WhatsApp Cloud API (Meta Graph) e
   in_app (via RPCs SECURITY DEFINER `rpc_create_*_secure`).
5. Integração ao worker `process-communication-outbox` com resultados
   normalizados: `sent` / `skipped` / `cancelled` / `retry` / `dead_letter`.
6. Metadados de canal em `comunicacao_templates` (WhatsApp Meta + assunto
   obrigatório para e-mail) com constraints estritas.

## Pré-requisitos
- Fase 1 v3 aplicada e certificada (verificar `restoration/comunicacao-fase1/postcheck.sql`).
- Projeto Supabase de **staging**. NUNCA rodar em produção.
- Flags globais permanecem `false`:
  - `COMMUNICATION_DELIVERY_ENABLED=false`
  - `EMAIL_DELIVERY_ENABLED=false`
  - `WHATSAPP_DELIVERY_ENABLED=false`
  - `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`
  - Frontend: `VITE_COMUNICACAO_MODULE_ENABLED=false`, `VITE_COMUNICACAO_BROADCAST_TAB_ENABLED=false`

## Ordem de execução em staging

```
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/precheck.sql
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/migration.sql
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/postcheck.sql
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/harness-rls.sql
# opcional em staging:
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/seeds.sql
```

## Assinaturas exatas (para conferência)
- `public.rpc_set_communication_template_metadata(uuid, text, text, jsonb) → jsonb`
- `public.rpc_preview_administrative_broadcast_count(public.app_role) → jsonb`
- `public.rpc_resolve_outbox_address(uuid) → jsonb`
- `public.rpc_skip_communication_delivery(uuid, text, text) → jsonb`
- `public.rpc_cancel_communication_delivery(uuid, text, text) → jsonb`
- `public.rpc_create_portal_notification_secure(uuid, text, text, text) → jsonb`
- `public.rpc_create_operational_notification_secure(uuid, text, text, text, text) → jsonb`

## Variáveis de ambiente para os adapters
| Env | Uso | Obrigatório para envio real |
|---|---|---|
| `COMMUNICATION_DELIVERY_ENABLED` | Gate global | ✅ |
| `EMAIL_DELIVERY_ENABLED` | Ativa SMTP | ✅ para e-mail |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Reuso de config existente | ✅ para e-mail |
| `WHATSAPP_DELIVERY_ENABLED` | Ativa Meta Cloud API | ✅ para WA |
| `WHATSAPP_ACCESS_TOKEN` | Token do app Meta | ✅ para WA |
| `WHATSAPP_PHONE_NUMBER_ID` | ID de origem | ✅ para WA |
| `WHATSAPP_API_VERSION` | Ex.: `v20.0` (default seguro) | ➖ |
| `COMMUNICATION_INAPP_ADAPTER_ENABLED` | Ativa in_app adapter | ✅ para in_app |

**Ausência de qualquer env obrigatório retorna `provider_not_configured`**
(o worker converte em `cancelled`, sem retry).

## Comportamento por outcome do adapter
| Outcome adapter | Ação worker |
|---|---|
| `sent` | `rpc_complete_communication_delivery` |
| `provider_not_configured` | `rpc_cancel_communication_delivery` |
| `invalid_recipient` | `rpc_cancel_communication_delivery` |
| `opt_out` | `rpc_skip_communication_delivery` |
| `transient_error` (timeout/5xx/429) | `rpc_fail_communication_delivery(is_permanent=false)` |
| `permanent_error` (4xx exceto 429) | `rpc_fail_communication_delivery(is_permanent=true)` → `dead_letter` |

## Rollback
```
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/rollback.sql
```
Rollback restaura `_comunicacao_build_snapshot` na versão Fase 1 (sem UNION on-farm).

## Nota sobre `produto_pronto_aplicacao`
Continua como **ação manual/admin** — sem mapeamento automático para
`entregue`/`finalizada`. O ponto de invocação está claramente marcado como
`aguardando definição de status`. Nenhum trigger foi adicionado.
