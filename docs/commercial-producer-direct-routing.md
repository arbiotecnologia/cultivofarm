# Rotas Canônicas do Produtor Direto — Correção do Planejamento da Fase 0

Status: **DECISÃO FORMALIZADA** — Fase 0.1
Ambiente de referência: staging `ikaauvsflpmamgxmkhoq`. Produção não acessada.

## 1. Correção

O relatório da Fase 0 admitiu, como hipótese, a criação de um portal do produtor
sob `/app/*`. **Essa hipótese fica cancelada.**

O Portal do Produtor canônico é **`/portal/*`**, já existente, servido ao papel
`cliente_produtor`. Não haverá um segundo portal.

## 2. Rotas futuras avaliadas (não implementadas nesta subfase)

```text
/portal/catalogo         → catálogo comercial visível ao produtor
/portal/compras          → lista de compras do próprio produtor
/portal/compras/:id      → detalhe da compra do próprio produtor
```

Essas rotas só serão criadas na fase de produtor direto, com RLS própria
escopada por `get_cliente_ids_for_user(auth.uid())`.

## 3. Proibições permanentes

- Não reativar `/portal/meus-pedidos` para exibir operações internas B2B.
- Não expor simulações internas do parceiro (`partner_simulations`,
  `partner_simulation_items`) ao produtor.
- Não expor `partner_order_payment_terms`, `partner_order_payment_schedule`,
  `partner_product_prices` nem qualquer margem/desconto de parceiro ao produtor.
- Não criar fluxo paralelo de pedido: o produtor direto deve reutilizar o mesmo
  motor (`create_partner_order_secure`) com um ponto de extensão para
  `cliente_id`, e nunca uma segunda RPC concorrente.

## 4. Impacto no motor

O ponto de extensão previsto para a Fase 1+ é aceitar `p_cliente_id` quando
`p_partner_id` for nulo, mantendo a assinatura pública atual intacta (novo
parâmetro com `DEFAULT NULL`, adicionado ao final). Nenhuma assinatura existente
será alterada ou removida.
