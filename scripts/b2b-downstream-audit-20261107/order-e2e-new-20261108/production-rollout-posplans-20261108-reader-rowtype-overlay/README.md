# Overlay do leitor de disponibilidade OS — PRE70/INSTALL71/POST72/rollback95 — REVIEW_ONLY, INATIVO

## Motivo

`public.rpc_b2b_resale_os_availability_v1(uuid)` (corpo vigente após 61, MD5 `d426e075…`) usa
`SELECT * INTO v_order` (`partner_orders%ROWTYPE`) sobre `partner_orders JOIN partner_accounts`.
No padrão do PL/pgSQL a atribuição é posicional e descarta as colunas excedentes; como `po.*` vem
primeiro, o caminho positivo funciona. Com `plpgsql.extra_errors='strict_multi_assignment'` a mesma
linha falha. Correção: `SELECT po.* INTO v_order`.

## Delta

- Uma única linha do corpo; cabeçalho (`VOLATILE SECURITY DEFINER`, `search_path=''`, `lock_timeout=3s`), owner `postgres` e ACL `{postgres=X/postgres,authenticated=X/postgres}` preservados (comparação de `aclitem` ordenado: grantee, privilégio, grant option e grantor).
- Sem GRANT/REVOKE, sem mudança de outros objetos; gates exigidos OFF em PRE/INSTALL/POST.
- `71` falha fechado se o corpo vivo não for exatamente `d426e075…` (inclui reexecução).
- `95` restaura byte a byte o corpo anterior sob pins próprios (o corpo anterior não é vulnerável: mesmos predicados de autorização).
- Após `71`, o pin de leitor do POST62 congelado deixa de valer; usar POST72.

## Ordem

Não reinstalar `11/21/26/31/41/51/61`. Se aprovado: `70` → `71` → `72`.

## Limites

PostgreSQL 17 descartável com Auth/papéis sintéticos; não prova JWT/RLS/Storage hospedados. Sem SQL hospedado, ativação, publicação, fiscal, envios ou cobrança.
