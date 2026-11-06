# COMMERCIAL_KPIS_TENANT_V1 — candidato revisável (NÃO APLICADO)

Falha: sessão real FSF (rh@) em `/comercial/indicadores` viu 7 pedidos / R$ 1.454,20 de outros tenants.
Causa (leitura read-only do ref `swzpzcwiasxmjutrmvkm`, PG 17.6): `public.rpc_commercial_kpis(date,date,uuid,uuid,text)`
md5 `96771c88d76993b92267bfe66113fc9d`, SECURITY DEFINER, `search_path=public`, só checa papel administrador/gestor_comercial,
sem predicado de tenant em `partner_orders JOIN partner_accounts` nem em `parceiros_novos`. ACL: postgres/authenticated/service_role.

## Arquivos
- `captured/` — corpos vivos byte-idênticos (md5 do arquivo = md5 de `pg_get_functiondef`). h15/readiness reutilizam `../tenant-display-name-20261106/captured/`.
- `01-pre.sql.readonly` — pins kpis/h15/readiness/has_role, ACL e coluna de propriedade.
- `02-install.sql.review` — guard `h15_actor_organization` + papéis originais; propriedade `commercial_owner_organization_id = tenant` no JOIN e em `parceiros_novos`; `p_partner_id` estrangeiro/inexistente → `forbidden`; `search_path=''`; ACL preservada, sem anon/PUBLIC.
- `03-post.sql.readonly` — corpo vulnerável ausente, guard, 3 filtros de propriedade, DEFINER, search_path, ACL exata, anon negado.
- `04-rollback-deny.sql.review` — sempre `forbidden`; nunca restaura o corpo vulnerável.
- `test-local-pg.py` / `evidence-local-pg.json` — PG descartável: 35 checks PASS.

## Teste local (PG descartável, sem rede/hospedagem)
Reproduz o vazamento com o corpo vivo (admin F vê 8 pedidos de 2 tenants), depois PRE/INSTALL/POST/rerun-aborta/rollback.
Matriz: admin/gestor A com somas exatas; admin F somente FSF (3 pedidos, R$ 1.454,20); negados consultor, financeiro, parceiro_b2b,
perfil inativo, senha provisória, convite em processamento, organização inativa, sem perfil, anon, sem `sub`, service_role sem ator;
filtro de parceiro estrangeiro A→F e F→A e inexistente com a mesma mensagem; consultor/região/período sem vazamento;
revogação de papel nega a chamada seguinte; troca de tenant do perfil segue o perfil.
Costuras: `auth.uid/jwt` por `request.jwt.claims` local, esquema mínimo, enum reduzido. **Não é prova JWT/RLS hospedada.**

## Pendente
Revisão, autorização e aplicação pelo proprietário; depois repetir a negativa real FSF na prévia. Sem publicação.
