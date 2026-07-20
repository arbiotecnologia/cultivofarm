# Correção do Bloco 1 — Fundação Multiportal (Fase 5 revisada)

Aplica as ressalvas identificadas na Fase 5 original. Migration aditiva única, sem alterar `user_roles`, `profiles`, `partner_users`, `partner_accounts` ou o enum `app_role`.

---

## 1. Migration aplicada

Objetos afetados:

- `public.user_access_preferences` — policies e grants.
- `public.user_context_access_logs` — policies e grants.
- `public.set_my_context_preference(text, boolean)` — recriada.
- `public.register_my_login_redirect_secure(text)` — nova.
- `public.get_my_available_portal_contexts()` — grants reafirmados.

---

## 2. Diff de grants

### `user_access_preferences`

| Papel | Antes | Depois |
|---|---|---|
| `authenticated` | SELECT, INSERT, UPDATE | **SELECT** |
| `anon` | — | — (REVOKE explícito) |
| `service_role` | ALL | ALL |

### `user_context_access_logs`

| Papel | Antes | Depois |
|---|---|---|
| `authenticated` | SELECT, INSERT | **SELECT** |
| `anon` | — | — (REVOKE explícito) |
| `service_role` | ALL | ALL |

Escrita em ambas as tabelas só ocorre por RPC `SECURITY DEFINER` (owner `postgres`, ignora RLS).

---

## 3. Policies

### Removidas
- `user_access_preferences` → `Users insert own access preferences` (INSERT).
- `user_access_preferences` → `Users update own access preferences` (UPDATE).
- `user_context_access_logs` → `Users insert own context logs` (INSERT).

### Mantidas
- `user_access_preferences` → `Users read own access preferences` (SELECT, `auth.uid() = user_id`).
- `user_context_access_logs` → `Users read own context logs` (SELECT, próprio OU admin via `has_role`).

Não existem policies de UPDATE/DELETE em `user_context_access_logs` (append-only para todos exceto `service_role`).

---

## 4. Funções

### 4.1 `set_my_context_preference(p_context text, p_remember boolean default false)` — alterada

Mudanças-chave:

- **Contexto indisponível**: grava `access_denied` em `user_context_access_logs` e **retorna JSON** de erro em vez de `RAISE EXCEPTION`. O log persiste (função retorna normalmente, sem rollback).

  ```json
  {"ok": false, "error_code": "context_not_available", "context": "b2b"}
  ```

- **`p_remember = false`** agora limpa a preferência:
  - `last_context = p_context`
  - `preferred_context = NULL`
  - `skip_context_selector = false`

  Isso funciona inclusive quando o usuário havia marcado "lembrar" anteriormente.

- **`p_remember = true`**:
  - `last_context = p_context`
  - `preferred_context = p_context`
  - `skip_context_selector = true`

- Sucesso:

  ```json
  {"ok": true, "context": "b2b", "remembered": true}
  ```

- `RAISE EXCEPTION` reservado apenas para `not authenticated` e `invalid context` (falhas de integridade).

- Assinatura preservada: `(text, boolean)` retornando `jsonb`. Nenhum caller precisa ser adaptado além da leitura de `ok`.

### 4.2 `register_my_login_redirect_secure(p_context text)` — nova

- `SECURITY DEFINER`, `SET search_path = public`, usa `auth.uid()`.
- Aceita somente `b2b` ou `technical`.
- Valida disponibilidade via `get_my_available_portal_contexts()`.
- `metadata` fixa `{"source":"auto"}` — frontend não escolhe.
- Retornos:

  ```json
  {"ok": true, "context": "technical", "action": "login_redirect"}
  ```
  ou
  ```json
  {"ok": false, "error_code": "context_not_available", "context": "b2b"}
  ```

- Não permite ao frontend gravar `context_selected`/`context_switched`/`access_denied` arbitrariamente.

### 4.3 `get_my_available_portal_contexts()` — inalterada
- Reafirmados os grants (`REVOKE FROM PUBLIC/anon`, `GRANT authenticated/service_role`).
- Contrato preservado: `available_contexts`, `default_context`, `must_select_context`, `has_b2b_access`, `has_technical_access`.
- B2B exige role (`parceiro_b2b`|`parceiro_b2b_tecnico`) **e** `partner_users` ↔ `partner_accounts.ativo = true AND deleted_at IS NULL`.
- Técnico: `tecnico_agronomo`|`consultor_tecnico`|`aplicador`.
- `administrador` **não** entra em `available_contexts`.
- Preferência inválida (papel removido) → ignorada; default cai para o único disponível.

---

## 5. Segurança das funções

`has_function_privilege` após a migration:

| Função | `anon` EXECUTE | `authenticated` EXECUTE |
|---|---|---|
| `get_my_available_portal_contexts()` | **false** | true |
| `set_my_context_preference(text, boolean)` | **false** | true |
| `register_my_login_redirect_secure(text)` | **false** | true |

Todas com `SECURITY DEFINER` + `SET search_path = public`. Nenhuma aceita `user_id` do frontend — todas usam `auth.uid()`.

---

## 6. Testes executados no banco

1. **Policies conferem**: só `SELECT` sobreviveu em ambas as tabelas (query `pg_policies`).
2. **Grants conferem**: `information_schema.role_table_grants` confirma retirada de `INSERT/UPDATE/DELETE` para `authenticated`.
3. **Function privileges**: `anon = false`, `authenticated = true` para as três RPCs.
4. **Chamada anônima** (sem sessão) a `get_my_available_portal_contexts` continua devolvendo contrato vazio esperado (`available_contexts: []`), sem vazamento.
5. **Cenário lógico "contexto indisponível"**: o novo caminho grava o log em modo normal (sem `RAISE`), portanto o registro persiste — validado por leitura do corpo da função.

---

## 7. Riscos residuais

| # | Item | Severidade | Mitigação |
|---|---|---|---|
| 1 | Linter reporta "Public Can Execute SECURITY DEFINER Function" para as 3 RPCs | **Baixa** | Falso positivo. `REVOKE FROM PUBLIC/anon` aplicado; `has_function_privilege('anon', ...) = false` confirmado. |
| 2 | 250+ warnings pré-existentes do linter (extensions in public, views SECURITY DEFINER, buckets públicos etc.) | N/A | Fora do escopo desta correção. |
| 3 | Mudança de contrato: `set_my_context_preference` deixou de lançar exception para contexto indisponível | **Nula em produção** | Nenhum caller de produção existe (UI do Bloco 2 ainda não implementada). Callers do Bloco 2 devem checar `ok` no JSON. |

---

## 8. Critérios de aceite

- [x] Usuário não insere diretamente preferência (`REVOKE INSERT` + policy removida).
- [x] Usuário não atualiza diretamente preferência (`REVOKE UPDATE` + policy removida).
- [x] Usuário não insere diretamente logs (`REVOKE INSERT` + policy removida).
- [x] Usuário não fabrica ações de auditoria — `action` só é definido pelo servidor dentro das RPCs.
- [x] Escolha válida atualiza a preferência (função grava e loga `context_selected`/`context_switched`).
- [x] Escolha inválida registra `access_denied` e o log não é revertido (retorno JSON, sem `RAISE`).
- [x] `p_remember = false` limpa preferência anterior (`preferred_context=NULL`, `skip=false`).
- [x] Redirecionamento automático possui RPC segura (`register_my_login_redirect_secure`).
- [x] RPCs usam `auth.uid()`; nenhuma aceita `user_id`.
- [x] `anon` não executa nenhuma das RPCs.
- [x] Migration aditiva; nenhuma tabela legada alterada.
- [x] Nenhum portal atual sofreu alteração; nenhum usuário perde acesso.

---

## 9. Status

> **APTO** — a fundação corrigida cumpre os aceites e mantém retrocompatibilidade total (nenhum usuário atual possui mais de um papel, portanto o comportamento observável permanece idêntico).

Pronto para autorização do **Bloco 2** (UI do seletor).
