# Comunicação — Fase 1 v3 · Runbook (PROPOSTA)

> Estado: **PROPOSTA** — arquivos deste diretório **não foram aplicados** ao banco.
> Fase 0.2 (`restoration/comunicacao-fase02/migration.sql`) também ainda não foi aplicada.
> Não ativar envios reais nesta fase.
> Feature flag `comunicacaoModule` permanece `false` (default via env `VITE_COMUNICACAO_MODULE_ENABLED`).

## Inventário real considerado (v3)
- `public.app_role`: 13 papéis (administrador, tecnico_agronomo, producao, administrativo, gestor, cliente_produtor, consultor_tecnico, aplicador, operador_onfarm, financeiro, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico).
- `public.has_role(uuid, app_role)`: SECURITY DEFINER, já existente.
- `public.profiles(user_id, cliente_id, ...)` — `user_id` é a FK canônica para `auth.users` (v3 corrige joins antigos com `profiles.id`).
- `public.get_cliente_ids_for_user(uuid)` — usada nas policies de preferências (escopo cliente do portal).
- **Produto pronto para retirada** → `ordens_servico.status = 'pronto_entrega'`.
- **Produto pronto para aplicação** → `ordens_servico.status = 'entregue'` (não há status dedicado). Publicação restrita por role via `rpc_publish_communication_event`.
- **Atualização importante** → sem tabela-fonte; publicação restrita a `administrador`. `target_role` obrigatório; regra correspondente única em `broadcast_role` + `perfil = target_role` (dedup natural).
- `public.tipo_notificacao_portal` intacto. Canal `in_app` só produz outbox nesta fase.
- Tabela `usuarios_cliente_produtor` **não existe** e não é mais referenciada.

## Feature flags (padrão = desligado)
- Frontend: `VITE_COMUNICACAO_MODULE_ENABLED` (ausente ou ≠ `"true"` ⇒ `false`).
  Fonte única: `FEATURE_FLAGS.comunicacaoModule` em `src/config/featureFlags.ts`;
  consumida por `isComunicacaoModuleEnabled()`, `RouteGuard` e filtro do sidebar.
- Worker/Edge: `COMMUNICATION_DELIVERY_ENABLED=false`.
- Adapter in_app dedicado: `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`.

## Assinaturas de RPCs (v3)
- `rpc_create_communication_template(chave,nome,canal,locale,corpo,variaveis) → uuid` (admin).
- `rpc_update_communication_template(id, ...) → uuid` (admin; imutável se `active`).
- `rpc_activate_communication_template(id) → void` (admin).
- `rpc_upsert_communication_rule(id?, event_key, perfil, estrategia, canal, template_chave, template_versao?, filters, prioridade, enabled, cooldown_seconds) → uuid` (admin; bloqueia `broadcast_role` para eventos de OS).
- `rpc_publish_communication_event(event_key, source_table?, source_id?, payload, target_role?) → uuid` (auth; whitelist por role; payload vazio p/ OS; `target_role` obrigatório em `administrative_important_update`).
- `rpc_update_communication_preferences(canal, enabled, whatsapp_opt_in) → void` (usuário; verificação de canal fica em RPC separada de admin).
- `rpc_verify_communication_channel(user_id, canal, verified) → void` (apenas admin).
- `rpc_claim_communication_outbox(batch_size, worker_id, lease_seconds) → setof …` (service_role).
- `rpc_complete_communication_delivery(outbox_id, worker_id, provider_message_id) → void` (service_role; exige lease e worker match).
- `rpc_fail_communication_delivery(outbox_id, worker_id, error_code, error_message) → void` (service_role).

## Ordem de aplicação em staging
1. Confirmar Fase 0.2 aplicada.
2. `precheck.sql`
3. `migration.sql` (v3)
4. `postcheck.sql`
5. `seeds.sql` (opcional; templates `draft`, regras `disabled`; regra por perfil sem multiplicação).
6. `harness-rls.sql` (estrutural) + cenários runtime abaixo.
7. Regenerar `src/integrations/supabase/types.ts` a partir do schema real. Só então remover os casts `as unknown as ...` em `src/features/comunicacao/api.ts`.
8. `bunx tsgo --noEmit`, `bun run build`, `bunx vitest run src/test/comunicacao/`.

## Rollback
- `rollback.sql` (v3) — assinaturas alinhadas com migration v3; aborta se qualquer tabela `comunicacao_*` (inclui `comunicacao_consent_log`) contiver dados.

## Harness RLS — cenários runtime (executar manualmente em staging)
- `cliente_produtor` **não** lê `comunicacao_templates` / `regras`.
- `administrador` cria template `draft` via RPC, ativa, e edições posteriores exigem **nova versão** (ativos são imutáveis).
- `authenticated` comum → `rpc_publish_communication_event('administrative_important_update', …)` deve retornar `insufficient_privilege`.
- `authenticated` sem participação na OS → `rpc_publish_communication_event('produto_pronto_retirada', …)` deve falhar por has_role/whitelist.
- `service_role` invoca `rpc_claim_communication_outbox`; `authenticated` recebe `permission denied`.
- **Dedup target_role:** publicar `administrative_important_update` com `target_role='cliente_produtor'` produz outbox apenas para a regra `broadcast_role + perfil=cliente_produtor`; nenhuma outra regra dispara.
- **Payload OS vazio:** publicar `produto_pronto_retirada` com `payload = {"codigo_os":"X"}` deve ser rejeitado (whitelist vazia). Reenviar com `payload = {}` e `source=ordens_servico/id` deve gerar snapshot derivado do banco (numero_os, data_programada, nome do destinatário).
- **Escopo por cliente da OS:** `source_participants` inclui o cliente + usuários com `profiles.cliente_id = OS.cliente_id`. `by_role` restringe ao mesmo cliente. `broadcast_role` em OS é bloqueado no `rpc_upsert_communication_rule`.
- **Preferências opt-out:** setar `enabled=false` para canal `in_app` do usuário X impede enfileiramento na próxima publicação; `_comunicacao_can_deliver` retorna `false`.
- **XOR de preferências:** tentativa de linha com `user_id` e `cliente_id` ao mesmo tempo (ou nenhum) deve falhar por check constraint.
- **Lease/reclaim/worker mismatch:** `rpc_complete_communication_delivery` com `worker_id` diferente do que claimou → erro `lease pertence a outro worker`; lease expirado → erro `lease expirado`; outro worker consegue reclamar via `rpc_claim_communication_outbox` após expiração.
- **Verify channel:** `rpc_verify_communication_channel` só executa por `administrador`; usuário comum recebe `insufficient_privilege`. Usuário nunca marca `verified_at` diretamente.

## Worker
- Edge Function `process-communication-outbox`: POST-only; header `x-internal-secret` obrigatório ou service_role.
- Com `COMMUNICATION_DELIVERY_ENABLED != 'true'`: retorna `{ ok:true, dry_run:true }` sem claim.
- Adapters email/whatsapp → `provider_not_configured`. Adapter in_app atrás de `COMMUNICATION_INAPP_ADAPTER_ENABLED`.

## Bloqueios externos
- Aplicação da migration depende de janela de manutenção e Fase 0.2 aplicada.
- Provedores email/whatsapp/push não configurados; sem secrets criados.
- Regeneração de `types.ts` só ocorre após aplicação em staging.
