
# Acesso duplo: Portal Parceiro + Portal Técnico

## Contexto atual (verificado)

A infraestrutura multiportal **já existe**:

- RPC `public.get_my_available_portal_contexts()` retorna `has_b2b_access` (papel `parceiro_b2b`/`parceiro_b2b_tecnico` + vínculo ativo em `partner_users`) e `has_technical_access` (papel `tecnico_agronomo`/`consultor_tecnico`/`aplicador`).
- Tela `/selecionar-portal` (`src/pages/SelecionarPortal.tsx`) já mostra os dois cards e persiste preferência via `set_my_context_preference`.
- Guards `B2BRouteGuard` e `TechnicalRouteGuard` já autorizam por contexto (não por role).
- Hook `useSwitchPortal()` já limpa cache do contexto atual e volta para `/selecionar-portal`.
- `PORTAL_CONTEXT_HOME`: b2b → `/portal-parceiro/dashboard`, technical → `/app`.

Ou seja: **um usuário com `parceiro_b2b` + `consultor_tecnico` já veria o seletor**. Falta (1) UI para atribuir os dois papéis, (2) botão de troca visível dentro de cada portal, (3) garantir que o roteamento pós-login respeite o seletor mesmo para usuários com esses papéis mistos.

Nada de novas rotas nem duplicação de páginas — apenas reaproveita `/portal-parceiro/*` e `/app/*`.

## Escopo

### 1. UI de atribuição de papéis (Configurações → Usuários)

Ajustar a tela de cadastro/edição de usuários em `src/pages/configuracoes/` (formulário existente) para:

- Substituir seleção única de role por checkboxes/multi-select das roles do enum `app_role`.
- Permitir marcar simultaneamente `parceiro_b2b` (ou `parceiro_b2b_tecnico`) **e** `consultor_tecnico` (ou `tecnico_agronomo`).
- Quando `parceiro_b2b*` estiver marcado, mostrar seletor obrigatório de parceiro (grava em `partner_users`).
- Salvar via `user_roles` (uma linha por role) preservando a estrutura já existente. Nenhuma alteração de schema — a tabela `user_roles` já é multi-role (`unique(user_id, role)`).
- Validação client-side: pelo menos uma role; parceiro exige vínculo; consultor não pode ser combinado com `cliente_produtor`.

### 2. Botão “Trocar portal” em ambos os portais

- **Portal Técnico** (`src/pages/app/MobileLayout.tsx`): adicionar item no menu de perfil (`/app/perfil`) “Trocar de portal” chamando `useSwitchPortal()`. Só aparece se `contexts.available_contexts.length >= 2`.
- **Portal B2B** (`src/components/portal-parceiro/PartnerLayout.tsx` ou header equivalente): adicionar botão/menu-item “Trocar de portal” idêntico. Só aparece com 2+ contextos.
- Reutilizar o hook `useSwitchPortal` — sem mudanças.

### 3. Roteamento pós-login

- Confirmar/ajustar `src/App.tsx` (linha ~309, redirect pós-login) para: se `must_select_context` → `/selecionar-portal`; se `skip_context_selector` e `preferred_context` válido → home do contexto preferido. A lógica já existe em `SelecionarPortal`, apenas garantir que os papéis mistos caiam nesse mesmo fluxo (não em redirect legado por `role`).
- Ajustar `src/pages/Index.tsx` para, quando o usuário tem `available_contexts.length >= 2`, redirecionar para `/selecionar-portal` em vez de escolher dashboard por `role`.

### 4. Sem novas migrations

RPC e tabelas atuais (`user_roles`, `partner_users`, `user_access_preferences`) já suportam o cenário. Nada a migrar.

### 5. Testes

- Estender `src/test/multiportal.foundation.test.ts` e `multiportal.guards.test.tsx` com caso `parceiro_b2b + consultor_tecnico` → espera `available_contexts = ['b2b','technical']`, `must_select_context = true`.
- Vitest da tela de usuários: gravação e leitura de múltiplas roles.

## Detalhes técnicos

### Arquivos a alterar

| Arquivo | Mudança |
|---|---|
| `src/pages/configuracoes/UsuariosConfig.tsx` (e form associado) | Multi-role + seletor de parceiro condicional |
| `src/pages/Index.tsx` | Redirecionar para `/selecionar-portal` quando 2+ contextos |
| `src/App.tsx` (redirect pós-login) | Idem, se ainda não coberto |
| `src/pages/app/perfil/*` (Portal Técnico) | Item “Trocar de portal” |
| `src/components/portal-parceiro/PartnerLayout.tsx` | Item “Trocar de portal” |
| `src/test/multiportal.*.test.*` | Novos casos de teste |

### O que **não** muda

- Enum `app_role`, `user_roles`, `partner_users`, `partner_accounts`, RPCs multiportal.
- Rotas `/portal-parceiro/*` e `/app/*` — nenhuma duplicação.
- `useAuth` e cálculo de `role` primário (mantido para telas legadas).

## Validação

1. `bun run typecheck` + `bun run build`.
2. Vitest completo.
3. Playwright: login com usuário parceiro+consultor → ver seletor → escolher B2B → trocar para técnico via botão → voltar sem logout.
