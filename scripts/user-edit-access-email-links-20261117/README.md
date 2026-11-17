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
