# Gestão segura de administradores provisionados — 2026-10-07

> **Estado vigente: NO-GO funcional.** O complemento abaixo substitui os contratos e o GO técnico históricos que descreviam alteração imediata do e-mail ou revogação SQL de sessões. As evidências históricas não certificam o fluxo novo.

## Causa
`PlataformaAdmins` só permitia provisionar e reenviar convites. Não havia como editar dados básicos, corrigir e-mail ou transferir o Responsável Principal sem mexer diretamente em `auth.users`, `profiles`, `platform_org_admin_invites` e `organizations`.

## Auditoria (Fase 0)
- O provisionamento usa claim → Auth → finalize (`platform_claim_org_admin_provisioning`, `platform_finalize_org_admin_provisioning`) com lease/fencing e `request_id` em `app_metadata`. Esse fluxo foi reaproveitado sem mudanças, inclusive no reenvio depois de uma troca de e-mail.
- `profiles.email` é protegido por `guard_profile_tenant_fields` sempre que `auth.uid()` existe. Por isso a sincronização do e-mail roda só em contexto service_role, chamada pela Edge Function.
- `organizations` exige o ticket `org_write` para escrita via API, e esse padrão foi mantido.
- Supabase (docs oficiais): `auth.admin.updateUserById` aplica a mudança na hora, sem fluxo de confirmação. `signOut(jwt)` exige o JWT do próprio usuário, e access tokens já emitidos não podem ser revogados antes de expirar.

## Desenho histórico — substituído pelo contrato vigente abaixo
| Ação | Caminho | Garantias |
|---|---|---|
| Definir responsável principal | `public.platform_set_org_principal_admin` (INVOKER) → `platform_private.set_org_principal_admin_core` (DEFINER) | auth.uid + Superadmin; `FOR UPDATE` na organização; responsável esperado (concorrência otimista); chave idempotente; candidato ativo da mesma empresa com papel `administrador` e não Superadmin; atualiza `responsavel_user_id`, `responsavel_definido_em`, flags dos convites e `cargo` na mesma transação; papéis preservados |
| Editar administrador | `public.platform_update_org_admin` → `platform_private.update_org_admin_core` | nome/telefone/CPF; CPF de administrador ativo já preenchido é bloqueado (exige fluxo específico); `updated_at` esperado; chave idempotente; convite e perfil atualizados juntos |
| Alterar e-mail (histórico, não vigente) | Edge + RPCs | Alteração imediata Auth e revogação SQL de sessões foram removidas; não constituem prova do contrato atual, que exige confirmação real do titular e não escreve nas tabelas Auth. |

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

## Execução autorizada — 16:05–16:19 UTC

### Correções e rastreabilidade
- Helper privado service-only valida ator Superadmin e alvo provisionado por `app_metadata.provisioning_request_id`, papel administrador, perfil/empresa ativos, tenant e exclusão do próprio ator/Superadmin; reutilizado nos caminhos de acesso/e-mail.
- Finalizador verifica usuário atual Auth e `iat` assinado; RPC exige sessão posterior a `access_valid_after`, nega operação em processamento e recovery expirado anterior à provisória. Assinatura antiga retorna false.
- Corrigidos parâmetro inexistente `p_delivery_mode`, referência remanescente a `profiles.updated_at` no finalize e renovação de prazo provisório 24h. Reenvio de convite nega mudança de e-mail aberta.
- Reenvio ambíguo exige confirmação humana auditada, preservando cooldown/lease/idempotência. Entrega parcial dos dois e-mails não é reduzida a falha definitiva. Ambas as telas mostram cooldown e enviam confirmação; cancelamento fictício removido e limitação antecipada. Replay não reexibe senha; exceções são tratadas.
- `AdapterResult.outcome/certainty` e rendered `assunto/corpo` confirmados por Deno; adapter compartilhado preservado.
- Forward-only canônico: `20261007160947_b9acd0f6-dc4b-49ed-ad1e-0024247540db.sql` e `20261007161139_836bbbc4-21c6-4848-8fa2-bdd6d8f26e0d.sql`. Duas tentativas recusadas por aspas SQL foram verificadas sem aplicação parcial antes dos retries. Migrations anteriores preservadas; guard privado e ACLs remotas conferidos; RPCs sensíveis sem EXECUTE anon/authenticated.
- SHA observado antes da documentação: `942a0ad3aa6c77f90c2936da4399d90065382967`; sem commit manual.

### Evidências finais
| Verificação | Resultado | Evidência |
|---|---|---|
| Deno check das três Edges | PASS | SDK/tipos/narrowing |
| Deno unitário | PASS | 17/17 |
| UI focal | PASS | 12/12, incluindo cooldown/ambiguidade/cancelamento indisponível |
| Suíte completa final | PASS | 5.597 PASS, 4 skipped; 390 arquivos PASS |
| Lint focal | PASS | Zero findings |
| Lint global | FAIL preexistente | 3.468 erros/127 avisos |
| Build automático | PASS | Último registro 16:15:32 UTC; tipos intermediários corrigidos |
| Typecheck frontend separado | BLOCKED | Execução manual proibida; Deno não substitui |
| Scanners focais | PASS | Sem segredos/integração fiscal |
| Advisor segurança | PASS focal | 461 históricos, zero novos; ACLs inspecionadas |
| Auth/sessões/RLS/UI autenticada | BLOCKED | Backend externo sem sessão/Auth Admin no ambiente |
| SMTP/single-use/concorrência/revogação real | BLOCKED | Sem prova funcional real |

### Decisão e limites
**NO-GO funcional.** Implementação e verificações disponíveis executadas, homologação pendente. Confirmação de novo e-mail não possui revogação equivalente de refresh sessions demonstrada nesta rodada; a remoção histórica SQL não existe mais e não foi restaurada. Não presumir que refresh tokens expirem com o access token. A semântica de revogação na alteração de senha Admin foi revisada em GoTrue, mas ainda precisa de prova real.

Sem SQL em `auth.users/auth.sessions`, fixtures, alteração de dados empresariais, cobrança, comercial, fiscal ou B2B; zero artefatos de teste criados em public/Auth/Storage por execução, sem varredura global de resíduos históricos. Sem publicação/deploy frontend. Edges seguem mecanismo automático do ambiente; execução remota autenticada não comprovada. Cancelamento Auth indisponível, sem simulação; apresentação provisória existente preservada sem refatoração adicional.

## Revisão independente focal — solicitação 16:20 UTC

### Forward-fixes mínimos
- `AdminAcessoDialog`: sem troca de e-mail pendente, todos os estados (inclusive `invited`) mostram **Enviar link para definir/redefinir senha** e explicam definição/redefinição pelo titular. A operação continua `password_link` (recovery); removidas as referências a reenvio/novo convite desse diálogo. Confirmação pendente continua usando a Edge de e-mail. Reenvio de convite na tabela foi preservado e testado.
- `AdminGestaoAcoes`: o botão “Cancelar solicitação” já estava ausente; mantido assim. Texto ampliado para aguardar expiração ou verificar confirmação/reconciliar. Removido `cancel` da união de ações interna dessa tela; backend `cancel_not_supported` permanece intocado, fail-closed. O botão “Cancelar” que apenas fecha o diálogo continua disponível.
- `platform-complete-first-access`: SDK **já estava fixado em 2.110.8**, preservado sem mudança de dependências. Import CORS flutuante substituído pelo helper compartilhado `corsHeadersFor/handlePreflight/isTrustedOrigin`. OPTIONS segue helper canônico; POST de origem não confiável recebe 403 antes de Auth/config/estado; POST sem Origin continua chegando à autenticação. Respostas JSON usam headers por requisição, incluindo erros, mantendo `no-store, private` e evitando mistura entre origens.
- Nenhuma mudança de banco: **sem migration**, sem reversão das anteriores, sem SQL/RPC remota, sem fixtures. SMTP, configuração Auth, planos, B2B, fiscal e pagamentos não alterados. Sem publicação/deploy frontend; alterações Edge seguem o mecanismo automático do ambiente, sem prova de execução remota autenticada.

### Evidências desta rodada
| Verificação | Resultado | Evidência/limite |
|---|---|---|
| Deno check do finalizador | PASS | SDK 2.110.8 e tipos reais |
| Deno focal | PASS | 18/18: autorização 6, policy e-mail 4, provisória 2, CORS 6 |
| CORS no handler real local | PASS unitário | Preflight confiável 204/headers; origem não confiável 403 em OPTIONS/POST; POST sem Origin 401 Auth; erros 401/405 com CORS/no-store; isolamento concorrente de headers. Stub apenas de Deno.serve, sem JWT fictício ou chamada de banco |
| UI recovery sem convite | PASS unitário | 4 novos testes: invited/active/temporary_password e confirmação de e-mail pendente; payloads das Edges verificados |
| Cancelamento indisponível e convite da tabela | PASS unitário | Testes existentes preservados; assert de espera/expiração/reconciliação acrescido |
| Suíte pertinente SaaS + Comunicação | PASS | 63 arquivos, 833/833 testes; avisos históricos React Router, sem falhas |
| Lint focal | PASS | 7 arquivos alterados de runtime/testes; mock Deno corrigido para HttpServer<NetAddr> e revalidado |
| Scanners focais | PASS | Segredos reais e integração fiscal: nenhum finding nos caminhos da revisão |
| Build automático | PASS | Último registro observado `/tmp/observability/build-errors.log`: 2026-10-07T16:23:44Z, build OK |
| Advisor segurança | PASS comparativo focal | 461 findings, distribuição igual à anterior: 17 INFO, 2 WARN anon DEFINER, 441 WARN authenticated DEFINER, 1 proteção senha. Sem alteração de banco nem limpeza global; contagens não certificam Auth/CORS ou identidade individual dos findings |
| Typecheck frontend separado / suíte global | NÃO EXECUTADOS nesta rodada | Execução manual de typecheck/build proibida pelo ambiente; escopo da suíte foi pertinente, não reexecução dos 5.597 testes globais |
| Auth/SMTP/sessões/UI autenticada reais | BLOCKED | Nenhuma nova evidência funcional real; limites anteriores permanecem |

SHA observado antes deste complemento documental: `da2c3d33e4105ec839eb096c5c886a2641c83143`; Git gerenciado pelo ambiente, sem commit manual. Arquivos focais: dois componentes, finalizador, novo `cors_test.ts`, novo `admin-acesso-dialog.ui.test.tsx`, testes `first-access`/`plataforma-admins-gestao.ui`, relatório e roadmap. `AGENTS.md` e guards privados não alterados.

**Decisão: PASS dos três contratos focais nas evidências locais disponíveis; NO-GO funcional geral preservado**, sem Auth real, sem afirmar homologação de envio, confirmação, revogação, single-use, RLS, concorrência de negócio ou UI autenticada. A concorrência testada nesta revisão é exclusivamente isolamento de headers CORS, não Auth ou banco.

## Unificação frontend aprovada — 16:27 UTC

### Entrega
- A coluna Ações possui somente **Gerenciar administrador** por linha. Removidos menu de três pontos, botão separado de acesso e botão/AlertDialog externo de reenvio.
- `AdminGestaoAcoes` é dono do único diálogo rolável e do lock entre seções; cabeçalho com nome, empresa, e-mail mascarado e status. Quatro abas: **Dados**, **Responsabilidade**, **E-mail** e **Acesso**. Mobile usa duas colunas nas abas, ações de pelo menos 44px e texto longo quebrável; desktop mantém quatro abas.
- Dados preserva nome/telefone/CPF, motivo obrigatório, CPF ativo bloqueado e `expectedUpdatedAt`. Responsabilidade preserva candidato ativo, responsável esperado e motivo opcional. E-mail preserva repetição do endereço, confirmação do titular, motivo opcional, chave da pendência, cooldown, confirmação de retry ambíguo e reconciliação; nenhum cancelamento fictício.
- `AdminAcessoDialog.tsx` agora exporta somente a seção interna `AdminAcessoSection`, sem botão ou modal próprio. O reenvio real reutiliza **a mesma instância** de `useConvidarAdminEmpresa` da página e o contrato existente, com confirmação inline e flag de ambiguidade. Recovery permanece explicitamente **Enviar link para definir/redefinir senha** e nunca é rotulado como convite.
- Confirmação de e-mail é centralizada na aba E-mail: Acesso informa a pendência e bloqueia mutações de acesso, sem duplicar hook, estado ou chamada de reenvio de confirmação. A consulta Auth ocorre somente ao entrar em Acesso e ao atualizar/reconciliar uma operação; falha de consulta bloqueia ações. Lock síncrono, estado pendente e bloqueio de fechamento/troca de aba evitam clique duplo em curso.
- Senha provisória permanece recebida uma única vez do servidor; replay não exibe senha. O valor local é eliminado ao ocultar, trocar seção ou fechar o diálogo; nunca é persistido ou logado. Nenhuma autorização passou para o frontend.

### Evidências
| Verificação | Resultado | Limite |
|---|---|---|
| Testes focais UI | PASS 29/29 | Um botão por linha/diálogo, quatro abas, edição/responsabilidade/e-mail, convite real, flag ambígua, lock, recovery, cooldown/suspensão/falha de estado, provisória/replay/ocultação/reabertura |
| Suíte pertinente SaaS + Comunicação | PASS 837/837, 63 arquivos | Não é reexecução da suíte global; alteração visual final revalidada nos 29 focais |
| Lint focal | PASS | Seis arquivos de runtime/testes |
| Scanners segredos e integração fiscal focais | PASS | Nenhum finding |
| Typecheck + build automáticos | PASS | Último registro 2026-10-07T16:34:37Z: build OK; typecheck manual separado não executado |
| Visual desktop/mobile isolado | PASS | Playwright 1280×1800 e 390×844; um diálogo/quatro abas, largura mobile 358px, sem overflow horizontal; screenshots inspecionadas das seções. Registro fictício apenas no DOM, sem sessão simulada nem mutação remota; não certifica UI autenticada |
| Deno / Advisors remotos | NÃO REEXECUTADOS | Sem alteração de Edge, migration, schema, RLS ou banco nesta rodada; evidências anteriores não foram promovidas a novas provas |
| Auth/SMTP/RLS/concorrência de negócio real | BLOCKED | Backend externo `external_unmanaged`, sem sessão disponível; NO-GO funcional mantido |

Arquivos: `AdminGestaoAcoes.tsx`, `AdminAcessoDialog.tsx`, `PlataformaAdmins.tsx`, três testes UI correspondentes, relatório/roadmap e regra estrutural em `AGENTS.md`. SHA observado antes do complemento documental: `aed8fcb42d718ea53028231e617ab311cf656bf2`; Git gerenciado pelo ambiente, sem commit manual.

**PASS focal da unificação frontend; NO-GO funcional geral preservado.** Nenhuma migration, Edge, operação de banco/Storage/Auth, fixture remota, alteração SMTP/Auth config, plano, B2B, fiscal, cobrança/pagamentos ou publicação/deploy frontend. Zero artefatos remotos criados por esta rodada; sem alegar nova varredura de resíduos históricos.
