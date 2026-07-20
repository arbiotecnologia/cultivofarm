# FASE 5 — Auditoria da fundação do acesso multiportal

Validação da fundação criada pelas Fases 3 e 4 (aditiva, sem alterações em tabelas legadas).

---

## 1. Migrations aplicadas

| # | Descrição | Objetos criados |
|---|---|---|
| Fase 3 | Tabelas de contexto | `user_access_preferences`, `user_context_access_logs` + trigger `updated_at` + índices |
| Fase 4 | RPCs de contexto | `get_my_available_portal_contexts()`, `set_my_context_preference(text, boolean)` |

Nenhuma tabela legada foi alterada. Enum `app_role`, `user_roles`, `partner_users`, `partner_accounts`, `has_role` — todos intactos.

---

## 2. Tabelas reutilizadas
- `public.user_roles` (já tinha `UNIQUE(user_id, role)` — suporta múltiplos papéis nativamente).
- `public.profiles`, `public.partner_users`, `public.partner_accounts`, `public.user_clientes`.
- Função `public.has_role(uuid, app_role)`.

## 3. Tabelas criadas

### `public.user_access_preferences`
- Colunas: `user_id (PK, FK auth.users ON DELETE CASCADE)`, `last_context`, `preferred_context`, `skip_context_selector`, `created_at`, `updated_at`.
- CHECK: `last_context`/`preferred_context` restritos a (`b2b`,`technical`).
- Trigger `trg_user_access_preferences_touch` mantém `updated_at`.
- RLS ativa, 3 policies (SELECT/INSERT/UPDATE apenas do próprio `auth.uid()`). Sem DELETE.

### `public.user_context_access_logs`
- Colunas: `id (PK)`, `user_id (FK)`, `context_code`, `action`, `previous_context`, `metadata jsonb`, `created_at`.
- CHECK: `context_code IN (b2b, technical, none)`; `action IN (login_redirect, context_selected, context_switched, access_denied)`; `previous_context` restrito ou NULL.
- RLS ativa, 2 policies (INSERT do próprio; SELECT do próprio OU admin). **Sem UPDATE/DELETE → append-only** para usuários comuns.

## 4. Índices criados
- `idx_user_roles_user_id`
- `idx_user_context_logs_user_created (user_id, created_at DESC)`
- `idx_partner_users_user_id`

## 5. Funções

| Função | Retorno | SECURITY | search_path | GRANT |
|---|---|---|---|---|
| `get_my_available_portal_contexts()` | `jsonb` | DEFINER | `public` | `authenticated`, `service_role`; **revogado** de `anon`/`PUBLIC` |
| `set_my_context_preference(text, boolean)` | `jsonb` | DEFINER | `public` | `authenticated`, `service_role`; **revogado** de `anon`/`PUBLIC` |
| `tg_user_access_preferences_touch()` | `trigger` | INVOKER | `public` | interno |

Permissões conferidas por `has_function_privilege`: `anon = false`, `authenticated = true`, `service_role = true`.

---

## 6. Testes executados

### 6.1 Estrutura (via `\d` + `pg_policies`)
- Colunas, CHECKs, FKs, PK, triggers e policies conferem com o design. **PASSOU.**

### 6.2 Comportamento da RPC
- Chamada sem sessão (`auth.uid() IS NULL`) retorna:
  ```json
  {"available_contexts":[], "default_context":null, "must_select_context":false,
   "has_b2b_access":false, "has_technical_access":false}
  ```
  **PASSOU** — nenhum vazamento; nenhum erro; contrato estável.

### 6.3 Cenários lógicos cobertos pela RPC (validados por leitura do código SQL)
| # | Cenário | `available_contexts` | `must_select_context` |
|---|---|---|---|
| 1 | Só B2B gestor (`parceiro_b2b`) + `partner_users` ativo | `[b2b]` | false |
| 2 | Só B2B técnico (`parceiro_b2b_tecnico`) + vínculo ativo | `[b2b]` | false |
| 3 | Só técnico (`tecnico_agronomo`) | `[technical]` | false |
| 4 | Só técnico (`consultor_tecnico`) | `[technical]` | false |
| 5 | Só técnico (`aplicador`) | `[technical]` | false |
| 6 | B2B + `tecnico_agronomo` | `[b2b, technical]` | true (se sem `skip`) |
| 7 | B2B + `consultor_tecnico` | `[b2b, technical]` | true |
| 8 | Sem papel | `[]` | false |
| 9 | Papel B2B **sem** `partner_users` ativo | `[]` no eixo B2B | false |
| 10 | Vínculo B2B com `partner_accounts.ativo = false` | `[]` no eixo B2B | false |
| 11 | Admin (`administrador`) | `[]` (não entra no seletor) | false — segue redirect atual |
| 12 | Usuário legado com 1 role | igual ao atual | false |
| 13 | `preferred_context` inválido (papel removido) | ignorado; default cai para único disponível | — |

Nenhum cenário produz elevação de privilégio: contexto ativo é **UX**; toda autorização continua via `has_role` + vínculos nas RLS existentes.

### 6.4 Segurança das RPCs
- `SECURITY DEFINER` com `search_path = public` fixo → previne shadowing.
- Nunca aceitam `user_id` do frontend; usam `auth.uid()`.
- `REVOKE ALL FROM PUBLIC` e `FROM anon`; `EXECUTE` só para `authenticated`/`service_role`.
- `set_my_context_preference` valida a lista de contextos disponíveis antes de gravar → tentativa de setar contexto inexistente registra `access_denied` e falha.

### 6.5 RLS das tabelas novas
- Usuário A não consegue ler/escrever preferência ou log de B (policies filtram por `auth.uid() = user_id`).
- Admin lê logs de todos (via `has_role`).
- Sem policy de UPDATE/DELETE em `user_context_access_logs` → append-only para usuários; apenas `service_role` (bypass RLS) pode manutenir.

### 6.6 Estado atual dos dados
- `SELECT ... FROM user_roles GROUP BY user_id HAVING count(*)>1` → **0 linhas**.
  Ninguém hoje tem múltiplos papéis. O comportamento observável do sistema **não muda** com o Bloco 1: cada usuário legado continua com 1 role e será redirecionado como sempre foi. A infra fica pronta para o Bloco 2 adicionar segunda role a quem precisar.

---

## 7. Riscos residuais

| # | Item | Severidade | Mitigação |
|---|---|---|---|
| 1 | Linter reporta "Public Can Execute SECURITY DEFINER Function" para as 2 RPCs novas | **Baixa** | Falso positivo — já aplicamos `REVOKE FROM PUBLIC/anon` + `GRANT EXECUTE TO authenticated`. O linter apenas detecta o padrão `SECURITY DEFINER`; a exposição real está fechada (verificado via `has_function_privilege`, `anon = false`). |
| 2 | 252 warnings pré-existentes do linter | N/A | Não introduzidos por este bloco. Fora de escopo. |
| 3 | `useAuth` ainda usa `.maybeSingle()` em `user_roles` | **Baixa** | Sem impacto no Bloco 1 (ninguém tem 2 roles hoje). Bloco 2 substitui por `.select()` array. |
| 4 | Enum `app_role` sem os nomes literais `parceiro_b2b_gestor`/`agronomo`/`tecnico_campo` | Nenhuma | Decisão aprovada na Fase 1: reutilizar valores existentes. |

---

## 8. Status geral

> **APTO** — a fundação está pronta e não altera o comportamento atual do sistema.

Checklist de aptidão:
- [x] Migrations aditivas aplicadas sem erro.
- [x] Nenhuma tabela/RLS legada modificada.
- [x] RPC de resolução de contexto responde corretamente sem sessão.
- [x] Grants restritos a `authenticated`/`service_role`; `anon` não executa.
- [x] RLS das tabelas novas isolam por `auth.uid()`.
- [x] Índices criados.
- [x] Enum `app_role` inalterado; `has_role` inalterada.
- [x] Portal Parceiro B2B, Portal Produtor, PWA técnico, financeiro e áreas internas intactos.
- [x] Zero usuários hoje precisam de seletor → nenhum impacto observável em produção.

---

## 9. Próximo passo — Bloco 2

Ao ser autorizado, o Bloco 2 fará (isoladamente, com rollback trivial):

1. `src/hooks/useAvailableContexts.ts` — hook que chama `get_my_available_portal_contexts`.
2. `src/hooks/useAuth.tsx` — expor `roles: string[]` mantendo `role` primário para compatibilidade.
3. `src/pages/SelecionarPortal.tsx` — tela do seletor (visual coerente com o restante do app).
4. `src/pages/Index.tsx` — consultar RPC:
   - 1 contexto → redirect direto (comportamento atual);
   - 2 contextos → `/selecionar-portal`;
   - `cliente_produtor` → `/portal` (inalterado);
   - admin/gestor/financeiro/etc. → `/` (inalterado).
5. Registrar `login_redirect` em `user_context_access_logs` no `Index.tsx`.
6. Feature-flag opcional `VITE_MULTIPORTAL_SELECTOR_ENABLED`.

Nenhuma rota do Portal Parceiro B2B ou do Portal Produtor será alterada.
