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

## Serialização pós-aceite do e-mail (seção 7 do candidato)

Problema: após `holder_accepted_at`, o titular pode ter recebido um link oficial do Auth. Cancelar,
recusar ou expirar localmente não invalida esse token; um clique tardio mudaria `auth.users.email`
sem sincronizar `profiles`. Não há mecanismo oficial garantido para revogar esse link a partir daqui.

Decisão:
- Aceite trava o pedido (serializado por advisory lock + `FOR UPDATE`): admin cancel e recusa do
  titular retornam `email_change_accepted_locked` (PT409); nenhuma expiração local (prazo, novo
  pedido, troca de empresa) fecha pedido travado. Novo pedido para o alvo é bloqueado (neutro).
- O pedido permanece reconciliável: `sync_self`/worker/`request`/`cancel`/`decline` reconciliam via
  `platform_private.user_email_change_reconcile`, que só escreve `profiles.email` do próprio
  `target_id` quando o Auth já mostra o endereço canônico; auditoria fica na organização do pedido.
- Saída segura em erro de envio: `user_email_change_release_v1` (titular) libera a trava só se o
  servidor comprovar que o Auth não tem troca pendente (`email_change`) nem confirmada para o
  endereço; envio ambíguo que chegou a gravar a pendência continua travado.
- UI: admin vê "aceito — não pode ser cancelada"; titular não vê "Recusar" após aceite; erro de
  envio chama a liberação e só reabre "Recusar" se o servidor liberar.

Rollback: remove os pontos de entrada, mas MANTÉM `user_email_change_sync_self_v1`, o worker e o
reconciliador, porque links já aceitos podem ser confirmados depois. Dados e auditoria preservados.

Evidência local (PostgreSQL 17 descartável, Auth/caixa de e-mail falsos, sem envio real): 110/110 —
inclui cancelamento antes do aceite, cancelamento/recusa negados após aceite e entre aceite e envio,
liberação negada com envio ambíguo, prazo vencido sem expirar, confirmação tardia sincronizando,
liberação após falha comprovada e cancelamento depois, troca de empresa sem sobrescrita por outro
tenant e sincronização restrita ao titular. Não prova JWT/Auth/RLS hospedados.

---
# rev.5 — auditoria pré-release com os gatilhos reais de produção (17/11/2026, 15h UTC)

## Achados (catálogo de produção, somente leitura; ref comprovado em client.ts/config.toml; PostgreSQL 17.6)
1. `sync_user_cliente_principal` (AFTER STATEMENT ins/upd/del) promove principal vigente de QUALQUER usuário
   (inclusive consultor) e grava `profiles.cliente_id`. Harness anterior não o tinha.
2. **Bloqueador do candidato anterior:** `guard_profile_tenant_fields` (BEFORE UPDATE profiles) nega mudança de
   `cliente_id`/`email` sempre que `auth.uid()` não é nulo. Toda RPC sob JWT que cria o 1º vínculo, troca principal ou
   sincroniza e-mail falharia em produção com `profile_protected_fields` (provado no harness). Os escritores existentes
   (`admin_provision_user_profile_v1`, `platform_complete_org_admin_email_change`) rodam via service_role.
3. Transição consultor→produtor anterior mantinha o vínculo `principal` (promovido pelo gatilho a um cliente de consultoria)
   ⇒ o novo produtor herdaria leitura financeira desse cliente (`ar_producer_read` = papel produtor + `get_cliente_ids_for_user`);
   e o INSERT do novo principal antes da revogação violaria `uq_user_clientes_principal`.
4. Produtor→interno encerrava só o principal; secundários ficavam vigentes. Destino B2B inseria `parceiro_b2b` (gestor) sempre.
5. Administrador: política vigente (RLS de `user_roles` + `admin_edit_user_profile_v1`) permite ao admin do tenant conceder
   `administrador` só a usuário interno (externos: `user_edit_linked_role_unavailable`). O candidato permitia externo→admin numa operação.
6. **Exposição pré-existente (não alterada):** `campanhas_cliente_select` em `commercial_campaigns` não exige papel produtor;
   qualquer vínculo vigente (consultor incluído) vê campanhas comerciais do cliente. Reproduzido no harness com a política verbatim.
   Vínculos de consultor criados por esta tela ampliariam essa exposição. Decisão do proprietário necessária antes do postflight.
7. Corpos `cf_user_guards_v1.*` em produção usam CRLF; captura preserva os bytes (md5 conferido).

## Correções (candidato, seção 8; nada global alterado)
- Escritas de tipo de acesso e vínculos: `public.tenant_admin_user_access_exec_v1` (somente service_role) →
  núcleos `platform_private.user_admin_change_access_type_core` / `user_admin_consultor_link_core`, chamados pelo Edge
  candidato `edge/tenant-user-admin.index.ts.review` (getClaims+getUser do ator; iat repassado). O SQL reautoriza o ator:
  admin vigente, não superadmin, mesma empresa, iat posterior a `user_authz_epoch` e a convites. RPCs públicas antigas removidas.
- Escopo sem `principal`: produtor ⇒ encerra todos os vínculos do tenant exceto o escolhido, depois upsert principal;
  B2B ⇒ encerra todos; saída de produtor ⇒ encerra todos; interno sem consultor final ⇒ encerra todos. Produtor→produtor
  (secundários) permanece no caminho canônico (`no_change`).
- B2B: papéis só por lista explícita (`b2b_roles_required`); técnico não recebe gestor.
- Administrador: `admin_grant_requires_internal_user` se destino ≠ interno ou se o alvo tem papel externo.
- PRE: md5 de `sync_user_cliente_principal`, `guard_profile_tenant_fields`, `enforce_cliente_id_for_produtor`,
  `acquire_gate` e 28 gatilhos habilitados; drift aborta (HML diverge e não serve de referência).
- E-mail: sob JWT a reconciliação só observa (`auth_confirmed_sync_pending`); `profiles.email` muda só em
  `user_email_change_sync_service_v1` (service_role, Edge `edge/user-email-change-sync.index.ts.review` com o JWT do titular).
  Liberação pós-aceite exige 10 min de carência (Auth pode registrar `email_change` depois da resposta) e `ever_accepted_at`
  mantém reconciliáveis pedidos cancelados/expirados depois de aceitos: link tardio sincroniza só o titular, auditoria `late=true`.
- UI (flag `USER_ADMIN_REFINEMENT_INSTALLED=false`): escritas via `functions.invoke('tenant-user-admin')`; perfis B2B
  explícitos; Administrador oculto para alvo externo; seção de e-mail não monta quando o editor externo (F2) está montado
  (evita dois editores); titular chama o Edge de sync ao ver `auth_confirmed_sync_pending`.

## Testes
- PostgreSQL 17.12 descartável, 28 gatilhos de produção verbatim habilitados + leitores/políticas verbatim
  (`captured-prod-*.sql`): **147/147** (`evidence-local.json`, com `snapshots` antes/depois e `findings`).
  Bootstrap declarado: o 1º admin de cada empresa é semeado com `session_replication_role=replica` (z99_cf_require_admin exige admin prévio).
  Sintético: auth.uid/iat por GUC, Auth/caixa de e-mail falsos, tabelas consumidoras reduzidas. NÃO prova JWT/RLS/Storage hosted.
- Vitest: `userAdminRefinement` 29/29, `holderAccountGuards` 10/10. Regressão `config|auth|portal` 1246/1247 (falha pré-existente
  `cultivofarm-runtime.static` → `src/lib/fiscal/eligibilityDiagnostic.ts`, não tocado). `multiportal*|fluxo-tecnico|equipe-tecnica|
  clientes|monitoramento|b2bTecnicoCampo|mobilePerfil` 618/620 com initdb do sistema (sem `dict_snowball`); as 2 baterias PG
  repetidas com PostgreSQL 17 completo: 2/2. `tsgo -b --noEmit` OK; `vite build` OK (saída em /tmp).

## Pendências / limites
- Decisão sobre `campanhas_cliente_select` (achado 6) antes de ligar vínculos de consultor.
- Edges candidatos não implantados; revisão, instalação e postflight com JWT reais A/B (admin, consultor, produtor, B2B técnico)
  e Auth/SMTP reais. Mobile: só verificado por classes/estrutura e testes de componente; a UI está fechada pelo gate, sem prova
  em navegador real nesta rodada.
- Rollback deny-only atualizado (remove o ponto de entrada de serviço; mantém sync/reconcile e épocas).

---
# rev.6 — campanhas, auditoria das Edges e pacote HML (17/11/2026, 15h UTC)

## Campanhas: vínculo de consultor não concede acesso comercial
- Auditoria read-only em produção: a única leitura de campanhas por vínculo é `campanhas_cliente_select` (commercial_campaigns).
  `commercial_campaign_clientes/products/partners`, `rpc_commercial_consolidated_dashboard` e `rpc_commercial_simulator__tenant_core`
  exigem administrador/gestor_comercial (ou parceiro B2B do próprio parceiro); `vw_bi_commercial_campaigns` é security_invoker.
- Seção (9) do candidato: `ALTER POLICY` com a expressão capturada verbatim **+** papel `cliente_produtor` **e** ausência de
  `consultor_tecnico`/`tecnico_agronomo` (o vínculo não tem finalidade; papel técnico = ambíguo ⇒ nega). PRE pina md5 da expressão
  (`715fb261…`) e 3 policies; POST confirma. Produção hoje: 0 usuários com produtor+técnico.
- Rollback NÃO restaura a expressão antiga e aborta se a encontrar afrouxada.

## Lógica comum (produção e HML, idêntica)
- `platform_private.user_admin_scope_settle`: pós-condição na mesma transação, independente da versão do gatilho de principal
  (grava o `profiles.cliente_id` esperado e aborta `scope_postcondition_failed` se algum gatilho deixar outro estado).
- Troca de principal impossível sem violar `uq_user_clientes_principal` ⇒ `principal_sync_incompatible` (sem mutação).
- Ator: perfil ativo, sem senha provisória, empresa `ativo` (mesma regra de `h15_actor_organization`) + admin + mesma empresa + iat.
- Sync de e-mail: titular inativo negado.
- PRE de produção ficou MAIS estrito: impressão digital (5 empresas de produção presentes, nenhuma da HML).

## Edges (auditoria e reescrita)
- `edge/_shared/user-admin/verify-actor.ts`: `getClaims` (assinatura) + `getUser` (usuário/sessão vivos), nunca decode manual;
  exige `role=authenticated`, não anônimo, `sub` UUID, `iat`/`exp` coerentes, usuário não banido/excluído e `user.id = sub`.
- Identidade nunca vem de corpo/cabeçalhos (`x-user-id`, `x-forwarded-*`, `apikey` ignorados); `p_actor` no corpo é rejeitado.
- `tenant-user-admin`: só `change_access_type`/`consultor_link`, chaves e tipos por op (lista fechada), corpo ≤ 8 KB, JSON obrigatório,
  códigos de erro de lista fechada (mensagem livre nunca repassada). `user-email-change-sync`: sem parâmetros, alvo = `sub`.
- Gate: secret `USER_ADMIN_REFINEMENT_ENABLED="true"` (ausente/qualquer outro valor ⇒ 503 `disabled`); URL fixa por build.
- `deno test edge/handler_test.ts`: 12/12 (forjado alg none, service_role/anon/anônimo, expirado, iat futuro, usuário diferente/banido/
  excluído, cabeçalhos falsos, ops não enumeradas incl. `__proto__`, args extras, corpo grande, ator inativo ⇒ 403). Portas falsas:
  não prova a verificação real de assinatura do Auth hosted.

## Pacote HML (`vrlcdwmlytukrjezrrnf`)
- `hml/build_hml.py` gera tudo; o SQL difere do de produção SÓ no bloco `$pre5$` (asserção de equivalência no gerador).
- PRE HML: impressão digital HML; pins comprovados pelo POST do alinhamento 01 (aplicado em HML): guard_profile_tenant_fields,
  enforce_cliente_id_for_produtor, acquire_gate, is_platform_superadmin, platform_private.has_role, h15_actor_organization;
  os 25 gatilhos de guarda de produção com a mesma definição e HABILITADOS; gatilho de principal só nas variantes testadas
  (statement `1d053564…` ou linha legado `50392a57…`, corpo da migração 20260519155317); qualquer gatilho extra aborta.
- Garantias globais NÃO comprovadas em HML pelo repositório: gatilhos de `user_clientes`, `user_roles`, `partner_users`
  (fora do escopo do alinhamento 01) e o corpo de `sync_user_cliente_principal`. A sonda `00` lista exatamente o que falta.
- Na variante legado (sem o gatilho statement com filtro de vigência de produção), fail-closed sem mutação:
  encerrar/substituir o vínculo mais antigo de consultor com outros vigentes (gatilho legado reelege vínculo encerrado); consultor multi -> produtor com principal diferente (exige gatilho statement com filtro de vigência).
  Todo o restante (transições, B2B explícito, admin só interno, sessões antigas, multiempresa, e-mail, campanhas, rollback) passa.

## Testes rev.6 (PostgreSQL 17.12 descartável; Auth/e-mail sintéticos; não é prova hosted)
- produção (28 gatilhos verbatim): **170/170**; HML statement: **170/170**;
  HML legado (26 gatilhos): **168/168** — `evidence-local*.json`.
- Costura declarada só na cópia /tmp do HML: pin de `is_platform_superadmin` (sintético no harness).
- Vitest: config/auth/portal 1246/1247 (falha pré-existente `eligibilityDiagnostic.ts`); portais/visitas/clientes/comercial 454/454;
  monitoramento 166/166 (PostgreSQL completo). `tsgo -b --noEmit` OK; `vite build` OK.

## Instalação (somente após revisão; nada aplicado)
Ordem por ambiente: sonda → SQL → Edges (gate OFF) → postflight JWT real → gate ON → flag do frontend.
- Produção: `/dev-server/scripts/user-edit-access-email-links-20261117/candidate.sql.review` · rollback `/dev-server/scripts/user-edit-access-email-links-20261117/rollback.sql.review`
- HML: sonda `/dev-server/scripts/user-edit-access-email-links-20261117/hml/00-hml-user-topology-probe.sql` (READ ONLY; deve emitir `PROBE PRE_WOULD_PASS`) ·
  `/dev-server/scripts/user-edit-access-email-links-20261117/hml/candidate-hml.sql.review` · rollback `/dev-server/scripts/user-edit-access-email-links-20261117/hml/rollback-hml.sql.review` · manifesto `/dev-server/scripts/user-edit-access-email-links-20261117/hml/MANIFEST.json`
- Edges (copiar para `supabase/functions/`):
  - `/dev-server/scripts/user-edit-access-email-links-20261117/edge/_shared/user-admin/verify-actor.ts` → `supabase/functions/_shared/user-admin/verify-actor.ts`
  - `/dev-server/scripts/user-edit-access-email-links-20261117/edge/tenant-user-admin/handler.ts` + `index.ts.review` (produção) ou `/dev-server/scripts/user-edit-access-email-links-20261117/hml/edge/tenant-user-admin/index.ts.review` (HML) → `supabase/functions/tenant-user-admin/`
  - `/dev-server/scripts/user-edit-access-email-links-20261117/edge/user-email-change-sync/handler.ts` + `index.ts.review` (produção) ou `/dev-server/scripts/user-edit-access-email-links-20261117/hml/edge/user-email-change-sync/index.ts.review` (HML) → `supabase/functions/user-email-change-sync/`
  - Dependências já existentes: `supabase/functions/_shared/comunicacao/cors.ts`; `npm:@supabase/supabase-js@2.110.8`.
  - Config: verify_jwt padrão (verificação no código); secrets SUPABASE_URL/ANON/SERVICE_ROLE (padrão) + `USER_ADMIN_REFINEMENT_ENABLED`.
- Frontend: `USER_ADMIN_REFINEMENT_INSTALLED` continua `false` em `src/lib/configuracoes/userAdminRefinement.ts`.

## Testes reais que o pacote HML suporta (postflight)
JWT A/B reais: admin A × alvo de B; consultor puro/produtor/gestor comercial/parceiro lendo campanhas; mudança de papel com
sessão antiga e renovada; produtor→interno/B2B; B2B técnico sem gestor; admin só para interno; ator inativo/empresa inativa;
e-mail com Auth/SMTP de HML. Na variante legado, os itens bloqueados acima devem retornar o erro, nunca sucesso.

## Aditivo pós-homologação — campanhas vigentes do próprio produtor (17/11/2026)
- Defeito em HML (JWT real, c6052055): `commercial_campaign_clientes` só tem `camp_clientes_admin_all`; o EXISTS da policy rev.6 vê zero destinatários.
- Aplicar `campanhas-produtor-vigentes.sql` APÓS o candidato (prod e HML; mesmo md5 de política nas duas topologias). Rollback: `campanhas-produtor-vigentes.rollback.sql` (restaura exatamente a rev.6 segura de 9d3e83af e remove o helper).
- Helper `platform_private.campaign_visible_to_own_producer_v1(uuid)` (DEFINER, `search_path=''`, identidade só por `auth.uid()`, EXECUTE só `authenticated`, retorna boolean). Policy: ativa, comercial/ambos, `data_inicio <= hoje <= data_fim` (data civil America/Sao_Paulo, inclusiva), papel produtor sem papel técnico, cliente `ativo` e perfil ativo da mesma empresa, vínculo vigente sem revogação, campanha atribuída ao cliente. Nenhuma outra policy alterada; destinatários continuam ilegíveis.
- Local (PostgreSQL descartável, policy de destinatários capturada): prod 200/200, HML statement 200/200, HML legado 198/198. Não é prova JWT hosted.
- "Minhas campanhas" (portal do produtor, desktop e `/app`): `campanhas-produtor-minhas-rpc.sql` após o aditivo de vigência; rollback `campanhas-produtor-minhas-rpc.rollback.sql` ANTES do rollback do aditivo. RPC INVOKER `producer_my_campaigns_v1(offset, limit≤20)` filtra pelo helper do titular, então perfis cumulativos (admin+produtor) recebem só as suas. Local: prod 213/213, HML statement 213/213, HML legado 211/211.
