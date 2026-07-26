# Comunicação Fase 0.2 — Relatório da revisão bloqueante

Status: **NÃO APTO PARA STAGING** (bloqueado pelo teste (c) do arquivo
`src/test/comunicacao/fase02-static.test.ts` — casts `(supabase.rpc as any)`
para as 3 RPCs canônicas ainda existem em 5 arquivos porque `src/integrations/supabase/types.ts`
só pode ser regenerado após a migration ser aplicada em staging).

## 1. Defeitos corrigidos nesta rodada

1. **rpc_create_notificacao_operacional** — autorização por evento.
   Substituída a checagem genérica de "papel operacional" por whitelist
   server-side em `restoration/comunicacao-fase02/migration.sql`:
   - `retorno_programado`, `visita_finalizada`, `pre_os_gerada`,
     `recomendacao_liberada`, `recomendacao_aprovada`: caller precisa ser o
     `consultor_responsavel` do `registros_consultor` referenciado por
     `source_id`; `usuario_id` = próprio caller.
   - `aprovacao_urgente`, `aprovacao_recomendacao`: caller precisa ser
     `consultor_responsavel` do registro; destino precisa ser gestor
     efetivo (`has_role`); um registro por gestor.
   - `monitoramento_vencido`, `os_atrasada`: **reservados ao service_role**.
     Chamadas de `authenticated` retornam `insufficient_privilege`.
   - `informativo`/`sistema`: caller = destinatário e `source_type` obrigatório.
2. **rpc_create_portal_notification_secure** — par obrigatório e vínculo
   caller→origem→cliente:
   - `_source_type` e `_source_id` são **obrigatórios juntos**; whitelist
     restrita a `registros_consultor`, `ordens_servico`, `aplicacoes`,
     `portal_solicitacoes`.
   - Valida que a origem pertence ao `_cliente_id` (cross-client → erro).
   - Valida que o caller tem vínculo com a origem
     (consultor responsável, gestor, administrador, administrativo, aplicador
     via `aplicacoes.responsavel_id`), impedindo staff sem escopo de
     notificar clientes arbitrários.
   - `_tipo` ∈ enum `tipo_notificacao_portal`.
3. **check-monitoramentos-vencidos** — refeita como
   `rpc_check_monitoramento_and_notify(uuid)`, transacional:
   verifica vencimento, insere `monitoramento_avisos` e cria a notificação
   operacional dentro da MESMA transação. Se qualquer passo falhar, tudo é
   revertido. A Edge Function passou a chamar essa RPC por registro; push é
   best-effort pós-commit e nunca reverte o aviso.
4. **RLS** — precheck reformulado (`precheck.sql`) enumera *todas* as
   `pg_policies` por comando (`ALL/INSERT/UPDATE/DELETE/SELECT`) para as
   4 tabelas alvo, com `roles`, `using` e `with_check`, além dos `GRANTs`.
   `postcheck.sql` falha se sobrar policy `INSERT/DELETE/ALL` permissiva
   nas 3 tabelas restritas.
5. **aplicacao_emails** — RPC valida que o e-mail pertence ao caller/aplicador
   ou ao cliente da OS ligada à aplicação; permite bypass apenas para
   `administrador`/`gestor`/`administrativo`. Idempotência por
   `idempotency_key`; evolução monotônica de status (`queued` →
   `link_generated_no_send`/`sent` → `failed`/`bounced`).
6. **enviar-pdf-aplicacao** — falha do RPC agora retorna **500** com corpo
   `{ error }` e remove o objeto de storage subido (best-effort). Nunca mais
   retorna `200 { success:true }` mascarando erro de contabilização.
7. **Teste estático (c)** — marca honestamente o pacote como
   `NÃO APTO PARA STAGING` enquanto o cast `(supabase.rpc as any)` existir
   para as 3 RPCs canônicas.

## 2. Estado das validações locais

| Validação                    | Resultado |
| ---------------------------- | --------- |
| `bunx tsgo --noEmit`         | ✅ verde  |
| `bun run build`              | ✅ verde  |
| `bunx vitest run src/test/comunicacao/` | ❌ 1 falha intencional em (c) — bloqueia certificação até regeneração de types |
| Migration aplicada em DB     | ❌ **não aplicada** — pacote reside apenas em `restoration/` |
| Harness RLS em staging       | ❌ **não executado** — requer service_role em staging e substituição de UUIDs |

## 3. Como sair de "NÃO APTO"

1. Aplicar `restoration/comunicacao-fase02/migration.sql` em staging via
   fluxo oficial (`supabase/migrations/...`) — passos no `runbook.md`.
2. Rodar `precheck.sql` → `postcheck.sql` → `harness-rls.sql` (com UUIDs
   reais).
3. Regenerar `src/integrations/supabase/types.ts` (`supabase gen types
   typescript --linked --schema public`).
4. Remover os 5 casts `(supabase.rpc as any)` em:
   `src/components/aplicacao/AplicacaoFormDialog.tsx`,
   `src/pages/FluxoTecnico.tsx`,
   `src/pages/VisitaTecnica.tsx` (3 ocorrências),
   `src/pages/app/MobileAplicacoes.tsx`.
5. Rodar novamente typecheck + build + `vitest run src/test/comunicacao/`.
   O teste (c) precisa passar.

## 4. Escopo NÃO tocado nesta fase (por design)

- Rotas, dependências, permissões (`app_role`), enums existentes,
  componentes de UI não relacionados a notificação.
- Envios reais (SMS/e-mail transacional/push): permanecem desativados até a
  fase seguinte.
