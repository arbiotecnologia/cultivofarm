## Objetivo

Garantir que o usuário `administrador` acesse todo o sistema sem passar pelo seletor de portal nem cair em `/acesso-pendente`, independentemente do caminho de entrada (login, deep link, troca de portal, cache antigo).

## Diagnóstico

- `AuthRoute` (`src/App.tsx`) já redireciona admin para `getHomeForRole("administrador")`. OK.
- Porém `/selecionar-portal` e `/acesso-pendente` **não têm bypass para admin**. Se o admin cair nessas rotas (deep link, `useSwitchPortal`, refresh após um estado antigo), o `SelecionarPortal` chama a RPC de contextos — que para admin retorna `available_contexts = []` — e o efeito manda para `/acesso-pendente`. Foi exatamente o estado atual (`/acesso-pendente`).
- `AppPortalGuard` já libera admin corretamente; não precisa mexer.

## Mudanças (apenas UI/roteamento, sem backend)

### 1. `src/pages/SelecionarPortal.tsx`
- Adicionar, logo após obter `roles` do `useAuth`, um `useEffect` (ou early-return) que, se `roles.includes("administrador")`, faça `navigate(getHomeForRole("administrador"), { replace: true })` antes de qualquer redirecionamento baseado na RPC. Isso impede o pulo para `/acesso-pendente` quando a RPC devolve contextos vazios para admin.

### 2. `src/pages/AcessoPendente.tsx`
- Mesmo bypass: se `roles.includes("administrador")`, redirecionar para `getHomeForRole("administrador")` imediatamente (evita a tela travada em "Acesso pendente" caso o admin caia lá por qualquer motivo).

### 3. (Defensivo) `src/hooks/useSwitchPortal.ts`
- No início do callback, se o usuário for admin, apenas navegar para `getHomeForRole("administrador")` em vez de `/selecionar-portal`. Mantém a troca funcionando para B2B/Técnico e evita empurrar admin ao seletor.

Nada mais é alterado: RPCs, migrations, guards de `/app` e `/portal-parceiro`, permissões e demais roles seguem inalterados.

## Validação

- `tsgo` + `bun run build`.
- Fluxo manual (Playwright) com `admin@arbio.com`:
  1. Login → cai direto em `/dashboard/geral`.
  2. Navegar manualmente para `/selecionar-portal` → redireciona para `/dashboard/geral`.
  3. Navegar para `/acesso-pendente` → redireciona para `/dashboard/geral`.
- Vitest da suíte `src/test/comunicacao` continua 273/273 (não depende dessas telas).

## Fora de escopo

- Nenhuma alteração em RPCs, RLS, Edge Functions, migrations ou banco (staging/produção intocados).
- Comportamento de `cliente_produtor`, `parceiro_b2b*`, `tecnico_agronomo` etc. permanece idêntico.
