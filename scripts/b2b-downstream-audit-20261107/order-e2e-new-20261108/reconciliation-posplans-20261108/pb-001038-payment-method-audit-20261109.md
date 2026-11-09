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

## Observação do controle real do vendedor (relato do proprietário, 09/11/2026 15:23Z)
- Resultado PASS: 2 embalagens de 25 kg a 9 cada, total 18. Após recarregar, o comprador continua vendo 1 pedido.
- Defeito de apresentação: a tela do vendedor mostrava "1º vencimento 09/12/2026" como data definitiva, embora a NF não tenha sido emitida e a regra seja NF + 30 dias.
- Origem: `partner_order_payment_terms.first_due_date` (2026-12-09) vem do writer legado e equivale à data do pedido (2026-11-09) + 30 dias. É um snapshot do pedido, não um vencimento real.
- Correção de UI (`PaymentTermsSection`): o campo passou a se chamar sempre "1º vencimento estimado" e mostra "(estimativa)". Sem data, mostra "A definir após confirmação fiscal". A nota sobre a NF como data-base aparece também no modo legado. O snapshot, os dias, o servidor e as decisões ficaram intactos.
- Teste: `paymentTermsRead.test.tsx` passou 37/37, com um caso novo para o modo legado sem NF.
- Cobertura existente de NF + 30, datas mensais e dias úteis: são geradores e testes em PG descartável (`b2b-payment-condition-v1-rebase-20261106/test-local-pg.py`, `financial-installments-initial-20261024/price-schedule.py`, `b4/generate-b4.py`). Não foram reexecutados nesta etapa.
- Aprovação e decisões financeiras continuaram desabilitadas. O botão de liberar após a contabilidade não foi acionado. O fiscal continua pendente e nenhuma data real foi gerada.

## Leitura independente do proprietário (15:24Z) e causa do fluxo legado
- A leitura do proprietário confirma: termos sem meio, recibo sem contrato/meio, `partner_orders.payment_method=NULL`.
- O meio do contrato V1 não fica em `public`. Fica em `platform_private.b2b_order_condition_snapshots` (choice, condition_method, condition_version, due_basis, estimated…), fora do information_schema público consultado pelo proprietário. Para PB-001038 existem 0 linhas.
- Causa da omissão: `b2b_condition_mode(5c4f35f8…)` retorna `legacy` porque a ativação ARBio v1 é `pilot` com `[7e52de9a…]` apenas. A UI então oculta o seletor, envia `payment_method=null` e usa `create_partner_order_secure`. Esse comportamento é o projetado e não é perda. "Pagamento único"/10% é o plano TESTE-FLUXO-…-V2, e não a escolha de boleto.
- Proibido: atribuir boleto ao PB-001038 retroativamente ou editar o pedido. O pedido fica como referência legada imutável.
- Adequação antes de um novo pedido ou promoção: (1) o proprietário inclui 5c4f35f8… no piloto pela UI admin (CAS v1, preservando 7e52de9a…, nunca `enforced`); (2) uma leitura confirma que o modo retorna `required` para o parceiro e que o boleto aparece no leitor de opções; (3) o novo pedido sai pelo writer `create_partner_order_condition_secure` com ACK exato; (4) a leitura pós-pedido confirma a linha em `b2b_order_condition_snapshots`, com a data estimada e base NF.

## Conclusão independente do proprietário (15:24Z), que substitui a suspeita de perda de coluna
- PB-001038 passou pelo caminho legado: não tem snapshot privado nem recibo V1.
- Causa da elegibilidade: a versão boleto v1 está aprovada para o plano `a129001e…`, mas não há atribuição para `5c4f35f8…` e o piloto só inclui `7e52de9a…`. O modo `legacy` deixou o writer legado aceitar o plano configurado. PB-001036 (`d2e37af8…`, teste4) também não tem snapshot e foi preservado.
- Correção preparada: `production-rollout-posplans-20261108-condition-contract-required/` (81/82/96), 15/15 PASS em PG17 descartável sintético. Não foi aplicada e não há backfill.
