# Relatório Contas a Receber (`get_report_receivables`) — candidato revisável

REVIEW ONLY. Nada aqui é migration, nada é auto-implantado. Ref obrigatório `swzpzcwiasxmjutrmvkm`.
Sem DDL/DML hosted, publicação ou deploy feitos por este pacote.

## Achado (leitura hosted read-only, 2026-10-19)
- `public.get_report_receivables(_filters jsonb)`, SECURITY DEFINER, VOLATILE, `search_path=public`,
  md5 `pg_get_functiondef` `970a18caa86f578cd31de2a56f002f6f`, ACL `{postgres=X/postgres,service_role=X/postgres}`.
- Sem predicado de tenant; papel via `is_financial_staff` (lê `user_roles`, não JWT). Cliente/parcela/conta sem coerência de org.
- Frontend (prévia) e Edge v90 enviam filtros soltos, não `_filters` → erro. `RelatorioContasReceber` usava
  `defaultFilters={_filters:{…}}` enquanto validação/UI leem `from/to` no topo.
- As 10 RPCs de `RPC_MAP` estão fechadas; este pacote só trata `receivables`. As demais continuam negadas, sem fallback service_role.

## Candidata (`candidate.function.sql`, md5 `25148f33…`)
Mesma assinatura/retorno/colunas. `search_path=''`, STABLE. Exige `auth.uid()`, org via
`platform_private.h15_actor_organization()` (perfil ativo, org ativa, readiness) e papel administrador/gestor/financeiro
via `platform_private.has_role` (leitura viva de `user_roles`, sem claims). `_filters`: objeto com chaves só
`from,to,status,customer_id`; `from/to` obrigatórios ISO, `to>=from`; status ∈ OPEN/PARTIAL/OVERDUE/PAID/CANCELED;
cliente de outra org → 42501. Linhas exigem `ar.org = i.org = c.org = org do ator`. `financial_categories` não tem
`organization_id` (categoria entra só pela FK da conta já filtrada). Ordenação estável `due_date, id`.
ACL: `postgres` + `authenticated` (REVOKE PUBLIC/anon/service_role). Necessário porque Edge e prévia chamam com o JWT do usuário.

## Arquivos
- `baseline.function.sql` — bytes exatos LIVE (md5 conferido no harness).
- `preflight-readonly.sql` / `postflight-readonly.sql` — md5 função, ACL exata, overload único, md5 dos 3 helpers, 16 colunas.
- `candidate.sql.review` — transação: pre-guard → função → ACL → post-guard.
- `rollback.sql.review` — autocontido (sem TEMP): guard candidata → baseline exato → ACL baseline → guard baseline.
- `assemble.py` — gera os 4 arquivos acima a partir dos dois `.function.sql`.
- `frontend-candidate/` — `reportRpcArgs.ts.review` (→ `src/lib/financeiro/`), `ReportShell.tsx.review`,
  `RelatorioContasReceber.tsx.review`. Fora do runtime até revisão independente.
- `edge-candidate/live-v90.index.ts` (= Edge LIVE v90), `index.ts.review`, `delta.diff` (só encapsula receivables).
- `test-local.py` (PostgreSQL descartável) e `helpers.test.ts` (`bun test`).

## Ordem de implantação sugerida (auditor)
1. preflight → `candidate.sql.review` → postflight. 2. Edge `index.ts.review`. 3. Frontend `.review` → publicar.
Se o md5 de `pg_get_functiondef` da candidata no hosted divergir do local, o post-guard aborta a transação (fail-closed);
atualizar o literal só após conferir o corpo.

## Evidência local (sintética — NÃO é homologação JWT/RLS real)
`test-local.py` 27/27 PASS: md5 baseline = LIVE; baseline nega authenticated; guards; A só vê A, B só vê linhas B
coerentes (parcela/conta/cliente de outra org excluídas); produção/perfil inativo/sem uid/anon/org inativa/papel
revogado negados; cliente A pedido por B → 42501; chaves desconhecidas (incl. `organization_id`), datas inválidas,
status inválido, não-objeto rejeitados; rollback restaura md5+ACL exatos. `helpers.test.ts` 6/6 PASS.
Pendente: typecheck dos `.review` integrados ao app, download real A/B e negação entre empresas no hosted.
