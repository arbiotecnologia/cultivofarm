# Foundation de cache de autorização (mesma identidade) — 2026-10-17

## Revisão 0c324c2d — recorte atual

Resultado/arquivos/limites em `authz-cache-anexos-revisao-0c324c2d-20261017.md`.
Preflight v3 hosted falhou: Cliente é VOLATILE, não STABLE. Candidata v4 corrige
contratos individuais, sem alterar resolvers. Revisão monotônica e Blob são
candidatos fechados, não instalação/cobertura universal/liberação de associações.

## Recorte 01:30 UTC — correção restrita sobre 5aff4b0

Esta seção **substitui as alegações anteriores sobre v2/lease/ABA**. As seções
abaixo são histórico, não aprovação da candidata atual.

### Auditoria antes das alterações
- HEAD inicial `5aff4b06369d3530272ee2107205f534669b0a16` preservado como base.
  AR Bio ACTIVE é evidência do titular, correlação
  `22b1206d-ef4d-4409-91ec-add115a16228`; nenhuma ativação repetida.
- Os 15 testes existentes passavam, mas um deles exigia foco mantendo valid;
  essa expectativa contradizia a revisão. Foi corrigida para **pending imediato**,
  sem enfraquecer proteção. Novo caso t10→t15 reproduz o prazo que era estendido.
- SQL v2 era core **public** e wrapper **DEFINER**, apesar dos comentários;
  role externa + vínculo genérico ignorava papel, exclusão, organização e B2B entitlement.
- Alerta do investigador sobre resolver Cliente histórico foi descartado:
  evidência live arquivada `c80d5900692d960f649d0a9f7850fe2c` já protege
  vigência/revogação/fallback. Não alterar esse resolver nem principal.

### Delta e arquivos
- `src/lib/authz/authzEpochMonitor.ts`: prazo confirmado separado de timeout;
  poll t10 conserva t15 até resposta válida; sucesso t14 renova só até t25,
  não t29. Foco/retry entra pending imediatamente. Offline/expiração/stop
  invalidam gerações; erro antigo não derruba retry válido. `checkAccess` é
  leitura pura para uso durante render; timer/poll/resposta tratam expiração.
- `src/hooks/useAuth.tsx`: um monitor por identidade/tenant; latch de primeira
  readiness evita depender do batching profile/roles e não recria no refresh;
  logout para monitor antes do await. Consultor removido da lista de externos.
  Boundary e hooks existentes preservados: epoch+readiness cercam consultas/URLs.
- Testes: `src/test/config/authzEpochMonitor.test.ts`,
  `authzFoundation.integration.test.tsx`, `scopedPortalQuery.session.test.tsx`
  e `src/test/equipe-tecnica/useSignedUrls.test.tsx`.
  Integração usa **AuthProvider, QueryClient, boundary, useScopedPortalQuery e
  useSignedUrls reais**, com sessão/transporte simulados. Rascunho/objectURL
  de Sensitive é cleanup simulado, não prova de anexos reais.
- `scripts/authz-cache/candidate.sql.review`: v3, schema dedicado
  `authz_cache_private`, core DEFINER **sem parâmetros** derivando auth.uid(),
  wrapper público INVOKER; USAGE/EXECUTE somente nos dois objetos necessários
  a authenticated, sem USAGE novo em platform_private. Chamada direta ao core
  também self-only. search_path vazio e referências qualificadas.
  Produtor exige role correspondente + get_cliente_ids_for_user + scope canônico;
  B2B usa b2b_commercial_context, que resolve exclusividade/papel/partner ativo
  não excluído/organização/entitlement `catalogo_precos` e legacy tenant.
  Mixed roles inelegíveis nesta candidata externa restrita; não inventa contexto.
  Retorno somente eligible/fingerprint. Hash não é nova autorização.
- `scripts/authz-cache/rollback.sql.review`, `tests.sql.review`, `test-local.py`:
  rollback sem CASCADE, gate fechado deve ser comprovado externamente;
  testes transacionais sintéticos, sem execução hospedada.
- `AGENTS.md`, memória e roadmap atualizados; nenhuma rota, flag de liberação,
  dependência, principal, associação, Auth/SMTP, pagamento ou snapshot alterado.

### Evidência executada nesta rodada
- **107/107 Vitest PASS**, 7 arquivos: monitor19, integração12, scoped11,
  signed21, storage scope8, seleção Produtor9, diálogo F2 27.
- **35 assertions SQL PASS + rollback PASS** em PostgreSQL descartável.
  Core/wrapper candidato exatos; scopes Produtor/B2B reutilizam corpos locais.
  Auth, entitlements, phase1 e resolver Cliente são dependências reduzidas/stubs,
  não fullschema hosted. Inclui clock real expirando vínculo sem DML adicional,
  papel/multipapel/multivínculo/exclusão/tenant/entitlement e ACL mínima.
  Primeira execução falhou no mixed-role; fechamento explícito foi corrigido
  e todos os asserts reexecutados. Não atribuir PASS à versão anterior.
- Lint focal: **0 erros, 4 warnings existentes useAuth**. Diff-check limpo.
  Build automático OK às 01:37:22 UTC; typecheck dedicado **UNVERIFIED**,
  não executado manualmente por restrição do ambiente.

### Pendências e riscos — NO-GO de abertura
- `AUTHZ_CACHE_FOUNDATION_ENABLED=false`; edição de vínculos bloqueada.
  Nenhum SQL hosted, deploy/publicação ou escrita real executado nesta rodada.
- Preflight hosted/hash B2B atual, ACL/owner e fullschema/RLS/JWT/GoTrue e
  fluxo autenticado UI→RPC **UNVERIFIED**. Ferramenta sem prova de ref não usada.
  Sessão externa não gerenciável pelo agente; teste local não certifica hosted.
- ABA de respostas/estados **observados** coberto; vínculo revogado e restaurado
  integralmente entre polls pode manter hash se nenhuma revisão monotônica mudar.
  Não existe prova de atualização universal de profiles.updated_at por todo writer.
  Revisão técnica precisa tratar esse limite antes de qualquer abertura.
- URL assinada continua válida até TTL de 3600s; limpar estado não revoga bytes
  baixados nem URL copiada. **Próximo recorte: anexos autenticados com Blob URLs,
  descarte de respostas obsoletas e revokeObjectURL real**. Não implementado aqui.
- Riscos multidispositivo limitados por poll/lease, sem revogação instantânea;
  troca de vínculos NÃO liberada. Regularização AR Bio não é reexecutada.

Recorte autorizado após instalação do principal v3. Sem troca de vínculos, sem
SQL hospedado, sem publicação, sem abrir gate de associação.

## 1. Reconciliação do principal v3 (fato instalado)

- Migration `20261016235551 user_client_principal_current_links_statement_sync`
  instalada pelo auditor; MD5 live `1d053564ccd5fa672a10ec87d5cb0baa`.
- Ajuste único no preflight: comparação do trigger por
  `tgfoid='public.sync_user_cliente_principal()'::regprocedure`, `tgnargs=0`,
  `tgqual IS NULL`, `octet_length(tgargs)=0` (live omite prefixo de schema no
  `pg_get_triggerdef`). Espelhado em `scripts/user-links-principal/candidate.sql.review`.
- Índice live `uq_user_clientes_principal UNIQUE(user_id) WHERE principal`
  NÃO estava no harness; espelhado. Correção de alegação anterior: UPDATE
  marcando segundo `principal=true` é NEGADO (23505) — o índice verifica
  unicidade antes do trigger AFTER STATEMENT. Harness corrigido: troca de
  principal só via revogação/vigência. **40/40 checks PASS** em PostgreSQL
  isolado (guards reais, FK cascade, writer aninhado, 2 conexões).
- Modo associação futuro terá de resolver troca de principal sem violar o
  índice e sem flags/GUC setáveis — pendência registrada.

## 2. SQL candidato (FORA de migrations, NÃO aplicado)

`scripts/authz-cache/candidate.sql.review` — MD5 `422ea82954e291c58aed7f8de5abfd81`,
SHA-256 `cc09ac36db1f5f824fadf654a9505d21d87543ecf61493d1da0ff0d10274d774`.

- `public.get_my_authz_fingerprint()`: self-only, sem parâmetro de
  usuário/tenant; deriva `auth.uid()`; não confia em JWT metadata.
- Fingerprint opaco = md5(`profile.updated_at` monotônico + roles + vínculos
  `user_clientes` com estado completo + `partner_users`). `updated_at`
  captura A→B→A (cliente_id sozinho não basta).
- Flag `v` por vínculo computada com `now()`: expiração temporal muda o
  fingerprint mesmo sem DML.
- Elegibilidade atual via resolver canônico `get_cliente_ids_for_user`
  (fonte única de vigência/revogação); ACL fechada (REVOKE PUBLIC/anon,
  EXECUTE authenticated/service_role); STABLE SECURITY DEFINER, search_path fixo.
- Rollback: `DROP FUNCTION` — função nova, sem dados/triggers, contenção completa.

Harness `scripts/authz-cache/test-local.py`: **14/14 checks PASS** em
PostgreSQL isolado — negação sem sessão, ACL anon negada, elegibilidade,
mudança de fingerprint por vínculo/revogação/vigência temporal/roles/
updated_at (ABA)/partner, self-only entre identidades, determinismo.
UNVERIFIED: ensaio hosted BEGIN/ROLLBACK, policies completas, resolver live integral.

## 3. Frontend (gate próprio FECHADO)

- `src/lib/authz/authzEpochGate.ts`: `AUTHZ_CACHE_FOUNDATION_ENABLED = false`.
- `src/lib/authz/authzEpochMonitor.ts`: monitor único por AuthProvider.
  Polling 10s apenas visível+online+lease válida; lease máx 15s medida desde
  o INÍCIO do request (resposta atrasada não renova lease vencida);
  foco/visibility/online revalidam antes de mostrar; erro/offline/timeout
  expiram e ocultam; mudança de fingerprint notifica epoch change uma vez por
  época; geração por request descarta respostas antigas (ABA).
- Integração em `src/hooks/useAuth.tsx` atrás do gate: epoch change →
  geração++, `queryClient.cancelQueries()+clear()`, `clearActivePortalContext()`,
  `refresh()`; expire → cancela consultas e limpa seleção de portal. Callback
  de auth permanece síncrono; sem chamadas Supabase dentro dele; sem
  BroadcastChannel entre sessões (cada sessão mantém o próprio monitor).

Testes `src/test/config/authzEpochMonitor.test.ts` (fake clock + promises):
11/11 — troca de vínculo mesmo uid/org/role, duas sessões sem Broadcast,
expiração temporal, erro, offline, retorno de foco, resposta atrasada/ABA,
logout, ineligible. Regressão F2: **52/52 PASS** nos 3 arquivos.
Lint focal: 0 erros (4 warnings padrão do arquivo, pré-existentes).
Build OK; `git diff --check` limpo.

## 4. Limites declarados

- Não finge revogação instantânea offline nem de bytes já baixados/URL
  assinada — anexos/signed URLs são o próximo recorte.
- Autorização SQL continua validando estado atual independente da UI.
- Gate de associação permanece fechado; common F2 e V0 instalados preservados;
  SMTP/Auth/senhas/fiscal/comercial intocados.
- RPC candidato NÃO aplicado: enquanto o gate estiver fechado o monitor não é
  criado; abrir o gate sem a função instalada faz o fetcher falhar e expirar
  (fail-closed, oculta dados) — comportamento seguro, mas o gate só deve abrir
  após a migration ser aplicada e revisada.

## 5. Revisão c787cd9e — correções e integração completa (17/10/2026)

Revisão independente NÃO aprovou a versão isolada; esta rodada completou a
foundation pedida. Nada foi ativado/aplicado/publicado.

### 5.1 Correções independentes incorporadas

- Migration `20261017000806 client_portal_branding_deny_future_links`
  arquivada em `scripts/user-links-v0/installed/` (ledger exato, sem
  reaplicar): `save_client_portal_branding` MD5 antes
  `36897b8731527d5a22ba4a995b337a93` → depois `2471d0af39864bf3093d24371aa6dbc6`;
  única adição `AND (uc.valid_from IS NULL OR uc.valid_from <= now())`; ACL
  anon=false/authenticated=true preservada. Hosted 5 estados BEGIN/ROLLBACK
  PASS reportados pelo auditor (válido/revogado/inativo/futuro/expirado).
- P2 `ClienteDocumentosTab`: `type="button"` em Enviar/Baixar/Excluir (estavam
  submetendo o form pai e fechando o modal). Teste RTL novo com `<form>` real,
  signed URL pendente e arquivo sem tipo: submit 0 nos três caminhos; Excluir
  só abre confirmação. **3/3 PASS**; sem outra mudança no componente.

### 5.2 SQL candidato v2 (FORA de migrations, NÃO aplicado)

`scripts/authz-cache/candidate.sql.review` reescrito após a revisão:

- Núcleo privado `_authz_fingerprint_core(uuid)` (EXECUTE revogado de
  PUBLIC/anon/authenticated; apenas service_role) + invoker público
  `get_my_authz_fingerprint()` self-only (EXECUTE apenas authenticated;
  deriva `auth.uid()`, sem parâmetro de usuário/tenant, sem JWT metadata).
- Elegibilidade EXTERNA estrita: perfil ativo, sem senha provisória, com
  organização, ao menos uma role externa (cliente_produtor, parceiro_b2b,
  parceiro_b2b_tecnico, consultor_tecnico) E ao menos um vínculo vigente
  coerente com o tenant — `user_clientes` vigente com cliente ativo da mesma
  organização, ou `partner_users` com `partner_accounts.ativo` e
  `commercial_owner_organization_id` igual à organização do perfil.
- Retorno OPACO: apenas `{eligible, fingerprint, server_now}` — sem IDs, sem
  listas de roles/clientes. Fingerprint inclui `profiles.updated_at`
  (monotônico, captura A→B→A), organização, roles, estado completo dos
  vínculos (revogação/vigência/principal + status/tenant do cliente) e estado
  do partner (ativo/tenant); flag `v` por vínculo computada com `now()`
  captura expiração temporal sem DML.
- Preflight de drift confirma as colunas referenciadas antes de criar.
- Harness `scripts/authz-cache/test-local.py`: **22/22 checks PASS** em
  PostgreSQL isolado (negação sem sessão, ACL do núcleo fechada para
  authenticated, perfil interno inelegível mesmo com vínculo, role externa sem
  vínculo inelegível, retorno sem IDs, revogação/vigência temporal/cliente
  inativo/cliente de outro tenant/partner inativo/partner de outro tenant,
  ABA via updated_at, senha provisória, self-only, determinismo).
  UNVERIFIED: ensaio hosted BEGIN/ROLLBACK, policies completas, dados live.

### 5.3 Monitor e integração real (gate permanece FALSE)

- `authzEpochMonitor.ts`: relógio MONOTÔNICO injetado (`performance.now` no
  runtime); lease de 15s expira também em estado `valid` (deadline armado e
  rechecado no acesso via `checkAccess`); `pending` esconde render quando não
  há lease vigente, mas revalidação em background com lease vigente não
  derruba a tela (sem flicker); offline/expiração invalidam a geração —
  resultado em voo de geração antiga nunca reabre; evento `offline` do
  navegador expira imediatamente.
- `useAuth.tsx`: um único monitor por AuthProvider, criado SOMENTE para
  perfis externos após Auth pronto (perfil+roles carregados); usuários
  internos nunca criam monitor (regressão: RPC nunca chamado). Gate de
  criação via ref — o `refresh()` disparado pela mudança de época alterna
  `loading` e NÃO recria o monitor. Contexto expõe `authzReady`,
  `authzEpoch`, `authzState`, `checkAuthzAccess()` (rechecagem de lease no
  acesso) e `revalidateAuthz()`. `authzReady` é false enquanto perfil/roles
  carregam (sem flash de conteúdo antes de saber se o perfil é externo).
  Epoch change: geração++, cancela/limpa consultas, limpa seleção de portal e
  preferências compartilhadas (evento `portal-client-preferences-cleared`),
  incrementa época reativa e recarrega identidade (perfil/roles coerentes
  antes de voltar). Expire: geração++, cancela consultas, limpa seleção;
  quem ESCONDE os dados é o estado reativo.
- Boundary real `src/components/authz/AuthzEpochBoundary.tsx` integrado aos
  guards existentes (`PortalGuard` em App.tsx e `B2BRouteGuard`) — sem rota
  nem provider paralelo. Pending/expired: conteúdo sensível oculto
  imediatamente com estado amigável e "Tentar novamente". Valid: filhos
  renderizados com `key={authzEpoch}` — mudança de época REMONTA o conteúdo,
  descartando rascunhos, seleções e objectURLs no unmount dos consumidores.
- Hooks integrados: `useStorageAccessScope`, `useSignedUrls` e
  `usePortalCliente` incluem `authzReady` no ready e `authzEpoch` no
  escopo/fence — respostas de época antiga não reabrem; `useScopedPortalQuery`
  e `useMyPartner` herdam pelo scope. Defaults `true`/`0` preservam mocks e
  providers antigos (semântica de gate fechado).

### 5.4 Evidências

- `authzEpochMonitor.test.ts`: 15/15 PASS (fake clock + promises).
- `authzFoundation.integration.test.tsx` (NOVO, AuthProvider real + boundary,
  gate mockado true): 10/10 PASS — pending esconde/exibe; vínculo muda
  mantendo uid/org/role → remount com limpeza de rascunho/objectURL; lease
  expira em aba oculta; offline durante fetch não reabre; resposta atrasada
  não reabre; A→B→A remonta a cada mudança; erro → "Tentar novamente" →
  recupera; foco revalida; revogação sem Broadcast fecha a sessão; usuário
  interno sem monitor e sem RPC.
- Regressões: `src/test/config` 477/479 PASS — as 2 falhas são PRÉ-EXISTENTES
  e não relacionadas (imports legados `@/integrations/supabase/types` em
  EstornoDialog/Categorias/AprovacaoCard/WizardAnexosStep, presentes antes
  desta rodada, flagrados por canonicalTypesGuard e cultivofarm-runtime).
  Guards multiportal 31/31; ClienteDocumentosTab 3/3; F2 dialog intacto.
- Typecheck dedicado (tsgo): 0 erros. Lint dos arquivos novos/alterados:
  0 erros (4 warnings pré-existentes em useAuth.tsx). Build OK;
  `git diff --check` limpo; scanner de segredos OK.

### 5.5 Limites e pendências

- Gate `AUTHZ_CACHE_FOUNDATION_ENABLED` permanece **false**; SQL candidato
  NÃO aplicado; nada publicado; gate de associação fechado.
- Abrir o gate sem a migration instalada é fail-closed (fetcher falha →
  expira → oculta), mas o gate só deve abrir após a migration ser aplicada e
  revisada.
- Anexos/signed URLs de objetos já baixados não são revogáveis — recorte
  seguinte. Troca de principal sem violar `uq_user_clientes_principal` segue
  pendente no modo associação. Cache multidispositivo depende do poll/lease
  (não há revogação instantânea cross-device).
