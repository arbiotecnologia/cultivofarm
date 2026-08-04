# Carrinho B2B — remover total duplicado e reorganizar condições de pagamento

## Problema confirmado

No diálogo "Resumo do Pedido B2B" (`src/pages/portal-parceiro/NovoPedido.tsx`) o componente `TotaisCarrinho` é renderizado **duas vezes**: uma logo após a lista de itens (linha 852) e outra antes do bloco de condição de pagamento (linha 931). Por isso "Total a pagar" aparece repetido com o mesmo valor.

Há ainda uma terceira exibição do total dentro de `PaymentSimulationSummary` ("Total final") e uma quarta no card do plano selecionado em `PaymentPlanSelector` ("Total final:"), o que fragmenta a leitura do valor.

## O que será feito (somente frontend/apresentação)

1. **Total único e autoritativo**
   - Remover a primeira renderização de `TotaisCarrinho` (após os itens).
   - Manter apenas a renderização final, que já usa os valores do motor comercial (`simulation.amounts`), posicionada **depois** da escolha da condição de pagamento — é o valor que o parceiro efetivamente vai pagar.
   - Enquanto nenhuma condição estiver selecionada, exibir o subtotal de tabela com o rótulo "Subtotal do carrinho" (sem "Total a pagar"), deixando claro que o total depende da condição.

2. **Condições de pagamento mais legíveis**
   - Mover o bloco "Condição de pagamento" para logo abaixo dos itens, antes do total final, seguindo a ordem natural: itens → condição → total.
   - Nos cards de plano (`PaymentPlanSelector`): remover a linha "Total final" interna (evita repetir o valor) e manter no card apenas nome, prazo, desconto, juros, parcelas e selos. O card selecionado ganha destaque visual e um resumo de "à vista / Nx de R$ …".
   - Rótulos abreviados ganham forma legível: "Desc." → "Desconto", "Juros: 0% a.m." só aparece quando houver juros.

3. **Detalhamento em vez de duplicação**
   - `PaymentSimulationSummary` deixa de repetir "Total final" e passa a mostrar apenas a composição (valor de tabela, desconto, base líquida, juros) mais o cronograma de parcelas, colapsável.
   - O rodapé único de `TotaisCarrinho` passa a mostrar: Subtotal • Desconto • Juros (quando houver) • **Total a pagar**, com a condição escolhida nomeada ao lado.

4. **Mesmo ajuste no carrinho da página** (linha 681) para não conflitar: ali fica "Subtotal do carrinho", já que a condição só é escolhida no diálogo.

## Detalhes técnicos

- Arquivos: `src/pages/portal-parceiro/NovoPedido.tsx`, `src/components/comercial/TotaisCarrinho.tsx`, `src/components/comercial/PaymentPlanSelector.tsx`, `src/components/comercial/PaymentSimulationSummary.tsx`.
- `TotaisCarrinho` ganha props opcionais `jurosValor?: number` e `condicaoLabel?: string`; comportamento atual preservado para os demais usos.
- `PaymentPlanSelector`: prop `finalAmountByPlan` continua aceita (compatibilidade), mas usada só para o resumo do card selecionado.
- Sem alteração de RPC, cálculo, schema, rotas ou permissões. O valor exibido continua vindo de `simulation.amounts.final_amount`.
- Validações ao final: typecheck, build e vitest.
