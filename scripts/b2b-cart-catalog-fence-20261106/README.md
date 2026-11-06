# B2B_CART_CATALOG_FENCE_V1 — simulação/carrinho do comprador B2B (NÃO APLICADO)

## Causa demonstrada
`simulate_b2b_payment_plan_secure` → `fn_resolve_b2b_cart` → linha líquida (volume) → `fn_resolve_commercial_price`
(INVOKER) → `public.fn_catalogo_preco_canonico` (wrapper cercado) → `platform_private.tenant_catalog_fence('read_catalog')`
→ `catalog_tenant_actor` → `can_view_catalog_internal`, que exclui `parceiro_b2b` por desenho. Resultado: `42501
tenant_catalog_fence_denied`. A linha de embalagem usa `b2b_packaging_line` (sem fence), por isso só o carrinho com
líquido falha. Reproduzido no PG descartável com os corpos LIVE ("pre:" no evidence).

O harness anterior (`b2b-solid-packaging-order-20261106/test-local-pg.py`) substituía o wrapper por stub — por isso não detectou.

## Delta
1. Novo `platform_private.b2b_partner_cart_volume_price` (DEFINER, sem EXECUTE para clientes): exige
   `b2b_partner_catalog_reader(p_partner)` (guard canônico V2); item do vendedor ativo/B2B/não oculto; devolve o núcleo
   privado canônico. Se o leitor nega, devolve o wrapper cercado inalterado.
2. `fn_resolve_commercial_price`: só a linha do preço canônico muda, e só para `p_buyer_scope='partner'`.
Nada mais muda (pins em generate.py: fence, ator, papéis, wrappers, leitores, carrinho, embalagem, simulação).

## Arquivos
`01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback-deny.sql.review` (md5 em
`generated-md5.json`), `captured/` (corpos LIVE com md5), `test-local-pg.py`, `evidence-local-pg.json`.
Antes de rodar: confirmar fora do SQL o ref `swzpzcwiasxmjutrmvkm`.

## Resultado local: 45/45 (PG descartável)
Pré: comprador líquido/misto negado pela fence; embalagem passava. Pós: líquido 1/0,10/0,90; embalagem 20/2/18; misto
21/2,10/18,90; micro; preço do cliente ignorado/recusado; admin interno inalterado; negados: item de outro tenant,
item oculto, outro parceiro, comprador/admin de outro tenant, técnico, inativo, superadmin, sem sessão, anônimo;
wrapper continua negando o comprador; helper/motor sem EXECUTE cliente. Rollback volta à negação.

## Limites
Costuras declaradas no docstring (auth.uid via claims locais, papéis/features, crédito, seleção de plano). Não é prova
JWT/RLS/PostgREST hospedada; `create_partner_order_secure` usa o mesmo motor mas não foi exercitado aqui.
