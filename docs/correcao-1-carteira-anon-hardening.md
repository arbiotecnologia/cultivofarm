# CORREÇÃO 1 — Hardening de carteira e anon em registros/ocorrências

- **Base auditada:** `7c0f28735914f81922a5259d30eecb91a2dd9603`
- **Ambiente:** staging `ikaauvsflpmamgxmkhoq` (guard fail-closed em toda execução)
- **Produção `navfzbwgwzruipouyfnk`:** não conectada, não consultada, não migrada, não publicada
- **Escopo:** exclusivamente autorização de carteira e ACLs. Nenhuma alteração em React, rotas, pedidos, preços, financeiro, fiscal ou ponte recomendação→pedido.

## Causa raiz

Duas funções homônimas concediam acesso indevido:

1. `public.can_user_access_cliente(_cliente_id uuid)` — para `consultor_tecnico` /
   `tecnico_agronomo` bastava **qualquer** linha em `user_clientes`, ignorando
   `is_active`, `valid_from`, `valid_until` e `revoked_at`. Vínculo revogado
   continuava concedendo leitura de ocorrências.
2. `public.can_user_access_cliente(_user_id uuid, _cliente_id uuid)` — overload
   com `GRANT EXECUTE` a `authenticated` que retornava `TRUE` para **qualquer**
   usuário com papel `tecnico_agronomo` ou `consultor_tecnico`, sem nenhuma
   verificação de carteira. Sem chamadores em policies hoje, mas invocável via RPC.

Além disso, `registros_consultor` tinha `GRANT ALL` direto para `anon` e a policy
`registros_consultor_select_hardened` era `TO public` (alcançava `anon`).

## Correção aplicada

- Ambas as funções delegam o ramo técnico ao helper canônico
  `public.has_active_user_cliente_access(user, cliente, ARRAY['read','execute','manage'])`.
  Nenhuma tabela ou vínculo paralelo foi criado.
- Fail-closed: todos os retornos com `COALESCE(..., false)`; `NULL` em entrada nega.
- `SECURITY DEFINER` + `SET search_path = public` preservados; assinaturas inalteradas.
- Policy de SELECT recriada `TO authenticated`, lógica semanticamente idêntica.
- `REVOKE ALL ... FROM anon, PUBLIC` na tabela; `authenticated` reduzido a
  `SELECT, INSERT, UPDATE, DELETE`; `service_role` mantém `ALL`; RLS permanece habilitada.
- `anon`/`PUBLIC` sem `EXECUTE` nas duas assinaturas.
- Inventário das 5 policies permissivas: todas agora `TO authenticated`; nenhuma
  redundante mantinha o vazamento.

## Matriz de testes (runtime, sessões `authenticated` reais com JWT)

| Teste | Descrição | Esperado | Obtido | Status |
|---|---|---|---|---|
| T1 | admin preserva acesso | 5 | 5 | PASS |
| T2 | gestor autorizado preserva acesso | 5 | 5 | PASS |
| T3 | consultor A lê ocorrência do cliente A | 1 | 1 | PASS |
| T4 | consultor A não lê ocorrência do cliente B | 0 | 0 | PASS |
| T5 | agrônomo A lê cliente A atribuído | 1 | 1 | PASS |
| T6 | agrônomo A não lê cliente B | 0 | 0 | PASS |
| T7 | técnico participante abre e edita visita atribuída | 1/1 | 1/1 | PASS |
| T8 | técnico não participante não abre/edita | 0/0 | 0/0 | PASS |
| T9 | produtor A lê próprio registro aprovado | 1 | 1 | PASS |
| T10 | produtor A não lê produtor B | 0 | 0 | PASS |
| T11 | parceiro sem vínculo não lê de outro parceiro | 0 | 0 | PASS |
| T12 | authenticated sem vínculo lê zero | 0 | 0 | PASS |
| T13 | anon SELECT/INSERT/UPDATE/DELETE negados | 42501 x4 | 42501 x4 | PASS |
| T14 | PUBLIC/anon sem privilégios; authenticated mínimo | anon=0 public=0 auth=DISU polpub=0 | idem | PASS |
| T15b | overload 2-arg: com carteira `true`, fora `false` | true/false | true/false | PASS |
| T15 | regressão visita T1–T18 + concorrência | 18/18 e 9/9 | 18 PASS / 0 FAIL; 9 PASS / 0 FAIL | PASS |
| T16 | zero fixtures, zero blobs, triggers habilitados | 0/0/0 | 0/0/0 | PASS |

Regressão de aplicação: `tsgo --noEmit` PASS · Vitest 2723 passed / 4 skipped (166 arquivos) · `bun run build` PASS.

Postchecks: `POSTCHECK_CARTEIRA_ANON_PASS` e `POSTCHECK_RUNTIME_FINAL_PASS`.

## Canonização na cadeia de migrations

O mesmo hardening, idempotente e com guard fail-closed, foi canonizado em
`supabase/migrations/20260809000000_carteira_anon_hardening_canonico.sql`
(sha256 `307c3b7c8bc1158edbe9f8390a43b22c9bdc7b5a07393b9b7e448e3b3993c584`, 10736 bytes).
Nenhuma migration histórica foi editada. A migration contém apenas guard, funções,
policy e ACLs — sem comandos psql, metacomandos ou testes. `rollback.sql`,
`postcheck.sql` e `harness-runtime.sql` permanecem fora de `supabase/migrations/`.

Aplicada em staging pelo mesmo mecanismo transacional já usado pelo projeto
(`psql --single-transaction -v ON_ERROR_STOP=1`), com reexecução comprovando
idempotência: md5 das duas funções, roles da policy e ACLs idênticos antes e depois.
O ledger `supabase_migrations.schema_migrations` do staging para em `20260805155043`
e não contém nenhuma das 5 migrations posteriores do repositório; nenhum INSERT
manual foi feito no ledger.

## Checksum do postcheck consolidado da visita

`restoration/visita-portais-tecnicos/postcheck-consolidacao.sql` teve o checksum
esperado de `rpc_upsert_recomendacao_visita` atualizado de
`dc17f7b8…6107` para `118be475…3dbb`, capturado da definição homologada em staging
após `20260805182000` (contém `version_conflict` e `FOR UPDATE`). O corpo da RPC não
foi alterado. Resultado: `POSTCHECK_CONSOLIDACAO_OK`.

## Reversibilidade

`rollback.sql` restaura as duas funções, a policy `TO public` e as ACLs originais,
com o mesmo guard de ambiente e sem excluir ou alterar dados.
