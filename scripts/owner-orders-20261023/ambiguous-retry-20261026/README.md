# Reenvio após resultado incerto — NovoPedido (base f9d28117)

Somente frontend. Sem DDL/RLS/cobrança/fiscal; sem publicação.

## Reprodução (antes)
`src/test/pedidos/novoPedidoAmbiguousRetry.test.tsx` (layout, guards, NovoPedido e hook reais; transporte sintético):
envio → boundary desmonta → resposta perdida (rede, sem SQLSTATE) → remontagem com rascunho seguro → reenvio.
Antes: duas chaves distintas (`reproducao-antes.txt`). Depois: mesma chave (`reproducao-depois.txt`).

## Correção
- `src/lib/authz/pendingOrderAttempt.ts`: memória de processo por usuário+empresa+papéis+parceiro (sem época),
  guardando só chave + impressão das escolhas (itens/qtd/unidade/volume, plano, parcelas, data, observação).
  Nunca preço, cart_hash, tokens ou recibos. Limpo por `clearAllPauseStates` (logout/troca de identidade).
- Hook marca envio/resultado dentro do `mutationFn` (sobrevive à desmontagem): sucesso → confirmado;
  erro com SQLSTATE no primeiro envio → descarta; rede/contexto alterado/`idempotency_conflict` → incerto.
  Rejeição posterior a uma incerteza não descarta (envio anterior pode ter commitado).
- Página: payload idêntico reutiliza a chave; payload alterado com tentativa incerta ou em andamento é bloqueado;
  `onSuccess` por chamada é cercado por `useStorageAccessScope` e só limpa carrinho/navega se o carrinho
  ainda é o enviado. Pedido confirmado fora da tela gera aviso e permite iniciar novo pedido.

## Lacuna explícita
Não existe canal canônico seguro para consultar pedido por chave de idempotência. Por isso a reconciliação
é o reenvio idêntico (servidor deduplica) ou consulta manual em Meus Pedidos; envio alterado permanece
bloqueado até confirmação, ou até logout. Tentativa incerta não sobrevive a recarregar a aba (sem storage persistente).
Revogação de papel torna a tentativa inalcançável, sem liberá-la a outro ator.
