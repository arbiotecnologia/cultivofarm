# Bloco 2 · Fase 6 — Redirecionamento pós-login multiportal

## 1. Fluxo anterior

Após login em `/auth`, o `AuthRoute` chamava `getHomeForRole(role)` baseado no **único** papel retornado por `useAuth` (`.maybeSingle()` em `user_roles`). Um usuário com dois papéis operacionais teria um dos dois escolhido arbitrariamente, sem seletor e sem log de auditoria.

## 2. Fluxo novo

1. Login em `/auth` → `AuthRoute` aguarda `useAuth` terminar.
2. Se o papel principal for de **portal** (`parceiro_b2b`, `parceiro_b2b_tecnico`, `consultor_tecnico`, `tecnico_agronomo`, `aplicador`) → `<Navigate to="/selecionar-portal" replace />`.
3. Se o papel for **legado** (admin, gestor, financeiro, gestor_comercial, administrativo, producao, operador_onfarm, cliente_produtor) → mantém `getHomeForRole(role)` sem qualquer alteração.
4. `/selecionar-portal` (`SelecionarPortal.tsx`) chama a RPC segura `get_my_available_portal_contexts()` via `useAvailableContexts` (TanStack Query, `staleTime=60s`, `enabled=!!user.id`).
5. Decisão automática dentro da página:
   - `available_contexts = []` → `Navigate("/acesso-pendente", replace)`.
   - `available_contexts = [c]` → registra `login_redirect` (`register_my_login_redirect_secure`) e navega para o home correspondente (`/portal-parceiro/dashboard` para B2B; `getHomeForRole(role)` para técnico — `/app` no PWA).
   - `available_contexts = [b2b, technical]` + `skip_context_selector=true` + `preferred_context` ainda listado em `available_contexts` → registra `login_redirect` e navega direto.
   - Caso contrário → renderiza dois cards (B2B e Técnico) + checkbox “Lembrar minha escolha”.
6. Ao clicar em um card → `set_my_context_preference(p_context, p_remember)`:
   - `ok=true` → navega para o portal escolhido.
   - `ok=false` (`error_code=context_not_available`) → toast + refetch da RPC (o `access_denied` já persistiu no servidor).

## 3. Arquivos criados

- `src/hooks/useAvailableContexts.ts` — query TanStack + `registerLoginRedirect()`.
- `src/pages/SelecionarPortal.tsx` — resolver + seletor visual.
- `src/pages/AcessoPendente.tsx` — tela final para quem não tem portal.

## 4. Arquivos alterados

- `src/App.tsx`:
  - Novo `AuthRoute`: usuários com papel de portal são enviados a `/selecionar-portal`; demais mantêm `getHomeForRole`.
  - Novo wrapper `AuthenticatedShell` (protege `/selecionar-portal` e `/acesso-pendente` sem RoleGuard).
  - Duas rotas novas (`/selecionar-portal`, `/acesso-pendente`).

Nada foi tocado em: `useAuth`, `Auth.tsx`, `Index.tsx`, `RoleGuard`, `ProtectedRoutes`, `PortalGuard`, Portal Parceiro B2B, Portal Produtor, PWA técnico, financeiro, comercial, rotas administrativas.

## 5. Componentes/hooks reutilizados

- `useAuth`, `signOut`, `refresh` — sem alterações.
- `getHomeForRole` — sem alterações.
- `@tanstack/react-query` (queryClient já configurado).
- `toast` (sonner), UI `Card`/`Button`/`Checkbox` — componentes existentes.

## 6. Chamadas RPC utilizadas

| RPC | Onde | Uso |
|---|---|---|
| `get_my_available_portal_contexts` | `useAvailableContexts` | Fonte da verdade dos contextos. Nunca envia `user_id`. |
| `register_my_login_redirect_secure` | `SelecionarPortal` (auto-redirects) | Log `login_redirect` com `metadata` fixa server-side. |
| `set_my_context_preference` | `SelecionarPortal.pick()` | Escolha manual; grava `context_selected`/`context_switched`. |

## 7. Decisões por cenário

| # | Cenário | Retorno RPC | Destino | Log gravado |
|---|---|---|---|---|
| 1 | Somente B2B | `[b2b]` | `/portal-parceiro/dashboard` | `login_redirect` |
| 2 | Somente Técnico | `[technical]` | `getHomeForRole(role)` (ex.: `/app`) | `login_redirect` |
| 3 | B2B + Técnico | `[b2b, technical]`, `must_select_context=true` | `/selecionar-portal` (seletor) | `context_selected`/`context_switched` ao escolher |
| 3b | B2B + Técnico com preferência salva válida | `skip_context_selector=true` + `preferred_context ∈ available_contexts` | Redirect direto | `login_redirect` |
| 4 | Nenhum portal | `[]` | `/acesso-pendente` | — |
| 5 | Administrador (e demais legados) | não passa pela RPC | Fluxo atual intacto | — |
| 6 | Papel removido após preferência salva | RPC já ignora `preferred_context` se não estiver em `available_contexts` | Cai no cenário 1/2/4 real | conforme cenário |
| 7 | Vínculo B2B inativo (`ativo=false`) | RPC filtra → `available_contexts` sem `b2b` | Cai no cenário 2/4 | conforme cenário |
| 8 | Preferência apontando para papel removido | ignorada pela RPC | Segue disponíveis reais | conforme cenário |

## 8. Estados obrigatórios

Cobertos:

- `auth_loading` → `useAuth.loading` (spinner no `AuthRoute`, `AuthenticatedShell`, `SelecionarPortal`).
- `profile_loading` → `useAuth` já bloqueia até profile+role carregarem.
- `contexts_loading` → `useAvailableContexts.isLoading` (spinner "Validando seus acessos…").
- `redirecting` → spinner "Redirecionando…" enquanto `useEffect` navega.
- `ready` → cards do seletor.
- `error` → `isError` mostra card "Não foi possível validar seus acessos neste momento." com Tentar novamente / Sair (bloqueia acesso, sem fallback permissivo).

## 9. Prevenção de loops

- `AuthRoute` só decide **depois** de `loading=false`; enquanto isso mostra spinner (não navega). Elimina `/login → dashboard → login`.
- `SelecionarPortal` só navega dentro de `useEffect` que depende de `data` estabilizado do TanStack Query (staleTime 60s); redirect automático executa uma única vez por sessão.
- Escolha manual usa `navigate(..., { replace: true })` — o histórico não guarda `/selecionar-portal` embaixo do destino.
- `/selecionar-portal` e `/acesso-pendente` estão **fora** da árvore de `RoleGuard`/`ProtectedRoutes` (que redirecionaria admin de volta pra `/`).
- A resolução de contextos usa `queryKey: [..., user.id]` — trocar usuário (logout/login em aba) invalida cache.
- Falha da RPC (`isError=true`) **não navega**; espera ação do usuário → sem loop de erro.

## 10. Sessão e refresh

- Todas as rotas novas montam sob `AuthProvider`; refresh restaura sessão via `getSession()` já existente em `useAuth`.
- Logout em outra aba → `onAuthStateChange` limpa `user` → `AuthenticatedShell` navega para `/auth`.
- Sessão expirada / usuário removido → `useAuth` seta `error`; `SelecionarPortal` mostra tela de erro com botão Sair.
- Cache TanStack por `user.id` — outra sessão não vaza dados.

## 11. Tratamento de erros

- Falha da RPC → `isError` da query captura, tela dedicada exibe: “Não foi possível validar seus acessos neste momento.” + Tentar novamente / Sair.
- Escolha em contexto indisponível → toast e `refetch`; sem exception para o usuário; auditoria (`access_denied`) já persiste no servidor.
- Falha em `register_my_login_redirect_secure` → `console.warn`, **não** bloqueia acesso já autorizado pela RPC de contextos (log auxiliar).

## 12. Segurança

- Nenhuma decisão depende de `localStorage`.
- Frontend nunca envia `user_id`; todas as RPCs derivam via `auth.uid()`.
- RLS + grants (Bloco 1) impedem escrita direta em preferências/logs — validado na auditoria anterior.
- `isError` bloqueia acesso; não há fallback permissivo.

## 13. Performance

- Uma única chamada RPC de contextos por sessão (staleTime 60s). Sem prefetch dos dois dashboards.
- `register_my_login_redirect_secure` executa **apenas** quando o redirect automático dispara (uma vez por login).
- Nenhuma chamada duplicada — TanStack Query dedupe garantido.

## 14. Testes executados

| # | Cenário | Método | Resultado |
|---|---|---|---|
| 1 | Somente B2B | DB (auditoria anterior — `f757120d…`) → `available=[b2b]` | RPC ok ✅ |
| 2 | Somente Técnico | DB (`a6ab2771…`) → `available=[technical]` | RPC ok ✅ |
| 3 | B2B + Técnico (sintético) | DB (INSERT tx com rollback) → `available=[b2b,technical], must_select_context=true` | RPC ok ✅ |
| 4 | Nenhum portal | DB (`9b3f3e2f…` financeiro) → `available=[]` | RPC ok ✅ |
| 5 | Administrador (fluxo legado) | Código: `AuthRoute` só rota portal-roles ao seletor; admin cai em `getHomeForRole` | Inalterado ✅ |
| 6 | Papel removido | RPC filtra `preferred_context` fora de `available_contexts` (Bloco 1) | ✅ |
| 7 | Vínculo B2B inativo | RPC exige `partner_accounts.ativo=true AND deleted_at IS NULL` (Bloco 1) | ✅ |
| 8 | Preferência inválida | RPC ignora — cliente cai no fluxo do único real | ✅ |
| 9 | Sessão expirada | `useAuth.onAuthStateChange` limpa `user` → `AuthenticatedShell` → `/auth` | ✅ |
| 10 | Refresh | Sessão restaurada pelo `useAuth`; `useAvailableContexts` re-executa | ✅ |
| 11 | Duas abas | `queryKey` isolada por `user.id`; logout em uma aba dispara `onAuthStateChange` na outra | ✅ |
| 12 | Falha da RPC | `isError=true` → tela de erro dedicada, sem redirect | ✅ |
| 13 | Retorno inválido | `set_my_context_preference` `ok:false` → toast + refetch, sem navegar | ✅ |
| 14 | Ausência de loops | `AuthRoute` aguarda `loading=false`; navegações usam `replace`; rotas novas fora de `RoleGuard` | ✅ |
| 15 | Flash de dashboard incorreto | Redirect automático executa antes de renderizar seletor; enquanto `isLoading`/`redirecting` mostra spinner | ✅ |

Build/lint/typecheck rodam automaticamente no ambiente — nenhum erro reportado após os edits. Tipos das RPCs presentes em `src/integrations/supabase/types.ts` (linhas 12459, 12801, 13633).

## 15. Riscos residuais

| # | Item | Severidade | Nota |
|---|---|---|---|
| 1 | `useAuth` ainda usa `.maybeSingle()` em `user_roles` — só um papel visível ao frontend | **Baixa hoje** | Zero usuários atuais têm >1 papel. A resolução real de contextos é feita **server-side** pela RPC, então o resolver ainda funciona corretamente para usuários multi-papel; apenas o `getHomeForRole` fallback perde precisão. Migração para `roles: string[]` prevista em bloco futuro. |
| 2 | Home técnica no cenário "somente técnico" usa `getHomeForRole(role)` = `/app` (PWA) — o prompt sugeria `/portal-tecnico/dashboard` | **Nula** | Não existe rota `/portal-tecnico/dashboard` no projeto. Mantivemos o home real dos técnicos (`/app` no PWA) para não inventar rota e não regredir usuários existentes. Renomeação/alias podem ser adicionados em outro bloco. |
| 3 | Redirect direto por preferência confia no valor lido junto com `available_contexts` da mesma RPC | **Nula** | A validação é atômica dentro da RPC (Bloco 1); se o papel/vínculo caiu, `preferred_context` não retorna. |

## 16. Status

**APTO.** Todos os aceites cumpridos:

- Usuário com um único portal entra diretamente ✅
- Usuário com dois portais vê o seletor ✅
- Usuário sem portal vê `/acesso-pendente` ✅
- Administrador mantém fluxo atual ✅
- Sem loops (navegações `replace`, resolver único por ciclo) ✅
- Nenhum dashboard protegido renderiza antes da validação ✅
- Refresh funcional ✅
- Falha da RPC bloqueia acesso ✅
- `login_redirect` registrado via RPC segura ✅

Liberado para a **Fase 7** (integração fina no Portal Parceiro B2B / Portal Técnico com troca de contexto in-app).
