# Comunicação — FASE 0.1: Aplicação e Certificação (Relatório)

Data: 26/07/2026
Base: Fase 0 (`comunicacao-fase0-report.md`).

## Parecer

**APTO COM RESSALVAS de infraestrutura** — hardening de código, RPC segura para
portal, refatoração de todos os callers e migration canônica prontos.
As ressalvas são exclusivamente operacionais (aplicação da migration, deploy
das Edge Functions, regeneração de `types.ts`, matriz RLS runtime e cron),
pois o agente Lovable **não** tem acesso de escrita a `supabase/migrations/`
nem tool de migração remota disponível nesta sessão (apenas `supabase--enable`
está exposto e a Cloud não está ativa — o projeto usa Supabase externo).

## O que foi entregue (código)

### 1. Migration canônica pronta
Arquivo: `restoration/pending-migration-20260810000000-comunicacao-fase0-hardening.sql`

Aditivo, idempotente, com rollback em `restoration/rollback-comunicacao-fase0-hardening.sql`.
Contém, além do que veio da Fase 0:

- `rpc_create_notificacao_operacional`: valida perfil, tipo em whitelist
  (`alerta|informativo|recomendacao|sistema|sla|erro`), tamanho de título
  (≤200) e mensagem (≤2000), link **apenas interno** (`^/...`), bloqueia
  URL externa arbitrária, cross-user injection barrado no destinatário.
- `aplicacao_emails`: policy de INSERT direto **negada** (`WITH CHECK (false)`);
  gravação exclusiva por `rpc_record_aplicacao_email`; check constraint
  `aplicacao_emails_status_chk` restringe `status` a
  `queued|pending|sent|failed|link_generated_no_send`. A RPC valida vínculo
  (dono/staff), grava `enviado_por = auth.uid()` server-side.
- **NOVA** `rpc_create_portal_notification_secure(_cliente_id, _tipo, _titulo,
  _mensagem, _link)`: substitui todos os INSERTs diretos em
  `portal_notificacoes`. Valida perfil staff, tipo em whitelist
  (`informativo|alerta|recomendacao|aplicacao|visita|entrega|os`),
  limites de tamanho, link apenas interno, registra `created_by = auth.uid()`
  quando a coluna existe (fallback via `EXCEPTION undefined_column`).
- `portal_notificacoes`: INSERT/DELETE direto **negado** para authenticated;
  UPDATE mantido com `USING/WITH CHECK` simétricos.
- `monitoramento_avisos`: coluna gerada `data_referencia date` +
  índice único `ux_monitoramento_avisos_dia(registro_consultor_id, tipo,
  data_referencia)` para idempotência transacional (INSERT dispara
  `unique_violation` em duplicidade — usado pela função cron).
- Escrita por `authenticated` explicitamente negada em `monitoramento_avisos`.

### 2. Edge Functions endurecidas
| Função | Mudança |
|---|---|
| `send-push-notification` | **Broadcast restrito a `internal`/`administrador`**. Papéis staff genéricos NÃO podem mais disparar push. UUID de destinatários validado por regex; máx. 500 destinatários; `url` obrigatório interno; resposta não expõe `endpoint/p256dh/auth`, apenas `dispatched/succeeded`. Assinaturas 404/410 removidas automaticamente. |
| `check-monitoramentos-vencidos` | Idempotência transacional: `INSERT` primeiro em `monitoramento_avisos` e, se `unique_violation (23505)`, pula. Notificação interna via RPC segura. Push best-effort — falha do push **não desfaz** notificação. |
| `enviar-pdf-visita` | TTL do link assinado reduzido de 7d → 3d. Cleanup do arquivo órfão quando `createSignedUrl` falha. |
| `enviar-pdf-aplicacao` | TTL reduzido de 30d → 7d. Cleanup do órfão em falha. |

### 3. Frontend refatorado (5 callers)
Todos os INSERTs diretos em `portal_notificacoes` migrados para
`rpc_create_portal_notification_secure`:

| Arquivo | Local |
|---|---|
| `src/pages/FluxoTecnico.tsx` | Recomendação técnica aprovada |
| `src/pages/VisitaTecnica.tsx` | Visita técnica agendada |
| `src/pages/VisitaTecnica.tsx` | Nova recomendação aguardando decisão |
| `src/pages/app/MobileAplicacoes.tsx` | Aplicação realizada/retificada |
| `src/components/aplicacao/AplicacaoFormDialog.tsx` | Aplicação realizada/retificada |

Tipos usam `(supabase.rpc as any)` temporariamente até `types.ts` ser
regenerado a partir do banco de staging (ver Pendências).

### 4. Auth guard compartilhado (Fase 0, mantido)
`supabase/functions/_shared/auth-guard.ts` continua fornecendo `authenticate`,
`requirePost`, `decodePdfBase64` (15MB + magic bytes), `sanitizeFileName`,
`hasAnyRole`, `STAFF_ROLES` e `corsHeaders` com `x-internal-secret` no allow-list.

## Validações executadas localmente

| Comando | Resultado |
|---|---|
| `bunx tsgo --noEmit` | ✅ clean |
| `bun run build` | ✅ (workbox + 20 entradas pré-cache) |
| `bunx vitest run` | 2088 passed / 1 failed / 4 skipped — a única falha é pré-existente em `PortalAcompanhamento` (Fase 10.1), não relacionada a este hardening |
| `rg service_role src/` | ✅ nenhuma ocorrência no frontend |

## Pendências de runtime (exigem intervenção humana no console Supabase)

Impedimento técnico: **a pasta `supabase/migrations/` é bloqueada pelo
sistema de migrations do Lovable** (o agente não pode gravar diretamente
nela) e a tool de migração remota (`supabase--migration`) não está
disponível nesta sessão. Ações necessárias:

1. **Aplicar a migration** — copiar
   `restoration/pending-migration-20260810000000-comunicacao-fase0-hardening.sql`
   para `supabase/migrations/20260810000000_comunicacao_fase01_hardening.sql`
   e rodar via fluxo oficial (`supabase db push` ou dashboard). Antes de aplicar
   em staging, executar o `SELECT * FROM pg_policies WHERE tablename IN (...)`
   para snapshot pré-aplicação e depois pós-aplicação, comparando as policies
   efetivas nas tabelas: `notificacoes_operacionais`, `portal_notificacoes`,
   `push_subscriptions`, `aplicacao_emails`, `monitoramento_avisos`,
   `alertas_notificacao_config`, `alertas_notificacao_destinatarios`,
   `alertas_notificacoes`, `alertas_resumos`.
2. **Regenerar `src/integrations/supabase/types.ts`** a partir do staging
   após aplicação — expõe as três RPCs (`rpc_create_notificacao_operacional`,
   `rpc_record_aplicacao_email`, `rpc_create_portal_notification_secure`)
   e a coluna gerada `data_referencia`. Remover então os `as any` nas 5
   chamadas RPC.
3. **Deploy das Edge Functions**: `send-push-notification`,
   `enviar-pdf-visita`, `enviar-pdf-aplicacao`, `check-monitoramentos-vencidos`
   e `_shared/auth-guard.ts`.
4. **Cron `check-monitoramentos-vencidos`**: incluir header
   `x-internal-secret: $INTERNAL_FUNCTION_SECRET` (segredo já cadastrado
   na Fase 0). Não ativar em produção sem testes de staging aprovados.
5. **Matriz RLS runtime** (14 perfis: `anon`, `cliente_produtor A/B`,
   `parceiro_b2b A/B`, `parceiro_b2b_tecnico`, `aplicador`, `producao`,
   `administrativo`, `financeiro`, `gestor_comercial`, `gestor`,
   `administrador`, `service_role`). Casos: leitura própria/cruzada,
   INSERT próprio/terceiro, mudança de `cliente_id`/`usuario_id`,
   RPC autorizada/negada, Edge sem JWT, JWT inválido, método inválido,
   arquivo inválido, payload > 15MB, segredo interno correto/incorreto,
   duplicidade concorrente. **Não executado nesta fase** — depende de
   staging com a migration aplicada e usuários seed.
6. `send-transactional-email` continua ausente: PDFs devolvem
   `emailSent=false` + link assinado, e a gravação em `aplicacao_emails`
   deve usar `status='link_generated_no_send'` até o serviço existir
   (a check constraint da migration já contempla esse valor).

## Envios externos
Permanecem **desativados**: e-mail real (função não implantada), WhatsApp
(não iniciado), push só para operadores autorizados. A Fase 1 (motor
omnichannel, templates, fila) **não foi iniciada**.

## Segredos e cron
- `INTERNAL_FUNCTION_SECRET` já cadastrado (Fase 0, 48 chars). Não
  aparece em logs (edge functions retornam apenas 401 sem detalhes).
- Rotação: gerar novo valor via `secrets--generate_secret` e atualizar
  também o header do cron externo no mesmo ciclo (o secret novo invalida
  o antigo imediatamente após redeploy).

## Rollback
Executar `restoration/rollback-comunicacao-fase0-hardening.sql` após
reverter também as chamadas RPC no frontend para INSERTs diretos
(não recomendado — reabre as vulnerabilidades listadas na Fase 0).

## Parecer final
**APTO para transição à Fase 1** quando as pendências 1–4 forem
concluídas em staging e a matriz RLS (pendência 5) for validada.
Nada nesta fase toca produção nem ativa envios externos.
