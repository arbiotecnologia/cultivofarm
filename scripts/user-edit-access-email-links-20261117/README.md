# Editar Usuário — tipo de acesso, e-mail e vínculos do consultor (revisão, 17/11/2026)

## Auditoria (somente leitura, ref swzpzcwiasxmjutrmvkm comprovado em client.ts/config.toml)
- UI: `src/pages/Configuracoes.tsx` (diálogo "Editar Usuário", ~l.1122-1300); classificação de tipo em
  `src/lib/configuracoes/userLinks.ts` (`tipoAcessoDoUsuario`, derivado de papéis; `EDICAO_EXTERNA_DISPONIVEL=false`).
- E-mail: exibido `disabled`. Único fluxo de troca existente é de Superadmin para admin de organização
  (`platform-org-admin-email-change` + `platform_begin/mark/complete_org_admin_email_change`, tabela
  `platform_org_admin_email_changes`, links `email_change_current/new`). Não há fluxo tenant.
- Papéis: `user_roles` com policies de admin do tenant (CRUD) + gatilhos `trg_guard_superadmin_role_assignment`,
  `trg_user_roles_enforce_cliente`, `z99_cf_require_admin`. Tipo de acesso NÃO é coluna: é derivado dos papéis.
- Vínculos consultor↔cliente: `user_clientes` já possui `access_level (read|execute|manage)`, `valid_from`,
  `valid_until`, `revoked_at/by`, `assigned_by`, `is_active`, `principal`. RLS: só leitura (admin do tenant e próprio).
  Escritas hoje só por `admin_provision_user_profile_v1`, `b2b_finish_provisioning`, `sync_user_cliente_principal`.
  Revogados/futuros já são negados em acesso a cliente (pacote user-links-v0 instalado).
- Externos (B2B/produtor): pacote `scripts/user-links-phase2` (edição comum F2) e ciclo de vida de parceiro.

## Alteração executada (segura e reversível)
- Diálogo com altura máxima `90dvh` e rolagem interna (`overflow-y-auto overscroll-contain`) para mobile.
  Lista de perfis já tinha rolagem própria (`max-h-48`). Rollback: remover as três classes na linha do `DialogContent`.

## Não executado — exige DDL/autorização crítica em produção (aguarda revisão)
Ver `candidate.sql.review`. Resumo:
1. `tenant_admin_change_access_type_v1(p_user_id, p_target, p_expected_version, p_idempotency_key, p_reason)`:
   admin do tenant derivado no servidor; nega `p_user_id = auth.uid()`; transições Interno↔Parceiro B2B↔Produtor exigem
   vínculo válido do mesmo tenant (parceiro ativo / cliente ativo); remove papéis do tipo antigo e encerra (revoked_at)
   vínculos incompatíveis sem DELETE; grava auditoria em `clientes_audit_log`/tabela de auditoria existente; revoga sessões
   via Edge (`auth.admin.signOut`) após commit.
2. Troca de e-mail tenant: Edge `tenant-user-email-change` espelhando o fluxo de plataforma (begin → generateLink
   `email_change_current`+`email_change_new` → estado pendente → sincronização de `profiles.email` somente após
   confirmação observada em Auth). Requer tabela de solicitações (ou generalizar a de plataforma) — decisão do revisor.
   Envio de e-mail depende do SMTP canônico; comunicação externa permanece OFF até homologação.
3. `tenant_admin_consultor_link_v1(p_user_id, p_cliente_id, p_action add|end, p_access_level, p_valid_from, p_valid_until, p_idempotency_key)`:
   alvo deve ter `consultor_tecnico`/`tecnico_agronomo`; cliente do mesmo tenant; encerramento = `revoked_at/valid_until`,
   nunca DELETE; leitura paginada `tenant_admin_list_clientes_page_v1(p_search, p_offset, p_limit<=50)`.
   Acesso do consultor continua restrito às leituras técnicas (`can_user_access_cliente`); financeiro/comercial seguem negados.

## Testes
- Nenhum teste RLS entre tenants executado: depende das RPCs candidatas e de PostgreSQL descartável (`initdb` ausente
  no sandbox = bloqueio ambiental). Regressão de gestão de usuários: ver relatório da rodada.

## Riscos
- Mudar tipo de acesso afeta portais/sessões ativas; exige revalidação de sessão e testes A/B reais.
- Troca de e-mail mal sequenciada pode dessincronizar `profiles.email` e Auth; por isso sincronizar só pós-confirmação.

---
# Fases 2–5 — implementação e homologação local (17/11/2026)

## Arquivos
- `candidate.sql.review` — RPCs `tenant_admin_change_access_type_v1`, `tenant_admin_email_change_{request,status,cancel}_v1`,
  `tenant_admin_search_clientes_v1`, `tenant_admin_consultor_links_v1`, `tenant_admin_consultor_link_v1`; worker
  `platform_private.user_email_change_sync_v1` (service_role); auditoria append-only `platform_private.user_admin_change_audit`
  e estado `platform_private.user_email_change_requests` (privados, sem GRANT a anon/authenticated).
- `rollback.sql.review` — remove apenas os pontos de entrada; dados/auditoria preservados.
- `harness-stubs.sql`, `test-local.py`, `evidence-local.json` — PostgreSQL 15 descartável (`PGBIN=<postgresql-15>/bin python3 test-local.py`).
- `edge-tenant-user-email-change.md` — especificação do Edge (não implantado; emissão de links deve reutilizar o bloco
  existente de `platform-org-admin-email-change`).
- UI: `src/lib/configuracoes/userAdminRefinement.ts`, `src/components/configuracoes/UserAdminRefinementPanel.tsx`,
  integração no diálogo de `src/pages/Configuracoes.tsx` atrás de `USER_ADMIN_REFINEMENT_INSTALLED = false`.
- Teste: `src/test/config/userAdminRefinement.test.tsx`.

## Decisões
- Tipo de acesso continua derivado dos papéis (sem coluna nova). A RPC troca papéis/vínculos de forma atômica com lock
  por alvo, revalidação após a espera, idempotência por (ator, chave) com hash do pedido, motivo obrigatório e snapshot
  antes/depois. user_id e perfil são preservados; vínculos são encerrados (`revoked_at`), nunca apagados.
- B2B exige `partner_users` ativo do mesmo tenant já criado pelo ciclo de vida canônico (sem provisionamento paralelo).
- Produtor exige cliente do mesmo tenant; vínculo criado antes do papel (gatilho `enforce_cliente_id_for_produtor`).
- Sessões antigas: papéis são lidos ao vivo por `has_role` em cada requisição; privilégios removidos deixam de valer
  imediatamente no servidor. Revogação de refresh tokens via Auth Admin fica PENDENTE (não há API por user_id usada no projeto).
- Unicidade existente `(user_id, cliente_id)` em `user_clientes`: reativação reaproveita a linha; períodos anteriores
  ficam em `user_admin_change_audit` (`before_state`).
- Consultor: acesso técnico continua decidido por `can_user_access_cliente` → `has_active_user_cliente_access`
  (vigência, revogação e nível já respeitados); nada muda em financeiro/comercial.

## Resultados
- PostgreSQL 15 descartável: **47/47** (autoelevação, cross-tenant, não-admin, superadmin, anon sem EXECUTE, idempotência
  e conflito de chave, papéis residuais, preservação de user_id/partner_users, auditoria append-only e não legível,
  e-mail duplicado/inválido/cross-tenant/pendente/sync só após confirmação/cancelamento, busca paginada e escape de
  curingas, múltiplos vínculos, duplicado, período, substituição, revogação, futuro, histórico, concorrência).
  Costuras sintéticas: auth.uid por GUC, `platform_actor_access_ready` omitido, tabelas reduzidas. NÃO é prova JWT/RLS hosted.
- Vitest novo: 21/21. Regressão `src/test/config|auth|portal`: 1228/1229 (falha pré-existente em
  `cultivofarm-runtime.static` apontando `src/lib/fiscal/eligibilityDiagnostic.ts`, não tocado).
  `multiportal|visita|visit|monitoramento`: 627/630 + 2 skip; 3 falhas ambientais (`initdb` do sistema sem `dict_snowball`).
- `tsgo -b --noEmit`: OK.

## Pendências
- Revisão e aplicação do SQL pelo auditor (preflight do ref) e prova com JWT reais A/B.
- Edge de e-mail + worker de sincronização; comunicação permanece OFF (UI mostra "pendente, envio desativado").
- Revogação de refresh tokens após troca de tipo; multiperfil cumulativo (B2B gestor+técnico) segue para fase posterior.
- Ligar `USER_ADMIN_REFINEMENT_INSTALLED` somente após instalação e homologação.

## Riscos
- `user_roles` tem gatilhos `a00_cf_user_gate`/`z99_cf_require_admin`: compatíveis no harness, mas devem ser revalidados hosted.
- Remoção de papéis internos ao virar externo é intencional; perfis combinados legítimos exigem a fase multiperfil.

---
# Fechamento das lacunas de fee087c4 (17/11/2026, 14h UTC)

## Confirmação de e-mail pelo titular (sem links administrativos)
- Admin: só `tenant_admin_email_change_request_v1` (duplicidade, pendência única por titular/endereço, auditoria).
- Titular (`HolderAccountGuards`, montado no `AuthProvider`, atrás do gate): ao entrar, `user_email_change_sync_self_v1`
  → `user_email_change_my_pending_v1`; "Aceitar" chama `user_email_change_accept_v1` e então
  `supabase.auth.updateUser({ email: <endereço devolvido pelo servidor> })`. Endereço divergente do servidor aborta.
- Sincronização idempotente só quando `auth.users.email` já é o canônico (Auth confirmou). Endereço diferente
  confirmado no Auth nunca é sincronizado; o pedido segue pendente/expira. Worker service-only mantido como alternativa.
- Edge anterior descartado (ver `edge-tenant-user-email-change.md`).

## Papéis combinados
- Compatíveis com o destino são preservados (ex.: `parceiro_b2b`+`parceiro_b2b_tecnico`; internos existentes ao
  adicionar outro interno). Incompatíveis só saem se listados em `p_remove_roles`; senão `PT409 incompatible_roles`
  (DETAIL com a lista) e nenhuma mutação. Remover papel compatível → `invalid_remove_roles`. Nova assinatura com `p_remove_roles`.
- A UI lista os incompatíveis com caixas de confirmação explícita.

## Sessões antigas
- Mecanismo suportado já existente: `platform_actor_access_ready` nega autoridade quando `iat` do JWT ≤ marco.
  Candidato acrescenta `platform_private.user_authz_epoch` (PRE com md5 `048249c0…` do corpo capturado).
  `platform_private.has_role` consulta essa função, portanto TODAS as políticas/RPCs baseadas em papel negam o JWT
  antigo do alvo até a renovação; produção não tem políticas/funções que leiam papéis do JWT (consulta: 0/0).
- `my_session_authz_state_v1` informa `stale`; o titular renova com `refreshSession()` (o servidor já nega antes).
- Limite: `has_active_user_cliente_access` não consulta papel; vínculos são lidos ao vivo (revogado nega já) e os
  fluxos técnicos o chamam atrás de `has_role` em `can_user_access_cliente`.

## Testes
- PostgreSQL 15 descartável: **73/73** (`evidence-local.json`), com transporte de e-mail fake (caixa em memória) e
  Auth sintético (updateUser grava `email_change`; confirmação por token aplica `email`). Corpos `has_role` e
  `platform_actor_access_ready` carregados verbatim; PRE md5 passou. NÃO é prova de JWT/Auth/RLS hosted.
- Vitest: `userAdminRefinement` 23/23, `holderAccountGuards` 6/6, `authProviderTopology` 3/3.

## Pendências
- Revisão/aplicação pelo auditor; homologação com JWT reais A/B (incluindo token antigo após troca) e Auth real
  com SMTP canônico (entrega hoje OFF: o titular não receberá o e-mail de confirmação até a homologação).
- Gate `USER_ADMIN_REFINEMENT_INSTALLED` permanece `false`.

---
# Isolamento entre empresas (revisão complementar de fee087c4)
- `platform_private.user_admin_scope_proof`: escrita (tipo de acesso e vínculo do consultor) é rejeitada com
  `PT409 scope_unprovable`, antes de qualquer mutação, se o alvo tiver `user_clientes` ativo para cliente fora do
  tenant do servidor (ou cliente inexistente) ou `partner_users` ativo de outro tenant. Saneamento desses legados fica
  com o auditor (não há escrita cruzada por esta tela).
- `tenant_admin_consultor_links_v1`: itens só com `clientes.organization_id = tenant`; histórico só com
  `audit.organization_id = tenant` e cliente do tenant.
- `replace`: valida o cliente substituído no tenant (lado antigo e novo).
- Encerramentos e snapshots de transição filtrados por cliente/partner do tenant (defesa em profundidade).
- Pedidos de e-mail: status/cancelamento/titular/aceite/recusa/sync limitados à organização atual; novo pedido expira
  pendências de organização anterior; worker expira pedido cuja organização não é a atual do titular; duplicidade em
  outra empresa responde `email_unavailable` neutro. Replay idempotente vinculado à organização atual do ator.
- PostgreSQL descartável: **92/92** (inclui usuário A com vínculo ativo ao cliente B, histórico e pedido da
  organização anterior, partner_users de outro tenant, ator que trocou de empresa). Sintético; não é prova hosted.
