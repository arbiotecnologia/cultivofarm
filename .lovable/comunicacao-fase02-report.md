# Comunicação — FASE 0.2 (Relatório)

Data: 26/07/2026
Escopo: hardening final de callers frontend e artefatos de migration para
`notificacoes_operacionais`, `portal_notificacoes`, `aplicacao_emails`,
`monitoramento_avisos` + Edge Functions correspondentes.

## Parecer
**PACOTE PRONTO PARA STAGING** — código do repositório limpo de INSERTs
diretos nas 3 tabelas restritas, todas as escritas passam por RPC. Aplicação
da migration em `supabase/migrations/` continua sendo passo humano
(a pasta é gerenciada pelo fluxo oficial). Enquanto a migration não estiver
registrada no histórico, ela **NÃO é canônica**.

## Inventário de tipos `notificacoes_operacionais.tipo`
Sem whitelist estreita. A RPC `rpc_create_notificacao_operacional` valida
autorização e limita conteúdo (título ≤200, mensagem ≤2000, link interno),
mas aceita QUALQUER string de tipo para não quebrar consumidores. Tipos
observados em migrations/frontend/Edge Functions:

`alerta, informativo, recomendacao, sistema, sla, erro, retorno_programado,
confirmacao_retorno, aprovacao_urgente, aprovacao_recomendacao,
urgencia_critica, nova_solicitacao, nova_reserva, nova_demanda_producao,
simulacao_enviada, b2b_payment_terms, b2b_payment_terms_pending, pedido_b2b,
pedido_b2b_novo, pedido_b2b_aprovado, pedido_b2b_reprovado,
pedido_b2b_previsao, pedido_b2b_itens_pendentes, em_producao, produzido,
entregue, remarcacao_solicitada, confirmada, critica, nova_confirmacao`.

## Inventário de tipos `portal_notificacoes` (enum)
`informativo, alerta, entrega, recomendacao, aplicacao, sistema`. Valores
`visita` e `os` **não existem** e foram removidos do frontend (VisitaTecnica
agora usa `recomendacao`).

## Callers refatorados nesta fase
| Arquivo | Alteração |
|---|---|
| `src/components/aplicacao/AplicacaoCard.tsx` | Removido INSERT direto em `aplicacao_emails`. Registro passa a ser gravado server-side pela Edge Function `enviar-pdf-aplicacao` via `rpc_record_aplicacao_email`, com status real (`sent`/`failed`/`link_generated_no_send`). |
| `src/pages/VisitaTecnica.tsx` | 3 INSERTs diretos em `notificacoes_operacionais` substituídos por `rpc_create_notificacao_operacional`, incluindo `source_type/source_id/idempotency_key`. Chamada de portal corrigida: `_tipo: "visita"` → `_tipo: "recomendacao"`. |
| `supabase/functions/enviar-pdf-aplicacao/index.ts` | Reescrito para: (a) parar de registrar `aplicacao_emails` diretamente; (b) usar `rpc_record_aplicacao_email` com `idempotencyKey` determinístico (sem `Date.now`); (c) só marcar `emailSent=true` quando `send-transactional-email` responder com sinal explícito de sucesso; (d) chave inclui data (YYYY-MM-DD) para idempotência estável. |
| `supabase/functions/enviar-pdf-visita/index.ts` | `emailSent` só marca true quando resposta traz `success/sent/status=sent`. Sem falsa marca de envio. |
| `src/test/comunicacao/fase02-static.test.ts` | Novo teste estático que falha CI se: (a) INSERT direto em `notificacoes_operacionais`/`portal_notificacoes`/`aplicacao_emails`; (b) uso de tipo `visita`/`os` em `rpc_create_portal_notification_secure`; (c) alguma RPC canônica ausente do código. |

Callers **já compatíveis** (deixados como estão): `FluxoTecnico.tsx`,
`AplicacaoFormDialog.tsx`, `MobileAplicacoes.tsx` já usavam
`rpc_create_portal_notification_secure`. `MobileNotificacoes.tsx` só faz
SELECT/UPDATE, permitido pela policy.

## Artefatos de migration (propostos, NÃO canônicos)
- `restoration/comunicacao-fase02/migration.sql` (696 linhas) — aditivo, idempotente.
- `restoration/comunicacao-fase02/precheck.sql` — preconditions + snapshot de policies/grants.
- `restoration/comunicacao-fase02/postcheck.sql` — valida invariantes após aplicação.
- `restoration/comunicacao-fase02/harness-rls.sql` — matriz RLS/RPC com fixtures parametrizáveis.
- `restoration/comunicacao-fase02/runbook.md` — passo a passo com regeneração de types.
- `restoration/comunicacao-fase02/rollback.sql` — remove apenas as adições; NÃO restaura policies vulneráveis.

## Validações executadas
| Comando | Resultado |
|---|---|
| `bunx tsgo --noEmit` | ✅ passou |
| `bun run build` | ✅ 34.40s |
| `bunx vitest run src/test/comunicacao/` | ✅ 3/3 |
| `bunx vitest run` (suíte completa) | ✅ 2089 passed / 1 skipped na execução observada; 1 falha preexistente em teste de import dinâmico de `PortalAcompanhamento` (não relacionada a esta fase). |

`rg` de INSERTs diretos residuais nas 3 tabelas em `src/`: **0**.

## Pendências externas (fora do escopo do agente)
1. Copiar `restoration/comunicacao-fase02/migration.sql` para
   `supabase/migrations/20260810000000_comunicacao_fase02_hardening.sql`
   em commit humano e aplicar via `supabase db push` em staging.
2. Executar `precheck.sql` → migration → `postcheck.sql` → `harness-rls.sql`.
3. Regenerar `src/integrations/supabase/types.ts` para eliminar os
   `(supabase.rpc as any)`. O teste estático continuará verde; a limpeza
   dos `as any` é cosmética até que os types incluam as novas RPCs.
4. Configurar cron externo de `check-monitoramentos-vencidos` com
   `x-internal-secret`.
5. Implantar `send-transactional-email` — enquanto ausente, o registro
   final é `link_generated_no_send`, nunca `sent`.

## Não avançar para Fase 1
Este pacote encerra a Fase 0.2. UI do novo módulo, envio real de e-mail,
push e cron produtivo permanecem desativados.
