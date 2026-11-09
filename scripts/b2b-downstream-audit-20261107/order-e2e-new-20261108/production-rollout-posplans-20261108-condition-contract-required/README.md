# Bloqueio do writer legado em plano com condição aprovada (REVIEW_ONLY_INACTIVE_NOT_APPROVED)

## Causa (leituras reais, 09/11/2026)
- ARBio (`007bb519…`) tem versão boleto v1 aprovada para os planos `a129001e…` e `d2e37af8…`. A única atribuição existente é `d2e37af8…` → parceiro `7e52de9a…`. A ativação é `pilot` com `[7e52de9a…]`.
- Para `5c4f35f8…`, `b2b_condition_mode` retorna `legacy`. A UI esconde o seletor de meio e `create_partner_order_secure` aceita o plano configurado sem snapshot. Assim nasceram PB-001038 e PB-001036, os dois sem snapshot. PB-001037 tem snapshot.

## Correção
São dois constraint triggers deferidos em `public.partner_orders`, um para INSERT e outro para UPDATE de plano ou parceiro. A função DEFINER relê a linha no commit. Se o plano tiver versão aprovada e não aposentada do vendedor e não houver `b2b_order_condition_snapshots` nem `quote_snapshots` para o pedido, ela falha com `payment_condition_contract_required`.
- Não altera nenhum writer, ativação ou atribuição. Não concede GRANT a clientes (EXECUTE só para o owner postgres).
- Pedidos históricos não são tocados nem preenchidos retroativamente. Um UPDATE histórico só é bloqueado se mudar o plano ou o parceiro.
- Consequência: enquanto `5c4f35f8…` não estiver no piloto e não tiver atribuição em `a129001e…`, esse comprador não consegue enviar pedido nesse plano. É o fail-closed pedido.
- Rollback 96: remove os dois triggers e a função e volta ao estado anterior. Não toca em dados.

## Teste
`test_condition_required.sh`, PG 17.11 descartável, schema mínimo sintético (costura declarada): 15/15 PASS, exit 0 (`result.txt`). Não prova JWT/RLS/PostgREST nem carrega os writers reais. O ensaio com os corpos reais capturados do create legado e do create de condição fica pendente.

## SHA-256
- 81 `9edec254c2c091add408f247f09a2efec900af5ff707c683eb5f5c3a3c680c3b`
- 82 `6a6d1868c4248416dfddcdcc830b1ed61fdef33cbd0f5187e029756b82af7a49`
- 96 `12ff93a2063b84ecddb203d985ad6702213f2dcdf29bbf99c35faebc14f5227c`
- teste `ad1b2a98e566dcc9ec6b43b8b70f99c69fd045826ebb6e6b231361e73f03fb6b`
- resultado `11f1c06719eddac2854c988cb5920a0cad28468d0582da55d1a9cc79d7571051`
