## Auditoria somente leitura — Portal duplo (multiportal) do AR Bio Manager

Auditoria pura, sem modificação de arquivos. Todas as evidências vêm de leitura de código + suíte de testes já executada nesta sessão.

---

### 1. Superfície técnica que decide portal ativo e perfis múltiplos

**Autenticação e papéis**
- `src/hooks/useAuth.tsx` — carrega `profiles` (1:1) e **todas** as linhas de `user_roles` (sem `.maybeSingle()`), normaliza via `normalizeRoles` e expõe `roles: AppRole[]`, `primaryRole` e `role` (alias legado).
- `src/lib/portalContext.ts` — `normalizeRoles`, `pickPrimaryRole` (ordem determinística), `hasPortalRole`, `PORTAL_CONTEXT_HOME = { b2b: /portal-parceiro/dashboard, technical: /app }`.

**Resolução de portal (server-side)**
- RPC `public.get_my_available_portal_contexts()` → devolve `{available_contexts, default_context, must_select_context, has_b2b_access, has_technical_access, preferred_context, skip_context_selector}`.
- RPC `public.set_my_context_preference(p_context, p_remember)` — grava preferência + log.
- RPC `public.register_my_login_redirect_secure(p_context)` — auditoria.
- Tabelas: `user_roles`, `partner_users`, `partner_accounts`, `partner_user_clients`, `partner_technician_clients`, `user_clientes`, `user_access_preferences`, `user_context_access_logs`.

**Hooks/UX**
- `src/hooks/useAvailableContexts.ts` — React Query (`staleTime 60s`) chamando a RPC. Fonte única de verdade para autorização de portal.
- `src/hooks/useSwitchPortal.ts` — troca B2B ↔ Técnico: cancela/remove queries do portal deixado, limpa `sessionStorage` da família correspondente, confirma se há alterações não salvas, e navega para `/selecionar-portal`.
- `src/lib/activePortalContext.ts` — `sessionStorage` (`active_portal_context`) apenas para UX; declaradamente **não** autoriza.
- `src/lib/portalQueryKeys.ts` — isolamento de chaves (B2B / técnico / global) para evitar vazamento entre portais.

**Rotas**
- `src/App.tsx` — `AuthRoute` (pós-login): admin/gestor/etc. → home admin; `hasPortalRole(roles)` → `/selecionar-portal`; `cliente_produtor` → `/app`; sem role → `/acesso-pendente`.
- `src/pages/SelecionarPortal.tsx` — se 0 contextos → `/acesso-pendente`; se 1 contexto → redireciona direto; se ≥2 → mostra cards; respeita `skip_context_selector + preferred_context`.
- Guards: `B2BRouteGuard`, `TechnicalRouteGuard`, `AppPortalGuard` (todos consultam `useAvailableContexts`), `TechnicalFeatureGuard`, `ProducerFeatureGuard`.
- `src/pages/Index.tsx` — home `/` do painel interno, decide entre `PainelOperacional` e `DashboardAgronomico` por `role` legado.
- `src/pages/app/MobileLayout.tsx` — decide "modo produtor" vs "modo técnico" no PWA usando `roles + has_technical_access + getActivePortalContext()`.
- `src/pages/portal-parceiro/PortalParceiroLayout.tsx` — shell B2B.

---

### 2. Matriz de acesso resultante

Legenda: **AUTH** = pós-login, **/** = home interna, **/app** = PWA técnico/produtor, **/portal-parceiro/** = B2B, **/portal** = portal produtor.

| Perfil | Destino pós-login | Home interna `/` | `/app/*` | `/portal-parceiro/*` | Seletor `/selecionar-portal` | Fonte |
|---|---|---|---|---|---|---|
| `administrador` | `/` | ✔ (PainelOperacional) | ✔ (bypass legado) | ✔ (bypass legado) | não é forçado | `AuthRoute`, guards |
| `gestor` | `/` | ✔ (PainelOperacional) | ✖ (a menos que RPC libere) | ✖ | não | `Index.tsx`, guards |
| `gestor_comercial` | `/` | ✔ (Dashboard) | ✖ | ✔ (bypass "modo suporte") | não | `B2BRouteGuard` |
| `financeiro` / `administrativo` / `producao` / `operador_onfarm` | `/` | ✔ (fallback Dashboard) | ✖ | ✖ | não | `AuthRoute` (ADMIN_HOME_ROLES) |
| `cliente_produtor` (com `profiles.cliente_id`) | `/app` | ✖ (redir `/portal`) | ✔ modo produtor | ✖ | não | `Index.tsx`, `MobileLayout` |
| `cliente_produtor` (sem `cliente_id`) | erro "conta não vinculada" | — | — | — | — | `useAuth` |
| `parceiro_b2b` (com `partner_users` ativo) | `/selecionar-portal` → `b2b` único → `/portal-parceiro/dashboard` | ✖ | ✖ | ✔ | só se >1 contexto | RPC + `SelecionarPortal` |
| `parceiro_b2b` sem `partner_users` ativo | `/acesso-pendente` | ✖ | ✖ | ✖ | 0 contextos | RPC |
| `parceiro_b2b_tecnico` (com partner ativo) | `/portal-parceiro/dashboard` (contexto único b2b) | ✖ | ✖ | ✔ | não | RPC (papel só habilita b2b) |
| `consultor_tecnico` | `/app` | ✖ | ✔ | ✖ | não | RPC |
| `tecnico_agronomo` / `aplicador` | `/app` | ✖ | ✔ | ✖ | não | RPC |
| **`parceiro_b2b` + `consultor_tecnico`** (partner ativo) | `/selecionar-portal` (2 opções) | ✖ | ✔ (Técnico) | ✔ (B2B) | **sim** | validado E2E |
| **`parceiro_b2b_tecnico` + `consultor_tecnico`** | `/selecionar-portal` (2 opções) | ✖ | ✔ | ✔ | sim | RPC |
| **`administrador` + qualquer** | `/` (admin vence) | ✔ | ✔ | ✔ | não é forçado | `pickPrimaryRole` |
| **`gestor_comercial` + `parceiro_b2b`** | `/` (gestor_comercial vence) | ✔ | ✖ | ✔ | não | `pickPrimaryRole` |
| **`cliente_produtor` + `consultor_tecnico`** | `/app` (produtor) | ✖ | ✔ produtor OU técnico via contexto ativo | ✖ | não | `MobileLayout`, RPC |
| Sem papel algum | `/acesso-pendente` | — | — | — | — | `AuthRoute` |

Observações importantes:
- Autorização real é feita pela RPC + RLS. `active_portal_context` no `sessionStorage` só afeta UX do PWA (tabs mostradas) e nunca concede acesso.
- `administrador` faz "bypass legado" em `B2BRouteGuard`, `TechnicalRouteGuard` e `AppPortalGuard` — intencional para suporte, mas amplifica risco (ver §6).
- Combinação `parceiro_b2b` + `parceiro_b2b_tecnico` é bloqueada pela UI de Configurações (mutuamente exclusivas) mas nada impede via SQL.

---

### 3. Usuários cadastrados para teste

Não foi possível listar via `psql` nesta sessão (`PGHOST` ausente; a connection string usada anteriormente não persiste entre turnos). A partir do histórico verificado desta conversa, existem pelo menos:

| E-mail | Papéis | Vínculos |
|---|---|---|
| `admin@arbio.com` | `administrador` | — |
| `duplo@arbio.com` | `parceiro_b2b` + `consultor_tecnico` | vinculado a um `partner_accounts` ativo (usuário de teste do portal duplo) |

Senhas/tokens **não** são exibidos por política. Para inventário completo (todos os e-mails × roles × parceiros) é necessário reautorizar acesso ao Postgres (connection string ou "Read database" no Cloud) — trato disso na Fase 0 do plano de correções.

---

### 4. Suíte de validação executada nesta auditoria

- `bun run typecheck` → **exit 0**.
- `bun run build` → **exit 0** (Vite + PWA, 18 entradas em precache).
- `bun run test` (Vitest completo) → **30 arquivos / 264 testes / 0 falhas**, tempo ~14,7 s.

---

### 5. Cobertura automatizada de cenários exigidos

| Cenário | Cobertura atual | Onde |
|---|---|---|
| Seletor de portal — renderização com 2 contextos | Parcial (contract em `useAvailableContexts` + guards) | `multiportal.guards.test.tsx`, `multiportal.foundation.test.ts` |
| Persistência após reload (`skip_context_selector` + `preferred_context`) | **Ausente** (nenhum teste cobre o efeito de auto-redirect quando marcado "lembrar") | — |
| Acesso direto por URL (`/portal-parceiro/*` como técnico puro, `/app/*` como B2B puro) | Coberto para B2B/Técnico/AppPortal guards | `multiportal.guards.test.tsx`, `multiportal.featureGuards.test.tsx` |
| Logout / login (troca de conta limpa `active_portal_context`) | **Ausente** — só há chamada `clearActivePortalContext` no `signOut`; não há teste |
| Portal padrão (`default_context`) | Parcial: RPC é mockada, mas o comportamento "1 contexto → redireciona direto" não tem teste dedicado |
| Usuário com 1 perfil | Coberto indiretamente pelos guards | idem |
| Usuário com 2+ perfis | **Ausente** — não há teste E2E/UI do `SelecionarPortal.tsx` renderizando 2 cards nem do `useSwitchPortal` |
| `useSwitchPortal` (cancel/remove queries, sessionStorage, navigate) | **Ausente** |
| `AuthRoute` (matriz de destinos pós-login) | **Ausente** como teste dedicado (apenas `pickPrimaryRole`) |

---

### 6. Riscos identificados

**Segurança / RLS**
1. `administrador` bypass em `B2BRouteGuard`/`TechnicalRouteGuard`/`AppPortalGuard` é aceitável, mas **`gestor_comercial` também bypassa `has_b2b_access` no B2BRouteGuard** — se a intenção for "modo suporte", precisa ser combinado com trilha de auditoria explícita a cada acesso (hoje só há `logAccessDeniedOnce`).
2. `TechnicalRouteGuard` usa `role === "administrador"` (papel primário) em vez de `roles.includes("administrador")` — inconsistente com os outros guards; se um administrador tiver combinação incomum, `primaryRole` pode não ser `administrador` (embora `ROLE_PRIORITY` o coloque em 1º, é fragilidade evitável).
3. `getActivePortalContext()` no `MobileLayout` decide qual tab mostrar antes de o `useAvailableContexts` resolver — em rota nova sem passar pelo seletor, um usuário `cliente_produtor + consultor_tecnico` cai em "técnico" por default (`!activeCtx && !isProdutor && hasTechnical`), o que **é o oposto** do esperado quando o usuário chegou de `/portal` → `/app` sem seletor.
4. Cache do React Query (`staleTime 60s`) para `useAvailableContexts`: se um admin alterar papéis do usuário logado, ele opera por até 60s no portal errado. Não é vazamento de dados (RLS ainda barra), mas gera "erros silenciosos" na UI.
5. `set_my_context_preference` e `get_my_available_portal_contexts` são invocadas sem `SECURITY DEFINER` verificado nesta auditoria estática (RPC não foi lida) — precisa ser conferido para garantir que preferência sempre é escrita para `auth.uid()` e não para um id spoofado.

**Loops de redirect / estado**
6. `SelecionarPortal` faz `setActivePortalContext(only) → registerLoginRedirect(only) → navigate(...)` num `useEffect` dependente de `data`. Se `useAvailableContexts` refetch retornar `available_contexts=[]` num flash, o usuário é jogado em `/acesso-pendente` mesmo tendo acesso real — não há debounce nem tolerância a erro transitório.
7. `AuthRoute` → `hasPortalRole(roles)` cobre técnicos internos (`tecnico_agronomo`, `aplicador`, `consultor_tecnico`) e força TODOS a passar pelo `/selecionar-portal`. Para um técnico sem B2B, isso resulta em 1-contexto e redirect imediato — funcional, mas adiciona um hop extra desnecessário (custo de UX + telemetria falsa "context_selected").
8. Após `signOut`, `clearActivePortalContext` limpa `sessionStorage` mas o cache de `useAvailableContexts` do React Query permanece pela chave `user?.id` — como o user muda para `null`, o `enabled: !!user?.id` para o novo login volta correto, mas se o mesmo user relogar rápido, dados de outra sessão podem servir 1 render.

**Vazamento entre portais**
9. `useSwitchPortal` limpa **apenas** chaves do portal deixado. Chaves que existem em ambos os portais (e.g. `["profile"]`, `["notifications"]`) não são invalidadas — depende do rigor da nomenclatura em `portalQueryKeys.ts`. `useAuth` **não** faz refetch de `profile` na troca de contexto.
10. `sessionStorage` `active_portal_context` sobrevive entre abas com mesma sessão. Duas abas do mesmo usuário em portais diferentes vão sobrescrever o contexto uma da outra a cada `setActivePortalContext`.

**Mobile**
11. `MobileLayout` semeia contexto no `useEffect` sem `queryClient.invalidateQueries` — usuário com dois papéis que muda "modo" pelo seletor não vê tabs novas até refetch/refresh.
12. Sem detecção de `standalone`/PWA, o mesmo layout serve mobile + desktop. Não há teste de viewport que garanta os tabs mobile.

**Inconsistências**
13. `Index.tsx` ainda decide home por `role` (papel primário) e trata `consultor_tecnico` renderizando `DashboardAgronomico` internamente, embora o fluxo oficial mande esse papel para `/app`. Só é acessível se o técnico digitar `/` na URL, mas gera "portal errado" — deveria redirecionar para `/app`.
14. Documentação (`docs/multiportal-arquitetura-fase2.md` §3) diz que produtor vai para `/portal`, mas `AuthRoute`/`Index.tsx` mandam produtor para `/app` (mobile). Divergência ainda não reconciliada.
15. `AppPortalGuard` libera `cliente_produtor` sem consultar RPC; `MobileLayout` também. Isso é OK contanto que RLS de `/app/*` continue barrando (é, mas depende de cada componente respeitar o "modo produtor" — atualmente `MobileLayout` decide pelo `isProducerMode` derivado, que pode virar `false` se `activeCtx==="technical"` for injetado maliciosamente por outra aba).

---

### 7. Correções mínimas priorizadas (sem implementar)

**P0 — segurança e correção funcional**

- **C1.** `TechnicalRouteGuard`: trocar `role === "administrador"` por `roles.includes("administrador")` para alinhar aos demais guards.
- **C2.** `Index.tsx`: quando `roles` contém papel técnico e não contém admin/gestor, redirecionar para `/app` em vez de renderizar `DashboardAgronomico` inline (evita "portal errado" via URL direta).
- **C3.** `SelecionarPortal.useEffect`: tratar `available_contexts=[]` como estado transitório se `isFetching` — só redirecionar para `/acesso-pendente` quando o refetch confirmar. Evita flash pós-login.
- **C4.** Confirmar `SECURITY DEFINER` e `search_path` de `get_my_available_portal_contexts`, `set_my_context_preference`, `register_my_login_redirect_secure`. Se alguma faltar, planejar migration aditiva.

**P1 — consistência de estado**

- **C5.** `useSwitchPortal`: após limpar queries, chamar `queryClient.invalidateQueries({ queryKey: ["available-portal-contexts"] })` + refetch de `profile` para evitar dados "presos".
- **C6.** `MobileLayout`: nunca honrar `activeCtx === "technical"` se `roles.includes("cliente_produtor") && !roles.some(r=>PORTAL_ROLES técnicos)` — remove risco 11/15.
- **C7.** Sincronizar `active_portal_context` entre abas via `BroadcastChannel` ou storage-event, ou trocar para chave por-aba efêmera.
- **C8.** `useAvailableContexts`: reduzir `staleTime` para 5 s **ou** invalidar em `auth.onAuthStateChange` (`USER_UPDATED`, `TOKEN_REFRESHED`).

**P2 — cobertura de testes**

- **C9.** Adicionar suíte `SelecionarPortal.test.tsx`: 1 contexto → auto-redirect; 0 contextos → `/acesso-pendente`; 2 contextos → 2 cards visíveis; clique chama RPC e navega; `skip_context_selector + preferred_context` pula seletor.
- **C10.** Adicionar suíte `useSwitchPortal.test.ts`: cancel/remove por família, sessionStorage limpo do portal correto, navigate para `/selecionar-portal`, respeita `hasUnsavedChanges`.
- **C11.** Adicionar suíte `AuthRoute.test.tsx`: matriz completa da §2 (admin, gestor_comercial+b2b, cliente_produtor, técnico puro, B2B puro, dupla, sem role).
- **C12.** Teste de reload/persistência: com `skip_context_selector=true`, montar `SelecionarPortal` e assertar redirect imediato para `preferred_context`.
- **C13.** Teste de logout: chamar `signOut`, verificar `clearActivePortalContext` e reset de `roles` no contexto.

**P3 — inventário e documentação**

- **C14.** Fase 0: reautorizar acesso Postgres (connection string ou "Read database" no Cloud) para gerar inventário completo de usuários × roles × parceiros e anexar ao relatório de auditoria. Sem senhas/segredos.
- **C15.** Reconciliar `docs/multiportal-arquitetura-fase2.md` com o comportamento real (produtor → `/app`, não `/portal`).
- **C16.** Adicionar seção "matriz de acesso" (§2 deste plano) ao `docs/` para servir como fonte única.

Cada correção é isolada; pode ser aplicada em blocos independentes. Aguardando autorização explícita antes de qualquer alteração.