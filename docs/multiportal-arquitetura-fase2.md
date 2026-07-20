# FASE 2 — Arquitetura do acesso multiportal

> Base decidida na Fase 1: reutilizar `user_roles` (já suporta múltiplos papéis via `UNIQUE(user_id, role)`), reutilizar valores existentes do enum `app_role`, contexto de portal é apenas UX (autorização sempre server-side).

---

## 1. Modelo escolhido

```
auth.users (1)
   │
   ├── public.profiles                       (1:1  — dados de exibição)
   ├── public.user_roles                     (1:N  — papéis ativos)
   ├── public.partner_users                  (0:N  — vínculo B2B + papel gestor/tecnico)
   ├── public.partner_user_clients           (0:N  — escopo de clientes do parceiro)
   ├── public.partner_technician_clients     (0:N  — técnico de parceiro → clientes)
   ├── public.user_clientes                  (0:N  — consultor interno → clientes)
   │
   ├── public.user_access_preferences        (1:1  — NOVO, contexto preferido)
   └── public.user_context_access_logs       (1:N  — NOVO, auditoria de escolha de contexto)
```

Separação obrigatória:
- **Usuário autenticado** = `auth.uid()`
- **Papéis atribuídos** = linhas em `user_roles` (múltiplas)
- **Vínculos operacionais** = `partner_users`, `user_clientes`, etc.
- **Contexto de navegação ativo** = preferência (UX), **não** autoriza nada

---

## 2. Regras arquiteturais

1. Um único `auth.uid()` por pessoa. Proibido criar contas paralelas para "acessar o outro portal".
2. Um único `profiles` por usuário.
3. Múltiplos papéis permitidos (linhas em `user_roles`).
4. Múltiplos vínculos permitidos (parceiro + clientes internos simultaneamente).
5. **Contexto ativo não concede autorização.** Todas as RLS continuam por `has_role`/`EXISTS partner_users`/`EXISTS user_clientes`.
6. `localStorage` pode espelhar a preferência (chave `arbio.portal_context`), mas nunca é consultado para decidir permissões — o servidor decide.
7. Rotas continuam validando por role/vínculo via `RoleGuard` e RLS.
8. Modelo legado (`user_roles` atual) **não é substituído**; apenas passa a ser lido como array no frontend.
9. Compatibilidade retroativa: se o usuário tem exatamente 1 contexto disponível, o comportamento pós-login é **idêntico** ao de hoje (redirect direto, sem seletor).

---

## 3. Mapeamento de contextos

| Contexto | Habilitado quando |
|---|---|
| `b2b` | `EXISTS user_roles WHERE role IN ('parceiro_b2b','parceiro_b2b_tecnico')` **E** `EXISTS partner_users pu JOIN partner_accounts pa ON pa.id = pu.partner_id WHERE pu.user_id = auth.uid() AND pa.ativo = true AND pa.deleted_at IS NULL` |
| `technical` | `EXISTS user_roles WHERE role IN ('tecnico_agronomo','consultor_tecnico','aplicador')` |

`administrador`/`gestor`/`financeiro`/`gestor_comercial`/`administrativo`/`producao`/`operador_onfarm` continuam entrando direto no painel interno (`/`) — **não** são forçados a passar pelo seletor. O seletor só aparece para usuários que tenham simultaneamente contexto `b2b` **e** `technical`. Produtor (`cliente_produtor`) continua sendo redirecionado para `/portal`.

---

## 4. Tabelas

### 4.1 Reutilizadas (sem alterações)
- `user_roles` — já suporta múltiplas linhas. Nada muda.
- `profiles`, `partner_users`, `partner_accounts`, `user_clientes` — inalteradas.
- `has_role(uuid, app_role)` — inalterada.

### 4.2 Novas
- `user_access_preferences` — 1:1, guarda `preferred_context`, `last_context`, `skip_context_selector`.
- `user_context_access_logs` — N:1, append-only, auditoria de `login_redirect`/`context_selected`/`context_switched`/`access_denied`.

### 4.3 RPC nova (Fase 4)
- `get_my_available_portal_contexts()` → JSONB com `available_contexts`, `default_context`, `must_select_context`, `has_b2b_access`, `has_technical_access`.
- `set_my_context_preference(context text, remember bool)` → grava preferência + log.

---

## 5. Estratégia de migração

1. Migration **aditiva**: cria 2 tabelas + 2 RPCs + índices + policies. Não altera nenhuma tabela existente.
2. Não há backfill obrigatório: ausência de linha em `user_access_preferences` significa "sem preferência" — RPC calcula default.
3. Usuários legados (que hoje têm 1 role) continuam entrando direto no seu único contexto. Nenhuma ação de dados necessária.
4. Se algum admin quiser dar a um usuário existente acesso ao segundo portal, basta inserir a linha adicional em `user_roles` (fluxo já existente).

---

## 6. Compatibilidade retroativa

| Cenário atual | Comportamento após Bloco 1 | Comportamento após Bloco 2 |
|---|---|---|
| Produtor (`cliente_produtor`) | idêntico | idêntico (vai para `/portal`) |
| Parceiro B2B (só role B2B + `partner_users`) | idêntico | login → `/portal-parceiro/dashboard` direto |
| Técnico interno (só role técnica) | idêntico | login → `/` (Dashboard Agronômico) direto |
| Admin/gestor/financeiro | idêntico | login → `/` direto |
| Usuário com role B2B **e** técnica | idêntico (hoje ele já tem 2 linhas, mas `useAuth.maybeSingle()` pega uma qualquer) | login → seletor `/selecionar-portal` |
| Usuário sem role | erro amigável | erro amigável |

O Bloco 1 **não muda** o comportamento observável. Apenas cria a fundação de dados/RPC.

---

## 7. Estratégia de rollback

- Todas as adições são reversíveis via `DROP TABLE ... CASCADE` e `DROP FUNCTION`.
- Nenhum campo é removido ou renomeado em tabelas legadas.
- Nenhuma RLS existente é alterada.
- `useAuth` só é tocado no Bloco 2, e o Bloco 2 pode ser revertido isoladamente (a fundação sobrevive).

Feature flag opcional (Bloco 2): `VITE_MULTIPORTAL_SELECTOR_ENABLED` em `.env` — se `false`, `Index.tsx` mantém redirect antigo por role.

---

## 8. Impacto

| Área | Impacto no Bloco 1 | Impacto no Bloco 2 |
|---|---|---|
| Rotas | nenhum | +1 rota (`/selecionar-portal`) |
| Login (`Auth.tsx`) | nenhum | nenhum |
| `useAuth` | nenhum | expõe `roles: string[]` mantendo `role` primário |
| `Index.tsx` | nenhum | consulta RPC para decidir redirect |
| RLS existentes | nenhum | nenhum |
| Portal Parceiro B2B | nenhum | nenhum |
| Portal Produtor / PWA técnico | nenhum | nenhum |
| RLS novas | +2 tabelas com RLS restritas ao próprio `auth.uid()` | idem |

---

## 9. Aprovação para Fase 3

Ao aprovar este documento, a Fase 3 executa **uma única migration aditiva** com:
- `user_access_preferences` (+ CHECK, GRANT, RLS, trigger `updated_at`)
- `user_context_access_logs` (+ GRANT, RLS append-only)
- Índices auxiliares
- Sem alterações em tabelas existentes.

Fase 4 cria as RPCs. Fase 5 valida.
