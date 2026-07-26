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
- **Produto pronto para retirada** → `ordens_servico.status = 'pronto_entrega'` (exato).
- **Produto pronto para aplicação** → **não há status equivalente comprovado** no enum `status_os_onfarm`. Nenhum mapeamento é inventado nesta fase. A publicação é **manual, restrita a administrador**, com validação apenas de existência da OS no banco. Qualquer automação por transição de status fica adiada para uma fase posterior.
- **Atualização importante** → sem tabela-fonte; publicação restrita a `administrador`. `target_role` obrigatório; regra correspondente única em `broadcast_role` + `perfil = target_role` (dedup natural).
- `public.tipo_notificacao_portal` intacto. Canal `in_app` só produz outbox nesta fase.
- Tabela `usuarios_cliente_produtor` — o schema atual não a expõe e a migration v3 não a lê; qualquer código antigo que a referenciasse foi removido do pacote da Fase 1.

## Feature flags (padrão = desligado)
- Frontend: `VITE_COMUNICACAO_MODULE_ENABLED` (ausente ou ≠ `"true"` ⇒ `false`).
  Fonte única: `FEATURE_FLAGS.comunicacaoModule` em `src/config/featureFlags.ts`;
  consumida por `isComunicacaoModuleEnabled()`, `RouteGuard` e filtro do sidebar.
- Worker/Edge: `COMMUNICATION_DELIVERY_ENABLED=false`.
- Adapter in_app dedicado: `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`.

## Assinaturas de RPCs (v3 — copiadas literalmente de `migration.sql`)

Todas SECURITY DEFINER, `search_path=public`. Retorno `jsonb` salvo indicação em contrário.

- `public.rpc_create_communication_template(p_chave text, p_nome text, p_canal public.comunicacao_canal, p_assunto text, p_corpo text, p_variaveis jsonb DEFAULT '[]'::jsonb) RETURNS jsonb` — admin.
- `public.rpc_update_communication_template(p_template_id uuid, p_nome text, p_assunto text, p_corpo text, p_variaveis jsonb) RETURNS jsonb` — admin; templates `active` são imutáveis (guard por trigger).
- `public.rpc_activate_communication_template(p_template_id uuid) RETURNS jsonb` — admin.
- `public.rpc_archive_communication_template(p_template_id uuid) RETURNS jsonb` — admin.
- `public.rpc_upsert_communication_rule(p_rule_id uuid, p_event_key text, p_perfil public.app_role, p_estrategia text, p_canal public.comunicacao_canal, p_template_chave text, p_template_versao integer, p_condicoes jsonb, p_prioridade integer, p_enabled boolean, p_cooldown_seconds integer) RETURNS jsonb` — admin; bloqueia `broadcast_role` para eventos de OS.
- `public.rpc_publish_communication_event(p_event_key text, p_source_type text, p_source_id uuid, p_payload jsonb, p_idempotency_key text) RETURNS jsonb` — authenticated; whitelist por role; payload vazio p/ eventos de OS.
- `public.rpc_update_communication_preferences(p_canal public.comunicacao_canal, p_enabled boolean, p_whatsapp_opt_in boolean) RETURNS jsonb` — usuário; **não** altera verificação de canal.
- `public.rpc_verify_communication_channel(p_user_id uuid, p_cliente_id uuid, p_canal public.comunicacao_canal, p_email_verificado boolean, p_telefone_verificado boolean) RETURNS jsonb` — apenas admin.
- `public.rpc_claim_communication_outbox(p_batch_size integer, p_worker_id text, p_lease_seconds integer DEFAULT 60) RETURNS SETOF public.comunicacao_outbox` — service_role.
- `public.rpc_complete_communication_delivery(p_outbox_id uuid, p_worker_id text, p_provider_message_id text) RETURNS jsonb` — service_role; exige lease + worker match.
- `public.rpc_fail_communication_delivery(p_outbox_id uuid, p_worker_id text, p_error_code text, p_error_message text) RETURNS jsonb` — service_role.

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
