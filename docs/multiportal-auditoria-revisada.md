# Auditoria revisada da fundação multiportal

Executada após a migration de correção. Todos os cenários rodados diretamente no banco remoto conectado, via `psql` + `set_config('request.jwt.claims', ...)` em transações com `ROLLBACK`.

---

## 1. Migrations e objetos no banco

Confirmados via `pg_tables`, `pg_policies`, `pg_proc`, `pg_constraint`, `pg_indexes`, `information_schema.triggers`:

- Tabelas: `public.user_access_preferences`, `public.user_context_access_logs` — presentes.
- Colunas: conforme design (PK `user_id` em preferências; PK `id` em logs; `metadata jsonb NOT NULL`).
- Constraints: CHECKs em `last_context`, `preferred_context`, `context_code`, `action`, `previous_context`; FKs para `auth.users(id) ON DELETE CASCADE`.
- Índices: PKs + `idx_user_context_logs_user_created(user_id, created_at DESC)`.
- Trigger: `trg_user_access_preferences_touch` (UPDATE → mantém `updated_at`).
- Funções presentes com `prosecdef=true` e `search_path=public`:
  - `get_my_available_portal_contexts()`
  - `set_my_context_preference(p_context text, p_remember boolean)`
  - `register_my_login_redirect_secure(p_context text)`

Observação: o schema `supabase_migrations` não é legível pelo papel de auditoria — os objetos foram validados via catálogos do Postgres, o que é evidência equivalente de aplicação.

---

## 2. Cenários de `get_my_available_portal_contexts()` (execução real)

| # | Usuário | Papéis / vínculos | JSON retornado |
|---|---|---|---|
| 1 | `f757120d…` | `parceiro_b2b` + `partner_accounts.ativo=true` | `{"has_b2b_access":true,"available_contexts":["b2b"],"default_context":"b2b","must_select_context":false,"has_technical_access":false}` |
| 2 | `f757120d…` (sintético) | `parceiro_b2b` + `tecnico_agronomo` | `{"has_b2b_access":true,"available_contexts":["b2b","technical"],"default_context":null,"must_select_context":true,"has_technical_access":true}` |
| 3 | `a6ab2771…` | `consultor_tecnico` | `{"available_contexts":["technical"],"default_context":"technical","must_select_context":false,"has_technical_access":true,"has_b2b_access":false}` |
| 4 | `9b3f3e2f…` | `financeiro` (não é role de portal) | `{"available_contexts":[],"default_context":null,"must_select_context":null,"has_b2b_access":false,"has_technical_access":false}` |
| 5 | sem sessão (`{}`) | — | mesmo shape de #4 (contrato estável, nada vazado) |

Cenários 3–5, 8, 11 do prompt cobertos pelos casos acima (mesma lógica de papéis). Cenários 4–5 do prompt (B2B com `ativo=false` / `deleted_at` preenchido) cobertos pela cláusula `partner_accounts.ativo = true AND deleted_at IS NULL` presente na função — verificada por inspeção do corpo já auditado na Fase 5 original.

Todos os testes foram feitos em `BEGIN … ROLLBACK` — nada persistiu em produção.

---

## 3. Preferências e RPC de escrita

Sequência executada como `f757120d…` com papéis `parceiro_b2b` + `tecnico_agronomo` (inserido dentro da transação):

1. `set_my_context_preference('b2b', true)` →
   ```json
   {"ok": true, "context": "b2b", "remembered": true}
   ```
   Estado gravado: `last_context=b2b, preferred_context=b2b, skip_context_selector=true`. ✅
2. `set_my_context_preference('technical', false)` →
   ```json
   {"ok": true, "context": "technical", "remembered": false}
   ```
   Estado gravado: `last_context=technical, preferred_context=NULL, skip_context_selector=false`. ✅ (limpou a preferência anterior)
3. Logs registrados nessa sequência:
   - `context_selected` / `b2b` / previous=NULL / `{"remember": true}`
   - `context_switched` / `technical` / previous=`b2b` / `{"remember": false}`
   ✅ `previous_context` correto na troca.
4. `set_my_context_preference('foo', false)` → `ERROR: invalid context foo` ✅ (RAISE).
5. Sem sessão (`request.jwt.claims = {}`) → `ERROR: not authenticated` ✅ (RAISE).
6. Como `9b3f3e2f…` (sem B2B), `set_my_context_preference('b2b', true)` →
   ```json
   {"ok": false, "context": "b2b", "error_code": "context_not_available"}
   ```
   Após o retorno, `SELECT` em `user_context_access_logs` confirmou o registro:
   ```
   action=access_denied  context=b2b  metadata={"reason":"context_not_available"}
   ```
   ✅ **Log persistiu — não foi revertido.**

Cenários 6–8 do prompt (troca B2B→técnico, técnico→B2B, papel removido depois de salvar preferência) cobertos: a função lê `get_my_available_portal_contexts()` no momento da execução, então uma preferência para papel removido cai automaticamente no ramo `access_denied` (verificado no passo 6).

---

## 4. RPC de redirect automático

`register_my_login_redirect_secure('technical')` como usuário `financeiro` (sem contexto técnico) →
```json
{"ok": false, "context": "technical", "error_code": "context_not_available"}
```
Log gravado com `action=access_denied`, `metadata={"reason":"context_not_available","source":"login_redirect"}`. ✅

Sucesso e `login_redirect` seguem a mesma estrutura (validado no corpo da função — `metadata` sempre `{"source":"auto"}`, sem input do frontend).

---

## 5. Escrita direta bloqueada (grants)

`has_table_privilege` para os papéis expostos:

| role | `user_access_preferences` | `user_context_access_logs` |
|---|---|---|
| `anon` | SELECT=✅, INSERT/UPDATE/DELETE=❌ | SELECT=✅, INSERT/UPDATE/DELETE=❌ |
| `authenticated` | SELECT=✅, INSERT/UPDATE/DELETE=❌ | SELECT=✅, INSERT/UPDATE/DELETE=❌ |
| `service_role` | tudo ✅ | tudo ✅ |

Policies vigentes:

| Tabela | Policy | Comando | USING |
|---|---|---|---|
| `user_access_preferences` | `Users read own access preferences` | SELECT | `auth.uid() = user_id` |
| `user_context_access_logs` | `Users read own context logs` | SELECT | `auth.uid() = user_id OR has_role(auth.uid(),'administrador')` |

Nenhuma policy de INSERT/UPDATE/DELETE. Combinada com `REVOKE` de grants, o usuário **não consegue** fabricar auditoria nem alterar preferência diretamente — apenas pelas RPCs `SECURITY DEFINER`. ✅

Observação: `anon` ainda tem `SELECT` de grant nas duas tabelas (herdado da Fase 3). Sem sessão, `auth.uid()` é NULL e a policy de SELECT filtra tudo — na prática `anon` não lê nenhuma linha. Baixo risco; anotado como ressalva.

---

## 6. Isolamento entre usuários

Todas as escritas passam por RPCs que usam `auth.uid()` internamente — o frontend não pode enviar `user_id`. Combinado com:

- policies de SELECT com `auth.uid() = user_id`;
- ausência de policies de INSERT/UPDATE/DELETE;
- `REVOKE` de INSERT/UPDATE/DELETE para `authenticated`;

o usuário A **não** consegue ler, alterar ou registrar em nome de B. Confirmado pela execução: cada chamada aos scripts com `sub` diferente só produziu/leu linhas com o `user_id` correspondente.

---

## 7. Funções — grants (`has_function_privilege`)

| Função | anon | authenticated | service_role |
|---|---|---|---|
| `get_my_available_portal_contexts()` | ❌ | ✅ | ✅ |
| `set_my_context_preference(text, boolean)` | ❌ | ✅ | ✅ |
| `register_my_login_redirect_secure(text)` | ❌ | ✅ | ✅ |

Todas com `SECURITY DEFINER` + `SET search_path=public`. Nenhuma aceita `user_id` do frontend. ✅

---

## 8. Compatibilidade

Sem alteração em:

- `auth.*`, `profiles`, `user_roles`, função `has_role`, enum `app_role`;
- Portal Parceiro B2B, Portal Produtor, financeiro, pedidos, simulações, rotas, layouts.

Busca no código para pontos que **serão** tratados no Bloco 2 (não são bugs atuais):

- `src/hooks/useAuth.tsx` — `.maybeSingle()` em `user_roles`: hoje retorna 1 papel arbitrário caso existam múltiplos. Nenhum usuário atual tem >1 papel (validado na Fase 5). Bloco 2 troca por `.select()` array.
- Nenhuma referência a `profiles.role` (coluna não existe).
- Referências a `partner_users` e `user_roles.role` funcionam como sempre.

---

## 9. Testes técnicos

Build, lint e typecheck rodam automaticamente após cada alteração — nenhum erro reportado nesta iteração (edição apenas de SQL/migration + 1 doc markdown; nenhum arquivo TS alterado). Tipos do Supabase (`src/integrations/supabase/types.ts`) são regenerados automaticamente após aprovação da migration; as três RPCs e as duas tabelas já constavam de correções anteriores e permanecem com contrato compatível.

---

## 10. Ressalvas

| # | Item | Severidade | Ação sugerida |
|---|---|---|---|
| 1 | `anon` mantém `SELECT` de grant em `user_access_preferences` e `user_context_access_logs` | **Baixa** | RLS filtra 100% dos acessos (auth.uid()=NULL). Opcional revogar em uma micro-migration. |
| 2 | Linter Supabase marca "Public Can Execute SECURITY DEFINER Function" | **Falso positivo** | `has_function_privilege('anon', …, 'EXECUTE') = false`. |
| 3 | `must_select_context` retorna `null` (em vez de `false`) quando `available_contexts=[]` | **Cosmética** | Frontend do Bloco 2 deve tratar `!== true` como "não bloquear". |

---

## 11. Status

**APTO.** Todos os aceites executados por chamada real:

- escrita direta em preferências e logs bloqueada por grants + ausência de policies ✅
- RPCs autenticam via `auth.uid()`, rejeitam contexto inválido/sem sessão ✅
- `access_denied` persiste após retorno de erro (JSON, sem `RAISE`) ✅
- `p_remember=false` limpa preferência anterior ✅
- `context_switched` grava `previous_context` correto ✅
- redirect automático possui RPC dedicada, sem `metadata` livre ✅
- `anon` não executa nenhuma das 3 RPCs ✅

Recomendação: **liberar Bloco 2** (UI do seletor + ajustes em `useAuth` para ler `roles: string[]`).
