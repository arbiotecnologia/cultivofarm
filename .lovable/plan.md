## Diagnóstico

O admin `admin@arbio.com` (roles `administrador` + `administrativo`) está preso em `/acesso-pendente`, mas o mapa de permissões dá acesso total ao `administrador` e sua Home deveria ser `/`.

**Causa raiz (confirmada por leitura de `src/hooks/useAuth.tsx` + `src/App.tsx`):**

No login, `supabase.auth.onAuthStateChange` dispara e faz:
```
setSession(session); setUser(session.user); fetchProfileAndRole(user.id);  // sem await
```
`fetchProfileAndRole` é assíncrono e só faz `setLoading(false)` no fim. Porém, antes do login, `loading` já foi zerado por `checkInitialSession` (sessão inicial vazia). Como o callback do listener **não** faz `setLoading(true)`, o `AuthRoute` renderiza imediatamente com `user=truthy`, `loading=false`, mas `primaryRole=null` (roles ainda buscando).

Sequência no `AuthRoute` (App.tsx:290-320):
1. `primaryRole` ∉ `ADMIN_HOME_ROLES` (é null) → pula.
2. `hasPortalRole(roles)` = false (roles=[]) → pula.
3. `primaryRole === "cliente_produtor"` → não.
4. `primaryRole` truthy → não.
5. **Fallback**: `<Navigate to="/acesso-pendente" replace />` ← executa aqui.

Uma vez em `/acesso-pendente`, `AcessoPendente` chama `useAvailableContexts` (RPC `get_my_available_portal_contexts`) que retorna `available_contexts=[]` para admin (admin não é `b2b` nem `technical`), então nada redireciona e a página fica exibida — mesmo depois de `roles` carregar com `administrador`.

## Correção

**Arquivo:** `src/hooks/useAuth.tsx` — 2 edições mínimas, sem alterar arquitetura, rotas ou regras de negócio.

1. No callback de `onAuthStateChange`, quando há `session.user`, chamar `setLoading(true)` antes de disparar `fetchProfileAndRole`. Isso mantém `AuthRoute` no spinner "Autenticando..." até roles resolverem, evitando o fallback prematuro para `/acesso-pendente`.

2. Também no callback, quando há user, limpar `setError(null)` para descartar erro residual antes da nova busca.

Diff conceitual:
```ts
if (session?.user) {
  setLoading(true);
  setError(null);
  fetchProfileAndRole(session.user.id);
} else { ... }
```

## Validação

1. `bun run typecheck` + `bun run build`.
2. Playwright: login com `admin@arbio.com` / `Bio#2026`, aguardar redirect, esperar URL **≠** `/auth` e **≠** `/acesso-pendente`. Screenshot da home admin (`/`).
3. Recarregar `/acesso-pendente` manualmente logado como admin → deve permanecer lá (rota é válida por si só; sem regressão de auto-redirect indesejado).

## Fora do escopo (não alterar agora)

- Não mexer em `useAvailableContexts`, RPC do banco, guards, ou fluxo multiportal.
- Não alterar `AcessoPendente` (comportamento correto para roles sem portal operacional).
- Não criar migrations nem edge functions.