# Gestão segura de administradores provisionados — 2026-10-07

> **Estado vigente: NO-GO funcional.** O complemento abaixo substitui os contratos e o GO técnico históricos que descreviam alteração imediata do e-mail ou revogação SQL de sessões. As evidências históricas não certificam o fluxo novo.

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

## Ajuste — motivo opcional somente na troca de e-mail

- **Escopo:** apenas `platform-org-admin-email-change` / `platform_begin_org_admin_email_change`. Responsável principal e edição de perfil continuam exigindo motivo (≥ 2).
- **UI (`AdminGestaoAcoes.tsx`):** rótulo "Motivo (opcional)", sem required; 1 caractere (após trim) mostra validação e bloqueia; vazio não bloqueia o botão.
- **Edge (`policy.ts`):** vazio/nulo aceito; 1 caractere → `invalid_reason`; > 500 rejeitado. Autenticação/autorização (`auth.ts`) inalteradas. Função republicada.
- **RPC (migration pequena, idempotente, sem DDL de tabela):** motivo vazio vira a descrição padrão `"Alteração de e-mail administrativo"`, gravada na solicitação e na auditoria. As restrições `NOT NULL` e `CHECK ≥ 2` da auditoria foram mantidas, e RLS e grants não mudaram. Retry com a mesma chave e motivo vazio continua idempotente. Rollback: remover a linha `IF v_reason = '' ...`.
- **Prova SQL com rollback** (`supabase/tests/plataforma-admins/02-email-motivo-opcional-rollback.sql`, executada no banco canônico): sem motivo aceito com descrição padrão (solicitação + auditoria); retry idempotente; mesma chave com outro motivo negado; 1 caractere negado; 2+ aceito e normalizado; não Superadmin negado; chamada direta `authenticated` negada; responsável principal e edição com motivo vazio negados.
- **Testes:** Deno 10/10; Vitest SaaS+Comunicação 789/789 (novo teste de UI do motivo opcional); typecheck, lint focal, build e scanner de segredos OK.
- **Pendente:** verificação visual autenticada no navegador.

## Complemento autorizado — motivo opcional também em "Definir como responsável principal"

- **UI:** "Motivo (opcional)", sem required; vazio não bloqueia "Confirmar"; 1 caractere (após trim) mostra validação e bloqueia. Edição de administrador segue com motivo obrigatório.
- **Migration pequena e idempotente** (só a função `platform_private.set_org_principal_admin_core`): motivo vazio/nulo vira `"Alteração de responsável principal"`; ≥ 2 caracteres mantido; auditoria inalterada (NOT NULL/CHECK). Rollback: remover a linha `IF v_motivo = '' ...`. RLS, grants e o wrapper INVOKER inalterados.
- **Prova SQL com rollback** (`03-principal-motivo-opcional-rollback.sql`, banco canônico): não Superadmin negado; 1 caractere negado; tenant cruzado negado; sem motivo aceito, com descrição padrão e auditoria contendo ator, empresa, responsável anterior e novo; retry da mesma chave idempotente; mesma chave com outro motivo negada; responsável esperado desatualizado (concorrência) negado; 2+ aceito e normalizado; edição sem motivo negada. A prova 02 foi ajustada para não esperar mais a recusa do responsável principal sem motivo.
- **Testes:** Vitest SaaS+Comunicação (inclui UI sem motivo / 1 caractere / 2+ / duplo clique); 790/790; typecheck, lint focal, build e scanner de segredos OK. Pendente: verificação visual autenticada.

## Revalidação consolidada (a partir de d371122)
- O complemento do responsável principal já estava aplicado no banco: `set_org_principal_admin_core` grava a descrição padrão e `platform_begin_org_admin_email_change` grava a dele. Não foi criada nenhuma migration nova.
- Provas 02 (e-mail) e 03 (responsável), executadas de novo no banco canônico com rollback, deram resultado idêntico ao anterior. A 03 agora também confere o timestamp da auditoria.
- Deno 10/10, Vitest SaaS+Comunicação 790/790, typecheck, lint focal, build e scanner de segredos OK.

## Finalização focal — 15:54–16:02 UTC

### Contrato vigente
- E-mail: `generateLink(email_change_current/email_change_new)` e SMTP canônico; nenhum `updateUserById(email)` ou `email_confirm:true` na Edge. O endereço antigo permanece válido até confirmação Auth; a conciliação exige novo endereço confirmado e ausência de `email_change`. Sem cancelamento manual de tokens; a ação é recusada com segurança.
- Motivo de e-mail permanece opcional. A repetição do novo endereço e a confirmação da solicitação na tela não confirmam o destinatário: somente o Auth pode fazê-lo.
- Senha definitiva: escolhida somente pelo titular. Links recovery nunca retornam ao operador. Provisória: geração criptográfica no servidor, resposta privada no-store uma única vez, prazo de 24h, troca obrigatória e estado server-side.
- `platform_actor_access_ready` existe somente em `platform_private`; `has_role` e `h15_actor_organization` públicos são INVOKER com EXECUTE apenas authenticated/service_role, delegando aos cores privados DEFINER com search_path fixo. PUBLIC/anon sem EXECUTE. A barreira de JWT anterior (`access_valid_after`) aplica-se à sessão do titular, sem negar permanentemente verificações de outro usuário feitas pelo servidor.
- Removidas referências a `profiles.updated_at` da marcação provisória, conclusão e conciliação. O fencing temporal vive no convite (`access_valid_after`), definido também antes de alterar a senha via Auth. Não houve escrita SQL em `auth.users` ou `auth.sessions` nesta finalização.
- **Divergência esclarecida:** o `AdapterResult` real de `_shared/comunicacao/adapters-types.ts` possui `outcome`/`certainty` e o render possui `assunto`/`corpo`, não `status`/`provider_code` nem `subject`/`body`. As Edges passam snapshot e quarto argumento rendered corretamente; Deno check confirmou o contrato. `status` pertence ao resultado de `deliverInviteEmail`, não ao `sendEmail`. Não foi alterado o adapter compartilhado para inventar outro contrato.

### Migrations e arquivos
- Preservadas `20261007154835_fab9c208-6028-4d86-877e-960704e231c3`, `20261007154900_d43618d0-7094-4de3-b742-a06b85b7e66f` e `20261007154950_aed5b88c-4a8f-4bf1-8831-3d654ae44e91`.
- Forward-fix aplicado: `20261007155703_7e6f0323-4d33-488f-8cdd-e091c104108d.sql`, somente no binding canônico `swzpzcwiasxmjutrmvkm` (config inspecionada). Definições/ACL remotas relidas após aplicação.
- Focais nesta finalização: `platform-invite-org-admin/index.ts` (SDK pinado), `access-handler.ts` (tipo do cliente), `access-policy_test.ts` (novo), `platform-complete-first-access/index.ts` (narrowing da senha/AMR), `platform-org-admin-email-change/auth_test.ts`, `src/test/saas/plataforma-admins-gestao.ui.test.tsx`, `d51-admin-invite-resend.ui.test.tsx`, este relatório e `roadmap.md`. AGENTS.md não alterado nesta finalização.
- SHA observado antes da documentação final: `6fdacec429a3951373b5711c6e7235295d67073e`. Não foi criado commit manual; o ambiente gerencia Git.

### Matriz pós-correção
| Aspecto | Resultado | Evidência/limite |
|---|---|---|
| UI unitária: confirmação em duas etapas, motivo opcional, sem link manual | PASS | 42 testes focais |
| Parsing/geração provisória e autorização Edge | PASS unitário | Deno 17/17 |
| Tipos das três Edges | PASS | `deno check` |
| Suíte completa | PASS | 390 arquivos PASS/1 skipped; 5.595 testes PASS/4 skipped |
| Lint focal | PASS | Arquivos corrigidos, saída sem findings |
| Lint global | FAIL preexistente | 3.468 erros/127 avisos; sem limpeza global |
| Build frontend automático | PASS | `/tmp/observability/build-errors.log`, último registro 15:57:17 UTC |
| Typecheck frontend explícito | BLOCKED | Execução manual proibida pelo ambiente; não alegado como PASS |
| Scanner segredos focal / integração fiscal | PASS | Nenhum segredo real/indicador de emissão |
| Advisor de segurança / aviso novo | PASS focal | 461 históricos: 17 INFO, 2 WARN anon DEFINER, 441 WARN authenticated DEFINER, 1 proteção senha; nenhum finding novo na migration; helper privado/wrappers conferidos |
| Confirmação Auth real, revogação e expiração provisória | BLOCKED | Auth Admin local ausente; fonte GoTrue não substitui prova funcional |
| RLS pós-troca e UI desktop/mobile autenticadas | BLOCKED | `external_unmanaged`, sem sessão disponível |
| Entrega SMTP ao titular | BLOCKED | Modo de teste não certifica entrega externa |

Sem fixtures ou mudanças em dados empresariais nesta finalização; não foi executada contagem global de resíduos. Sem publicação frontend, emissão fiscal, cobrança, alterações comerciais ou retomada B2B. As Edges seguem o mecanismo automático do ambiente; não houve comando manual de deploy nesta finalização.

### Riscos e decisão
**NO-GO funcional** até prova com Auth real do antigo/novo e-mail, validade single-use, revogação, sessões anteriores negadas, troca provisória e UI/RLS autenticadas. Cooldown/lease e guards foram inspecionados, não certificados em concorrência real. A expiração nominal da confirmação na tabela é informativa; validade do link é controlada pelo Auth. Falha parcial após alteração de senha permanece fail-closed e exige novo login/reconciliação. Não se declara conclusão de homologação nem 100%.
