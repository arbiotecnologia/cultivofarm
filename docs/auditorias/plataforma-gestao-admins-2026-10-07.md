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

## Homologação funcional read-only solicitada — 16:47 UTC

Base confirmada: HEAD `4da7545c8e19307ff230e1258d6ee9f053bbf340`, árvore de trabalho inicialmente limpa. Nenhuma regressão objetiva da unificação foi demonstrada e nenhum código foi alterado.

| Verificação | Resultado | Evidência real / limite |
|---|---|---|
| Base solicitada | PASS | SHA exato confirmado antes de qualquer alteração |
| Sessão real de Platform Superadmin no executor | BLOCKED | `LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged`; variáveis de sessão, chave de armazenamento e cookies injetados ausentes |
| Observação do navegador sem bypass | PASS restrito | Chromium real em `http://localhost:8080`, viewport 1280×1800; navegação inicial termina em `/auth`, formulário de entrada visível; sem access token na chave canônica de localStorage, zero cookies acessíveis ao documento. Não prova situação do navegador pessoal do proprietário |
| Uma entrada por linha, cabeçalho e quatro seções, desktop/mobile autenticados | BLOCKED | Gestão não acessível com sessão real disponível; nenhuma fixture DOM usada nesta rodada; evidência visual anterior não promovida a homologação |
| Acesso: estado, fail-closed, cooldown e bloqueio por e-mail pendente | BLOCKED | Nenhuma consulta autenticada à Edge de gerenciamento foi feita; nenhum envio/geração de senha tentado |
| Identidade existente não Superadmin: gestão e operações negadas | BLOCKED | Nenhuma segunda sessão real disponível; ausência de sessão e tela de entrada não substituem negativa autenticada por papel |
| Rede/Edge logs e CORS de operação autenticada | BLOCKED | Rede observada apenas com host canônico `swzpzcwiasxmjutrmvkm.supabase.co` e HTTP 401; sem imprimir caminho/query, headers, corpos ou tokens. Sem chamada de gerenciamento correlacionável, não houve consulta a logs remotos nem prova nova de origem/CORS |
| Testes/lint/build nesta rodada | NÃO REEXECUTADOS | Apenas documentação alterada, conforme escopo; registro automático já existente observado: `build OK` 2026-10-07T16:48:04Z, sem atribuí-lo a nova bateria |

Captura inspecionada: `/tmp/browser/admin-homologacao-readonly/public-start.png`; script de observação em `/tmp/browser/admin-homologacao-readonly/check_session.py`. Nenhuma autenticação simulada, JWT fabricado, credencial solicitada ou service_role usado no navegador. Nenhuma escrita remota, fixture, RPC mutável, migration, Edge, alteração de configuração, envio de convite/recovery/confirmação, geração de senha ou publicação/deploy manual.

### Gate humano mínimo
Este Supabase externo não oferece sessão gerenciada injetável ao executor; entrar no preview pessoal não comprova nem garante disponibilizar a sessão neste navegador isolado. O titular autorizado deve executar as leituras no próprio navegador autenticado e fornecer evidências sanitizadas, **sem senha, token, cookie, link recovery ou exportação HAR bruta**:
1. Com Platform Superadmin, abrir Gestão da plataforma → Administradores; registrar uma única entrada por linha e o diálogo com cabeçalho/abas em desktop e mobile, mascarando dados pessoais nas capturas compartilhadas.
2. Entrar em Acesso somente para consultar estado; registrar cooldown/pendência/bloqueio quando estados já existentes permitirem, sem criar esses estados nem clicar em envio ou senha. Estado ausente continua BLOCKED, não PASS por inferência.
3. Com identidade de teste já existente não Superadmin, registrar recusa da gestão e de consulta read-only de estado, sem reclassificação e sem invocar mutações. Negativas das operações mutáveis permanecem sem prova dinâmica nesta rodada, pois invocá-las não integra a autorização read-only.
4. Fornecer somente método, nome da Edge, horário UTC, status HTTP, origem/headers CORS permitidos e identificador de correlação não secreto para confronto focal com logs sanitizados, nunca Authorization/apikey/corpos pessoais.

**Decisão: NO-GO funcional; provas autenticadas BLOCKED, nenhum FAIL de regressão demonstrado.** Mudanças limitadas a este relatório e `roadmap.md`; preservados dados/histórico e SMTP/Auth config, planos, B2B, fiscal e pagamentos.

## Decisão do proprietário: retirar Responsabilidade — 17:04 UTC

O proprietário aprovou a remoção com base nas suas capturas reais. Essas capturas foram mencionadas na solicitação, mas não anexadas nesta rodada: a origem da decisão é o relato explícito do proprietário, não uma nova inspeção autenticada pelo executor. Esta decisão substitui a descrição anterior de quatro seções.

- `AdminGestaoAcoes` apresenta exclusivamente **Dados, E-mail e Acesso**. Removidos modo `responsavel`, trigger/conteúdo, formulário/confirmação, `salvarResponsavel`, hook `useDefinirResponsavelPrincipal`, prop `responsavelAtualId` e cálculos exclusivos; lock compartilhado continua protegendo as operações restantes.
- `PlataformaAdmins` não repassa mais a prop removida. `responsavelDe` continua necessário à identificação **Responsável principal**, preservada na tabela como informação somente leitura. Nenhum caminho substituto criado; provisionamento inicial preexistente não foi alterado.
- Abas usam `grid-cols-3` em desktop e mobile, com altura mínima de 44px; textos curtos Dados/E-mail/Acesso. Teste verifica exatamente três abas e ausência de Responsabilidade, além de uma única ação por linha.
- Os três testes específicos do fluxo retirado foram removidos, não contabilizados como provas atuais. Cobertura de edição, e-mail confirmado pelo titular, reenvio real de convite, recovery com rótulo correto, senha provisória/replay e travas permaneceu.
- Auditoria independente local read-only não encontrou dependência que tornasse insegura a retirada; RPC, hook exportado compartilhado, migrations, auditoria e histórico de responsável principal foram preservados.

| Verificação desta alteração | Resultado | Evidência / limite |
|---|---|---|
| Testes focais de gestão/acesso/reenvio | PASS | 26/26 em 3 arquivos |
| Suíte pertinente SaaS + Comunicação | PASS | 834/834 em 63 arquivos; redução de 3 testes corresponde ao fluxo removido |
| ESLint focal | PASS | Dois arquivos runtime e três testes, sem findings |
| Scanners segredos/fiscal | PASS | Dois arquivos runtime; nenhum segredo ou indicador de emissão fiscal |
| Build automático | PASS | Último registro observado: `build OK` 2026-10-07T17:05:57Z; build/typecheck manual não executados |
| Layout de três colunas/área de toque | PASS estrutural | Asserção de três abas e grid; mínimo 44px preservado; não equivale a nova inspeção visual autenticada desktop/mobile |
| Homologação Auth real | BLOCKED | Gate anterior permanece; capturas relatadas não certificam operações, RLS ou sessões neste executor |

**PASS focal de UX; NO-GO funcional autenticado preservado.** Somente frontend, testes, memória do requisito e documentação alterados; nenhuma migration, Edge Function, Supabase/Auth/SMTP/RLS, plano/B2B/fiscal/pagamento ou publicação/deploy manual.

## Motivo opcional na edição dos dados — requisito aprovado 17:10 UTC

### Auditoria antes da alteração
- Fluxo confirmado: `AdminGestaoAcoes` → `useEditarAdminEmpresa` → `public.platform_update_org_admin` (INVOKER) → `platform_private.update_org_admin_core` (DEFINER). Não há Edge neste caminho.
- Leitura remota no canônico `swzpzcwiasxmjutrmvkm` confirmou exigência de motivo mínimo 2 no core e constraint `platform_org_admin_audit_reason_check` com mínimo 2. A coluna `reason` é NOT NULL, sem default; histórico imutável, RLS de leitura exclusiva Superadmin e authenticated sem INSERT direto.
- Preservados checks internos `auth.uid()`/Superadmin, validação do alvo e vínculo do perfil/organização, CPF ativo, `FOR UPDATE`, `expectedUpdatedAt`, updated_at monotônico e replay/conflito da chave idempotente.

### Correção mínima e contrato vigente
- Migration aplicada e confirmada no histórico remoto: `20261007171308_b0bcbd71-d200-4b53-97ff-223ba7905160.sql`. Altera somente a validação de motivo no core e a constraint da auditoria: string vazia permitida **apenas** para `action='admin_profile_updated'`; demais ações mantêm mínimo 2. Nenhum dado histórico reescrito.
- Entrada null/vazio/espaços normaliza para `''`, preservando o contrato canônico NOT NULL text. Motivo preenchido exige pelo menos 2 caracteres após trim. Não há descrição inventada ou preenchimento automático. Os contratos históricos de outras ações não foram modificados.
- Core permanece privado, DEFINER com `search_path=''`, mesmo owner/ACL via CREATE OR REPLACE. Wrapper público permanece INVOKER. Leitura pós-fix confirmou EXECUTE anon negado, authenticated autorizado no core com check interno obrigatório, INSERT authenticated na auditoria negado. Sem novo wrapper, grant, policy ou alteração Auth/SMTP.
- UI exibe **Motivo (opcional)**, aceita vazio e mostra erro/aria-invalid para 1 caractere. Hook aceita motivo omitido/null, valida com Zod e normaliza antes da RPC e da chave estável; retry null/vazio/espaços usa a mesma chave. Demais validações, lock e seções preservados.

### Evidências reais desta rodada
| Verificação | Resultado | Evidência / limite |
|---|---|---|
| Destino canônico | PASS | config local e metadata remoto: produção `swzpzcwiasxmjutrmvkm`, user-managed; nenhum destino alternativo |
| Contrato vivo null/vazio/espaços/2+ | PASS SQL | Prova embutida na migration em subtransação; cada edição gerou exatamente uma auditoria com ausência `''` ou motivo normalizado |
| Auditoria completa e idempotência | PASS SQL | old_values/new_values com nome/telefone/CPF, ator, organização, origem platform_rpc, status, timestamp; replay não duplica auditoria, conflito de conteúdo negado |
| 1 caractere / OCC desatualizado | PASS SQL | SQLSTATE 22023 e 40001 respectivamente |
| Operação não autorizada | PASS SQL restrito | Wrapper e core negaram UID desconhecido com 42501; contexto SQL local de claims, **não sessão Auth real nem certificação RLS via API** |
| Restauração e resíduos | PASS | Rollback deliberado da subtransação; hashes integrais de convites/auditoria/perfis antes/depois iguais. Leitura independente pós-migration: 0 convites e 0 auditorias prefixados CERT_ADMIN_REASON; nenhuma escrita Auth/Storage |
| Testes focais gestão/acesso/reenvio/payload | PASS | 38/38 em 4 arquivos, incluindo null/omitido/vazio/trim, 1 caractere, 2+, retry e contratos anteriores de e-mail/senha |
| Suíte pertinente SaaS + Comunicação | PASS | 846/846 em 64 arquivos; logs `/tmp/admin-motivo-focal.log` e `/tmp/admin-motivo-suite.log` |
| Lint focal / scanners | PASS | 4 arquivos no ESLint; scanners segredos e integração fiscal sem findings |
| Build automático | PASS | `/tmp/observability/build-errors.log`: build OK 2026-10-07T17:14:02Z; não executado build manual |
| Typecheck frontend separado | NÃO EXECUTADO | Execução manual proibida pelo ambiente; build OK não foi tratado como prova separada de typecheck |
| Advisor após DDL | PASS focal | Migration informa zero findings novos; reconsulta: mesmos 461 históricos (17 INFO, 2 WARN anon DEFINER, 441 WARN authenticated DEFINER, 1 proteção senha); sem limpeza global |
| Revisão independente local | PASS focal | Constraint limitada à ação, core/ACL preservados, subtransação rollback e hash revisados, sem regressão objetiva identificada |
| Auth/RLS/UI desktop/mobile autenticadas | BLOCKED | `external_unmanaged`, sem sessão real disponível; provas SQL locais não substituem homologação autenticada |

Base inicial `8bfe5a9cb50b08580d7043531ba6aedcacbd3a57`; SHA observado antes deste complemento documental `d5cd6d3bead5462dcea21840c720ef5604c4dadf`; Git gerenciado pelo ambiente, sem commit manual. Arquivos: componente de gestão, hook existente, teste UI, novo teste de payload `admin-dados-motivo.test.tsx`, migration gerada pela ferramenta, roadmap/relatório e memória do requisito. Sem mudança estrutural: AGENTS.md preservado.

Reversão possível somente por futura migration autorizada: restaurar validação anterior do core e constraint anterior, **sem apagar auditorias**. Como o novo contrato pode produzir motivos vazios, restaurar a constraint antiga exigiria `NOT VALID` para preservar histórico legítimo; não executar reversão automaticamente.

**GO focal do contrato opcional; NO-GO funcional geral preservado** por ausência de Auth real. Sem Edge Function, SQL em auth.users/auth.sessions, alteração SMTP/Auth config/RLS, planos, B2B, fiscal, pagamentos ou publicação/deploy frontend. Fixture SQL fictícia descartada integralmente; dados reais e histórico preservados.
