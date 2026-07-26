# Comunicação — Fase 1 · Runbook (PROPOSTA)

> Estado: **PROPOSTA** — arquivos deste diretório **não foram aplicados** ao banco.
> A migration Fase 0.2 (`restoration/comunicacao-fase02/migration.sql`) também ainda não foi aplicada.
> Não ativar envios reais nesta fase.

## Inventário real considerado
- `public.app_role`: `administrador, tecnico_agronomo, producao, administrativo, gestor, cliente_produtor, consultor_tecnico, aplicador, operador_onfarm, financeiro, gestor_comercial, parceiro_b2b, parceiro_b2b_tecnico`.
- `public.has_role(uuid, app_role)`: SECURITY DEFINER, já existente.
- **Produto pronto para retirada** → `public.ordens_servico.status = 'pronto_entrega'` (enum `status_os` / `status_os_onfarm`).
- **Produto pronto para aplicação** → mapeado para `ordens_servico.status = 'entregue'` (produto entregue à propriedade). Não existe status dedicado hoje; o evento é publicado explicitamente por perfil `producao`/`administrativo`/`gestor`/`administrador` via RPC (validação server-side em `rpc_publish_communication_event`).
- **Atualização importante** → sem tabela-fonte; publicação restrita a `administrador` via RPC.
- `public.tipo_notificacao_portal` existente permanece intacto; canal `in_app` da Fase 1 apenas produz outbox; a integração com `portal_notificacoes` só será feita quando `COMMUNICATION_DELIVERY_ENABLED=true` e o adapter for habilitado.

## Feature flags (padrão = desligado)
- Frontend: `VITE_COMUNICACAO_MODULE_ENABLED=false`
- Worker/Edge: `COMMUNICATION_DELIVERY_ENABLED=false`
- Adapter in_app dedicado: `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`

## Ordem de aplicação em staging (não executar em produção)
1. Confirmar que Fase 0.2 já está aplicada em staging.
2. `precheck.sql`
3. `migration.sql`
4. `postcheck.sql`
5. `seeds.sql` (opcional; deixa templates em `draft` e regras `disabled`).
6. `harness-rls.sql` (verificação estrutural). Complementar com testes manuais logando com usuários sintéticos para cada `app_role`.
7. Regenerar types (`bunx supabase gen types ...`) e comparar com `src/integrations/supabase/types.ts` (alinhado manualmente nesta fase).
8. Rodar `bunx vitest run src/test/comunicacao/`, `bunx tsgo --noEmit`, `bun run build`.

## Rollback
- `rollback.sql` aborta se qualquer tabela `comunicacao_*` contiver dados. Purga tabelas/RPCs/enums quando vazio.

## Harness RLS
- Verificações estruturais garantem que não existem policies de escrita direta nas tabelas de templates/regras/eventos/outbox/audit_log/preferências.
- Cenários runtime (executar manualmente em staging):
  - `cliente_produtor` não lê `comunicacao_templates`.
  - `administrador` cria template draft via RPC, ativa, e nova versão é criada quando editada após ativação.
  - `authenticated` comum não invoca `rpc_publish_communication_event('administrative_important_update', …)` — deve receber `insufficient_privilege`.
  - `authenticated` sem participação na ordem não invoca `produto_pronto_retirada` — deve falhar em `has_role` gate.
  - `service_role` invoca `rpc_claim_communication_outbox` com `FOR UPDATE SKIP LOCKED`; usuários normais recebem `permission denied`.

## Worker
- Edge Function `process-communication-outbox` só aceita POST; header `x-internal-secret` obrigatório ou service_role.
- Com `COMMUNICATION_DELIVERY_ENABLED != 'true'`, retorna `{ ok:true, dry_run:true }` sem claim.
- Adapters email/whatsapp retornam `provider_not_configured`. Adapter in_app fica atrás de `COMMUNICATION_INAPP_ADAPTER_ENABLED`.

## Bloqueios externos
- Aplicação real da migration depende de janela de manutenção e finalização da Fase 0.2.
- Provedores de email/whatsapp/push não configurados; sem secrets criados.
- Regeneração de `types.ts` a partir do banco só ocorre após aplicação.
