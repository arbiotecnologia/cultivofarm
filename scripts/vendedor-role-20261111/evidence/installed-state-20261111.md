# Estado instalado reportado pelo auditor — 11/11/2026 (sem execução daqui)

- Produção concede EXECUTE a `service_role` por default privileges em funções novas de `public`.
- 02b: o REVOKE das quatro funções novas da carteira inclui `service_role` (além de PUBLIC e anon).
- 02c: antes do POST, REVOKE de `service_role` apenas em `public.seller_portfolio_orders_v1()` e `public.admin_seller_portfolio_overview_v1()`.
- Funções preexistentes: nenhuma alteração de permissão.
- Ensaio com rollback; depois aplicado em transação única 02b+02c+02d com POST real aprovado.
- Edge `create-user` v108 implantada com única adição de `vendedor` a TENANT_USER_ROLES, JWT preservado.

Sincronização local: 02b, helpers.sql→02c e 02d regenerados; espelho emula o default (`mirror_db.py`, `fixture.sql`).
Baterias no espelho: 02b 33/33, writers 162/162 (attempt-005), gate admin 79/79 (inclui ACL final sem service_role nas seis novas e ACL de produção intacta nas preexistentes).
Auth sintética; não prova JWT/RLS/Storage hospedados.
