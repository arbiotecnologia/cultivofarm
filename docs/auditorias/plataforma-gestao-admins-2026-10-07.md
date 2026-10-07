# Gestão segura de administradores provisionados — 2026-10-07

## Causa
`PlataformaAdmins` só permitia provisionar e reenviar convites. Não havia como editar dados básicos, corrigir e-mail ou transferir o Responsável Principal sem mexer diretamente em `auth.users`, `profiles`, `platform_org_admin_invites` e `organizations`.

## Auditoria (Fase 0)
- O provisionamento usa claim → Auth → finalize (`platform_claim_org_admin_provisioning`, `platform_finalize_org_admin_provisioning`) com lease/fencing e `request_id` em `app_metadata`. Esse fluxo foi reaproveitado sem mudanças, inclusive no reenvio depois de uma troca de e-mail.
- `profiles.email` é protegido por `guard_profile_tenant_fields` sempre que `auth.uid()` existe. Por isso a sincronização do e-mail roda só em contexto service_role, chamada pela Edge Function.
- `organizations` exige o ticket `org_write` para escrita via API, e esse padrão foi mantido.
- Supabase (docs oficiais): `auth.admin.updateUserById` aplica a mudança na hora, sem fluxo de confirmação. `signOut(jwt)` exige o JWT do próprio usuário, e access tokens já emitidos não podem ser revogados antes de expirar.

## Desenho final
| Ação | Caminho | Garantias |
|---|---|---|
| Definir responsável principal | `public.platform_set_org_principal_admin` (INVOKER) → `platform_private.set_org_principal_admin_core` (DEFINER) | auth.uid + Superadmin; `FOR UPDATE` na organização; responsável esperado (concorrência otimista); chave idempotente; candidato ativo da mesma empresa com papel `administrador` e não Superadmin; atualiza `responsavel_user_id`, `responsavel_definido_em`, flags dos convites e `cargo` na mesma transação; papéis preservados |
| Editar administrador | `public.platform_update_org_admin` → `platform_private.update_org_admin_core` | nome/telefone/CPF; CPF de administrador ativo já preenchido é bloqueado (exige fluxo específico); `updated_at` esperado; chave idempotente; convite e perfil atualizados juntos |
| Alterar e-mail | Edge `platform-org-admin-email-change` + RPCs service-only `platform_begin/complete/mark_org_admin_email_change` | begin valida unicidade (convites, perfis, Auth, mudanças abertas), vínculo e tenant; Auth via `updateUserById(email, email_confirm)`; perfil e convite só são sincronizados depois que `auth.users` mostra o novo e-mail; `DELETE auth.sessions` (refresh tokens); convite pendente/falho recebe nova `email_idempotency_key` e passa a exigir reenvio pelo fluxo existente; falha parcial fica `failed`, e o retry com a mesma chave reconcilia |

Histórico imutável em `platform_org_admin_audit`, só leitura para o Superadmin, com trigger que bloqueia UPDATE/DELETE. O estado das trocas fica em `platform_org_admin_email_changes`. Uma troca que falhou é substituída automaticamente por uma nova solicitação somente se o Auth ainda tiver o e-mail antigo.

## Migrations
- `platform_org_admin_audit`, `platform_org_admin_email_changes`, RPCs (1ª migration de 2026-10-07 ~01:50 UTC)
- Correção de `updated_at` monotônico na edição e status `cancelled` (2ª migration)

## Evidências
- `supabase/tests/plataforma-admins/01-gestao-admins-rollback.sql` (rollback integral): anon, admin de tenant e chamada direta negados; transferência, retry idempotente, conflito de chave, responsável esperado desatualizado, outro tenant, candidato pendente, empresa com um único administrador e motivo curto; edição, idempotência, CPF de ativo bloqueado; e-mail de convite falho, e-mail em uso/inválido, ator não Superadmin, operação paralela, conclusão antes do Auth negada, retry depois de falha, conclusão com 2 sessões revogadas, perfil e convite sincronizados, auditoria imutável.
- Prova curta: edição concorrente gera conflito; substituição de troca falha permitida só com o Auth inalterado.
- Deno: 3/3 (`policy_test.ts`). Chamada sem token: 401 no gateway.
- Vitest: `src/test/saas` + `src/test/comunicacao` 788/788; typecheck e lint focados limpos; scanner de segredos OK.

## NÃO VERIFICADO
- Login real com o novo e-mail e recusa do antigo, com usuário fictício via Admin API: o harness não tem service_role nem sessão de Superadmin. A troca no Auth foi simulada no SQL.
- Envio real de convite ou aviso ao e-mail anterior (entregas externas continuam desativadas por política; o aviso é registrado como `skipped`).
- Navegador autenticado em desktop/mobile.

## Riscos
- Access token já emitido continua válido até expirar (cerca de 1h).
- O link de recuperação antigo de convite pendente só deixa de valer quando um novo link é gerado no reenvio.
- O reenvio de convite (claim) não consulta mudanças de e-mail abertas. A janela é mitigada porque o begin recusa operação com lease ou envio em andamento.

## Rollback
Remover as RPCs novas e a Edge Function e esconder o menu na UI. As tabelas novas são aditivas e o histórico deve ser mantido.

## Decisão
GO técnico para uso controlado pelo Superadmin. Homologação real da troca de e-mail ativa: NO-GO até o teste com conta fictícia e sessão real.

## Hardening pré-publicação — validação de JWT (anti-regressão `invalid_token`)

- **Causa:** `platform-org-admin-email-change` validava o JWT com cliente anon + `auth.getClaims(token)`, padrão que já havia gerado `invalid_token` em `communication-provider-settings`.
- **Correção:** novo `auth.ts` (`authorizeSuperadmin`) reutiliza o padrão comprovado: Bearer → cliente service_role server-side (`persistSession=false`, `autoRefreshToken=false`) → `admin.auth.getUser(token)` → `actorId = data.user.id` → `is_platform_superadmin`. Fail-closed: 401 `unauthorized`/`invalid_token`, 403 `forbidden`, 500 `authorization_check_failed` (inclusive exceções), sem detalhes internos. Env ausente → 500 `server_misconfigured`.
- **Import:** `npm:@supabase/supabase-js@2.110.8` (mesma versão do lock); removido `esm.sh@2` flutuante. `verify_jwt=true` mantido; CORS inalterado.
- **Testes:** `auth_test.ts` 6/6 (sem token, token inválido/exceção, não-superadmin, falha de permissão, ordem autorização → begin/updateUserById, ausência de getClaims/pin) + policy 3/3 + comunicação 3/3; Vitest SaaS+Comunicação 788/788 (contrato estrutural atualizado); typecheck, lint, build e scanner OK.
- **Sem migration**, sem alteração de dados reais. Função republicada.
- **Risco evitado:** Superadmin legítimo recebendo 401 `invalid_token` e impossibilitado de trocar e-mail ativo.
- **Pendente:** prova autenticada real no navegador (login com novo e-mail / recusa do antigo).
