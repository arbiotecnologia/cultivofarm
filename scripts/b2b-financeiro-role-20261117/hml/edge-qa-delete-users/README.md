# Remoção temporária das 5 contas Auth QA-FIN-20261117 — somente HML `vrlcdwmlytukrjezrrnf`
Autorização do usuário: remover todos os dados fictícios. Nada disto vai a produção; fora de `supabase/functions` (sem deploy automático).

1. Revisar `handler.ts`; substituir os 5 `__EMAIL_*__` pelos e-mails exatos (DPAPI). Sem isso responde `not_configured`.
2. Copiar `handler.ts` + `index.ts.review` (como `index.ts`) para `supabase/functions/qa-fin-delete-users-hml/` **só no HML**; segredo
   `QA_DELETE_USERS_ENABLED=true`. `SUPABASE_SERVICE_ROLE_KEY` é o do runtime (nunca vai ao cliente nem ao log).
3. Rodar DEPOIS de 06 (QA_CLEAN_PASS). Chamar `POST {user_id, email}` com JWT do admin QA do mesmo tenant:
   admin A → FIN A, FIN B, Gestor A, Técnico A; admin B → FIN C. Respostas: `deleted` | `already_absent` | recusas 4xx/5xx.
4. Ao fim: `QA_DELETE_USERS_ENABLED=false`, excluir a função, rodar `07` (auth_qa = 0). Expira sozinha em 2026-11-19T00:20Z.

Guardas: ref exato, flag, validade, allowlist literal UUID+e-mail+tenant, JWT verificado, `has_role` e `h15` pelo JWT do chamador,
chamador nunca alvo, `getUserById` confere id/e-mail antes de `deleteUser`; nenhum SQL em `auth.*`. `deno test --allow-env handler_test.ts`
→ 15/15 com clientes falsos (não prova Auth hospedado).
