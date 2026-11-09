# PB-001038: auditoria do meio de pagamento (09/11/2026), somente leitura

Status: READ_ONLY_AUDIT. Pedido, journal e configuração não foram alterados.

## Leituras (ref swzpzcwiasxmjutrmvkm)
- `partner_orders`: `payment_method=NULL`, `payment_plan_id=a129001e…`, `payment_terms_id=b88231e5…`, `payment_condition_status=defined`.
- `partner_order_payment_terms`: 1 linha. Plano TESTE-FLUXO-20261108-V2, 1x, vencimento 2026-12-09, final 18, crédito OK. Sem meio.
- Recibo de idempotência `885a8da7…` (ator 9b1438c1…): o `result_snapshot` não contém `payment_condition_contract` nem `payment_choice`, o que corresponde à resposta de `create_partner_order_secure` (contrato legado).
- `b2b_order_condition_snapshots` para o pedido: 0.
- `b2b_condition_activation` (org AR BIOTECNOLOGIA 007bb519…): `mode=pilot`, `pilot_partner_ids=[7e52de9a…]`, v1.
- `b2b_condition_mode` (md5 7830c32a…) retorna `required` só para parceiros da lista. O parceiro 5c4f35f8… não está nela, então retorna `legacy`.
- `b2b_condition_versions`: existe versão boleto.

## Conclusão
Não houve perda do meio. Para esse parceiro o servidor declara modo `legacy`. Por isso a tela esconde o seletor de meio (`methodMode !== "legacy"`) e envia `payment_method=null` ao writer legado, que não grava meio. "Pagamento único" na tela é a condição do plano 1x, não um meio de pagamento escolhido. A condição boleto configurada só vale para parceiros incluídos no piloto.

## Testes
`src/test/b2b/novoPedidoPaymentMethod.test.tsx` passou 18/18. Cobre: em `legacy`, só o writer legado é chamado; em `required`, só o writer de condição com ACK exato. Os testes são sintéticos e não provam JWT/RLS reais.

## Para o piloto com meio persistido (não executado)
Exige incluir 5c4f35f8… no piloto pela UI admin, via `b2b_payment_condition_activation_set` com CAS `expected_version=1`. Os parceiros existentes devem ser preservados e o modo nunca deve ser `enforced`. Isso depende de autorização do proprietário. O PB-001038 não deve ser editado nem migrado; continua como referência legada imutável.
