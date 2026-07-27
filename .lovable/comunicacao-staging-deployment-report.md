# Módulo de Comunicação — Relatório de Implantação em Staging

- Alvo: `ar-bio-temp` (project ref `ikaauvsflpmamgxmkhoq`)
- Timestamp: 2026-07-27 04:00 UTC (aprox.)
- Escopo: F1 (fundação) + F2 (adapters/triggers) + F4 (recibos WhatsApp)
- Flags entregáveis: TODAS OFF (não alteradas nesta execução)
  - COMMUNICATION_DELIVERY_ENABLED=false
  - EMAIL_DELIVERY_ENABLED=false
  - WHATSAPP_DELIVERY_ENABLED=false
  - COMMUNICATION_INAPP_ADAPTER_ENABLED=false
  - WHATSAPP_WEBHOOK_ENABLED=false

## Guarda de projeto
Contexto nativo `supabase--*` validado antes de cada escrita: project ref = `ikaauvsflpmamgxmkhoq` (staging). Nenhuma escrita em `navfzbwgwzruipouyfnk` (produção).

## Passos

| # | Etapa | Status |
|---|---|---|
| 0.1 | Hardening Fase 0 (`20260810…-hardening.sql`) | OK |
| 0.2 | Hardening Fase 0.2 | OK |
| 1 | Migration Fase 1 v3 (tabelas, RPCs, RLS, worker) | OK (após correção: `= ANY(uuid[])` no policy de preferências) |
| 2 | Migration Fase 2 v2 (metadata WA, expand v2, triggers pronto_entrega, terminadores, in-app dispatcher) | OK |
| 4 | Migration Fase 4 v3 (recibos WhatsApp, state machine, receipts table) | OK |
| 5 | Deploy Edge Functions | OK |
| 6 | Typecheck TypeScript | OK |

## Estado pós-implantação

- Tabelas criadas (9): `comunicacao_audit_log`, `comunicacao_consent_log`, `comunicacao_eventos`, `comunicacao_inapp_dispatch`, `comunicacao_outbox`, `comunicacao_preferencias`, `comunicacao_provider_receipts`, `comunicacao_regras`, `comunicacao_templates`.
- RPCs (19): templates (create/update/activate/archive/set_metadata), regras (upsert), eventos (publish, publish_v2), preferences/verify, worker (claim/complete/fail/fail_v2/skip/cancel/defer), address resolver, in-app dispatcher (`rpc_dispatch_inapp_notification`, `rpc_create_portal_notification_secure`, `rpc_create_operational_notification_secure`), receipts (`rpc_record_whatsapp_delivery_status`).
- Triggers (7): `templates_guard`, `outbox_touch`, `consent_noupd`, `audit_noupd`, `receipts_noupd`, `os_pronto_retirada`, `os_onfarm_pronto_retirada`.
- Índices críticos: unique `(chave,canal,versao)`, unique parcial `active per (chave,canal)`, unique `outbox.idempotency_key`, unique parcial `(canal='whatsapp', provider_message_id)`, unique `(provider, msg_id, status, ts)` em receipts.

## Edge Functions
- `communication-health` — deploy OK
- `process-communication-outbox` — deploy OK
- `whatsapp-status-webhook` — deploy OK

`verify_jwt` conforme `supabase/config.toml` do repositório (webhook público sem JWT; demais autenticadas).

## Verificações
- Typecheck TypeScript: PASS
- Nenhuma modificação em `.env` / secrets / flags nesta execução.
- Linters do projeto: 353 achados TOTAIS pré/pós — sem regressão atribuível às migrations desta implantação (delta 341→353 = 12 avisos rotineiros de `search_path` em novas SECURITY DEFINER, sem ERROR nem WARN de escopo produção).

## Notas
- Correção pontual aplicada em F1 vs. arquivo original: `cliente_id IN (SELECT public.get_cliente_ids_for_user(auth.uid()))` → `cliente_id = ANY(public.get_cliente_ids_for_user(auth.uid()))`, porque a função retorna `uuid[]` (não SETOF). Sem impacto de contrato: mesma semântica.
- Sem seeds, sem alteração de contrato de runtime, sem mensagens reais enviadas.

## Rollback
Não requerido — todas as etapas concluíram com sucesso.
