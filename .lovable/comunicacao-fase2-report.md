# Comunicação — Fase 2 · Relatório de entrega

**Commit base:** `20ba52bc327a99d835f4b31518f451dee632b583`
**Escopo:** proposta aditiva sobre a Fase 1 v3. Nada aplicado. Nenhum envio real.
Todas as flags de rede e frontend permanecem OFF por padrão.

## Parecer honesto

> **PACOTE FASE 2 PRONTO PARA APLICAÇÃO EM STAGING**
>
> Condicionado a: (a) execução na ordem `precheck → migration → postcheck → harness-rls`;
> (b) manter `COMMUNICATION_DELIVERY_ENABLED=false` até validar visualmente
> `/comunicacao` em staging; (c) ativar adapters individualmente e apenas após
> configurar as envs correspondentes.

## Entregáveis criados

### 1. SQL — `restoration/comunicacao-fase2/`
- `migration.sql` — trigger de OS (regular e on-farm), publish system-side idempotente, `rpc_resolve_outbox_address`, `rpc_skip_communication_delivery`, `rpc_cancel_communication_delivery`, `rpc_preview_administrative_broadcast_count`, `rpc_set_communication_template_metadata`, `rpc_create_portal_notification_secure`, `rpc_create_operational_notification_secure`, e metadados de canal em `comunicacao_templates` (WhatsApp Meta + assunto obrigatório para e-mail) — todos com REVOKE anon/authenticated onde aplicável.
- `precheck.sql` — verifica presença de Fase 1, tabelas de negócio, enums `status_os`/`status_os_onfarm` com valor `pronto_entrega`, colunas críticas (`profiles.user_id`, `ordens_servico.numero_os`), aborta se Fase 2 já parcialmente aplicada.
- `postcheck.sql` — resolução via `to_regprocedure` (imune a search_path/formatação), unicidade por nome (bloqueia overload), validação de retorno (`format_type` + `proretset`), constraints e triggers presentes, RPCs service_role-only não expostas a authenticated, helpers internos não expostos.
- `harness-rls.sql` — matriz de grants + simulação com `SET LOCAL ROLE anon` bloqueando `rpc_resolve_outbox_address`.
- `rollback.sql` — remove exclusivamente objetos da Fase 2 e restaura `_comunicacao_build_snapshot` na versão Fase 1.
- `seeds.sql` — 3 templates rascunho (WA/email/in_app) e 3 regras **desligadas**.
- `runbook.md` — assinaturas exatas, envs por adapter, mapeamento outcome → RPC terminal, ordem de execução.

### 2. Adapters — `supabase/functions/_shared/comunicacao/`
- `adapters-types.ts` (puro, importável de Node) — tipos `AdapterResult/Outcome/Snapshot/Deps`, `WorkerEnv`, `healthBooleans()`.
- `adapters.ts` (Deno-side) — reexporta os tipos + `readWorkerEnv()`.
- `email-adapter.ts` — SMTP via `denomailer` (import dinâmico com specifier variável para não vazar em Node), timeout 20s, classifica timeout/network/5xx.
- `whatsapp-adapter.ts` — Meta Cloud API, valida E.164, exige `provider_template_name`+`language_code`+mapping ordenado, timeout 15s, sanitiza 4xx/5xx/429, nunca inclui token na mensagem.
- `inapp-adapter.ts` — despacha para `rpc_create_portal_notification_secure` (cliente) ou `rpc_create_operational_notification_secure` (usuário); classifica erros por privilégio.

### 3. Edge functions
- `supabase/functions/process-communication-outbox/index.ts` — worker reescrito: dry_run quando delivery OFF; para cada claim: render → `rpc_resolve_outbox_address` → dispatch por canal → terminação em `sent | skipped | cancelled | dead_letter (permanente) | retry (transitório)` via RPCs próprias, preservando `worker_id` no lease.
- `supabase/functions/communication-health/index.ts` — POST-only, aceita service_role ou JWT com role `administrador`; retorna apenas booleans `enabled/configured` por canal, **sem eco de envs**.

### 4. Frontend
- `src/features/comunicacao/types.ts` — `ComunicacaoTemplate` com `provider_template_name/language_code/parameter_mapping`; novos contratos RPC.
- `src/features/comunicacao/api.ts` — `setTemplateMetadata`, `previewAdministrativeBroadcast`, `publishAdministrativeBroadcast` (via `rpc_publish_communication_event`).
- `src/features/comunicacao/ui/ComunicacaoAdminPage.tsx` — nova aba **Comunicados** condicionada a `VITE_COMUNICACAO_BROADCAST_TAB_ENABLED=true` e role admin/gestor. Gestor visualiza; administrador publica com confirmação e idempotency key estável (`djb2(role|titulo|mensagem)`).
- `src/features/comunicacao/flags.ts` + `src/config/featureFlags.ts` — nova flag `comunicacaoBroadcastTab`.

### 5. Testes — `src/test/comunicacao/`
- `fase1.test.ts` — asserts do worker migradas para fase2 (Fase 1 permanece com render vectors, migration, route guard).
- `fase2.test.ts` — **33 casos**, todos com fetch mock; cobrem: trigger de transição real, publish system não-executável por authenticated, RLS/grants (resolve/skip/cancel/in_app secure), preview exige admin/gestor, worker chama resolve antes de dispatch, worker termina em sent/skipped/cancelled/fail, health sem eco de segredos, WhatsApp: ordering do mapping, provider_message_id, 429/401/5xx, template sem meta, não-E.164, timeout de fetch (AbortController), Email: gates de flag/env/assunto/endereço, InApp: dispatch por cliente_id vs user_id, classificação de privilege.

## Fatos operacionais confirmados
- `profiles.user_id` é o identificador canônico (nunca `profiles.id`).
- `ordens_servico.status` e `ordens_servico_onfarm.status` incluem `pronto_entrega`.
- Nenhum trigger para `produto_pronto_aplicacao` — permanece **ação manual/admin** ("aguardando definição de status"), sem mapeamento para `entregue/finalizada`.
- `portal_notificacoes` sem policy INSERT para authenticated → só via RPC SECURITY DEFINER.
- SMTP: envs reusadas de `enviar-alertas-notificacoes` (denomailer já presente).
- WhatsApp: sem integração prévia — Fase 2 implementa do zero com envs dedicadas.

## Verificações executadas
| Verificação | Resultado |
|---|---|
| `bunx tsgo --noEmit` | ✅ 0 erros |
| `bunx vitest run src/test/comunicacao/` | ✅ 58/58 (fase1 19 + fase2 33 + fase02-static 6) |
| Suíte completa `bunx vitest run` | 2146 ✅ · 4 skipped · **1 falha pré-existente não relacionada** (`portalAcompanhamentoProdutor.test.tsx` — timeout 14.8s, sem relação com módulo de Comunicação) |

## Segurança verificada
- Nenhuma nova função com EXECUTE para `anon`.
- `_comunicacao_publish_system_event`, `_comunicacao_expand_event`, `rpc_resolve_outbox_address`, `rpc_skip_*`, `rpc_cancel_*`, `rpc_create_*_secure`: REVOKE `PUBLIC, anon, authenticated`; GRANT apenas para `service_role`.
- Adapters nunca logam PII (address vive só no worker; RPCs terminais recebem apenas `error_code` + `error_message` truncados no banco).
- WhatsApp: token nunca aparece em `AdapterResult.message` (teste `whatsapp_401` valida).
- `communication-health` retorna apenas booleans (teste heurístico bloqueia eco de `SMTP_PASSWORD`/`WHATSAPP_ACCESS_TOKEN`/segredos internos).

## Trabalho remanescente (fora do escopo desta fase)
- Regeneração de `src/integrations/supabase/types.ts` após aplicação em staging.
- Ativação real dos adapters (sequência sugerida: in_app → email → whatsapp).
- Documentação do fluxo de aprovação de templates Meta e reprodução de opt-in/verificação em produção.
