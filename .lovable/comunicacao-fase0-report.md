# Comunicação — FASE 0: Auditoria e Hardening (Relatório)

Data: 26/07/2026
Escopo: `notificacoes_operacionais`, `portal_notificacoes`, `push_subscriptions`,
`aplicacao_emails`, `monitoramento_avisos`, `alertas_*`, e Edge Functions
`send-push-notification`, `enviar-pdf-visita`, `enviar-pdf-aplicacao`,
`check-monitoramentos-vencidos`.

## Parecer
**APTO COM RESSALVAS** — hardening de código e migration proposta prontos.
Aplicação da migration ao banco depende do fluxo de migration do Supabase
(o arquivo está em `restoration/pending-migration-20260810000000-comunicacao-fase0-hardening.sql`
porque a pasta `supabase/migrations/` é gerenciada pelo sistema de migrations
e não aceita gravação direta pelo agente).

## Vulnerabilidades encontradas

### CRÍTICAS
1. **`send-push-notification`** — sem verificação de JWT nem de segredo interno.
   Qualquer cliente HTTP poderia enviar push arbitrário para qualquer `user_ids`.
2. **`enviar-pdf-visita` / `enviar-pdf-aplicacao`** — sem JWT, sem limite de
   tamanho, sem validação de MIME, sem checagem de vínculo do usuário ao
   registro/aplicação. Permitia upload livre no bucket privado por qualquer
   chamador anônimo e envio de e-mail com link assinado.
3. **RLS `notificacoes_operacionais.auth_insert_notif_op`** —
   `WITH CHECK (auth.uid() IS NOT NULL)` permitia qualquer usuário autenticado
   inserir notificação com **qualquer `usuario_id`** (cross-user injection).
4. **RLS `aplicacao_emails."Users can record sent emails"`** — idem: qualquer
   authenticated podia registrar e-mails para qualquer `aplicacao_id`.
5. **`check-monitoramentos-vencidos`** — usava `user_id`/`urgencia` inexistentes
   em `notificacoes_operacionais`. Insert falhava silenciosamente; alertas
   nunca eram gerados.

### MÉDIAS
6. **`portal_notificacoes` UPDATE** — tinha `USING` mas não `WITH CHECK`;
   um portal user podia mudar `cliente_id` da notificação para outro cliente.
7. **`monitoramento_avisos`** — sem policies de INSERT/UPDATE/DELETE para
   `authenticated`; funcionava apenas via `service_role`. Sem bloqueio
   explícito, dependia de default-deny; ficou explícito agora.
8. **Referência a `send-transactional-email`** — função não existe no repo.
   Chamadores: `enviar-pdf-visita`, `enviar-pdf-aplicacao`.
   Mantido como best-effort (não invalida a operação); documentado abaixo
   como pendência de runtime.

### Sem alteração
- **`push_subscriptions`** já tinha policy correta (`auth.uid() = user_id`).
- Segredos e `service_role` **não** estão no frontend (auditado via
  `rg -n "service_role|SUPABASE_SERVICE" src`).

## Arquivos alterados

| Arquivo | Tipo | Descrição |
|---|---|---|
| `supabase/functions/_shared/auth-guard.ts` | NOVO | Helpers de auth: `authenticate`, `requirePost`, `decodePdfBase64` (15MB + magic bytes), `sanitizeFileName`, `hasAnyRole`, `STAFF_ROLES`. |
| `supabase/functions/send-push-notification/index.ts` | REESCRITO | POST-only, JWT ou `x-internal-secret`, staff pode broadcast, demais usuários só self; sanitiza título/body/url/tag; sem `service_role` no header de invocação interna. |
| `supabase/functions/enviar-pdf-visita/index.ts` | REESCRITO | POST-only, JWT, valida vínculo com `registros_consultor` (`consultor_responsavel`/`created_by`) OU staff; limite 15MB; magic bytes PDF; filename saneado. |
| `supabase/functions/enviar-pdf-aplicacao/index.ts` | REESCRITO | POST-only, JWT, valida vínculo com `aplicacoes` (`responsavel_id`/`created_by`) OU staff; mesmos guards. |
| `supabase/functions/check-monitoramentos-vencidos/index.ts` | REESCRITO | Exige `x-internal-secret` ou `administrador`; usa RPC segura `rpc_create_notificacao_operacional`; chama push via `x-internal-secret` (sem `service_role`); colunas corrigidas. |
| `restoration/pending-migration-20260810000000-comunicacao-fase0-hardening.sql` | NOVO | Migration proposta. |
| `restoration/rollback-comunicacao-fase0-hardening.sql` | NOVO | Rollback. |

## Migration proposta (resumo)

- `notificacoes_operacionais`: remove `auth_insert_notif_op` permissivo;
  UPDATE agora com `WITH CHECK`; novo `rpc_create_notificacao_operacional`
  SECURITY DEFINER com checagem de papéis.
- `aplicacao_emails`: substitui policy permissiva por policy que exige
  `enviado_por = auth.uid()` **e** papel de staff; novo
  `rpc_record_aplicacao_email` para uso interno.
- `portal_notificacoes`: UPDATE com `WITH CHECK` simétrico; INSERT/DELETE
  explicitamente negados para `authenticated`.
- `monitoramento_avisos`: escrita por `authenticated` negada explicitamente;
  SELECT preservado.

## Segredos gerenciados
- Gerado: `INTERNAL_FUNCTION_SECRET` (48 chars). Usado como cabeçalho
  `x-internal-secret` entre funções internas (cron → push).

## Testes executados (código)
| Comando | Resultado |
|---|---|
| `bunx tsgo --noEmit` | ✅ passou |
| `bun run build` | ✅ 29.76s |

Testes por papel (anon / cliente A/B / parceiro B2B / técnico / aplicador /
produção / administrativo / financeiro / gestor / administrador) devem ser
executados em staging após aplicação da migration; o hardening de Edge
Functions já rejeita chamadas anônimas independentemente de RLS.

## Pendências de runtime
1. Aplicar `restoration/pending-migration-20260810000000-...sql` via fluxo
   de migration Supabase.
2. Confirmar cron externo de `check-monitoramentos-vencidos` incluindo o
   cabeçalho `x-internal-secret: $INTERNAL_FUNCTION_SECRET`.
3. Implantar `send-transactional-email` quando o domínio de e-mail
   estiver pronto; enquanto isso, o retorno inclui `emailSent=false` e
   `downloadUrl` para envio manual.
4. Regenerar `src/integrations/supabase/types.ts` após aplicar a migration
   para expor `rpc_create_notificacao_operacional` e
   `rpc_record_aplicacao_email`.

## Rollback
Executar `restoration/rollback-comunicacao-fase0-hardening.sql`.
Reverte policies para o estado permissivo anterior; **não recomendado**.
Envios reais permanecem desativados: o Edge `enviar-pdf-*` só devolve link
assinado quando `send-transactional-email` não está disponível.
