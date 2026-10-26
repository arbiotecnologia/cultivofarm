# Reenvio após resultado incerto — NovoPedido (base f9d28117)

Somente frontend. Sem DDL/RLS/cobrança/fiscal; sem publicação.

## Reprodução (antes)
`src/test/pedidos/novoPedidoAmbiguousRetry.test.tsx` (layout, guards, NovoPedido e hook reais; transporte sintético):
envio → boundary desmonta → resposta perdida (rede, sem SQLSTATE) → remontagem com rascunho seguro → reenvio.
Antes: duas chaves distintas (`reproducao-antes.txt`). Depois: mesma chave (`reproducao-depois.txt`).

## Correção (revisada após bac65d)
- `src/lib/authz/pendingOrderAttempt.ts`: memória de processo (sem storage persistente) por usuário+empresa+papéis+parceiro, sem época.
  Retém: chave de idempotência; resumo NÃO criptográfico (cyrb53, 53 bits) do payload enviado — itens/qtd/unidade/volume,
  observação, data, plano, parcelas e `first_due_date` (alinhado ao fingerprint do servidor) —, sem texto em claro;
  e, só após confirmação, o NÚMERO do pedido para aviso ao mesmo ator. Não retém preço, `cart_hash`, tokens nem ID do pedido.
  Limpo por `clearAllPauseStates` (logout/troca de identidade).
- Hook valida que o slot recebido é o do ator/parceiro atuais e registra o resultado dentro do `mutationFn`.
  Rejeição conclusiva somente com SQLSTATE de 5 caracteres nas classes 22, 23, 40, 42, P0 e sem `idempotency_conflict`,
  e apenas se a chave nunca esteve incerta. PGRST*, código vazio, gateway/rede, 08/53/57/58/XX e desconhecidos => incerto.
- Página: payload idêntico reutiliza a chave; payload alterado com tentativa incerta/em andamento é bloqueado.
  `onSuccess` por chamada é cercado por `useStorageAccessScope` e compara o payload COMPLETO atual (ref viva) antes de
  fechar o diálogo, limpar ou navegar.

## Evidências
- `reproducao-antes.txt`: chaves distintas antes da correção.
- `revisao-bac65d-callback-antes.txt`: com a comparação antiga (só itens) os testes de data/observação falham.
- `reproducao-depois.txt`: arquivo do teste com a correção.
- `suites-relevantes.txt`: saída integral das suítes pedidos/comercial/catálogo/sessão de pedidos.

## Lacuna explícita
Não existe canal canônico seguro para consultar pedido por chave de idempotência. Por isso a reconciliação
é o reenvio idêntico (servidor deduplica) ou consulta manual em Meus Pedidos; envio alterado permanece
bloqueado até confirmação, ou até logout. Tentativa incerta não sobrevive a recarregar a aba (sem storage persistente).
Revogação de papel torna a tentativa inalcançável, sem liberá-la a outro ator.
Limite do `cart_hash`: não é retido; o reenvio usa o hash da simulação atual. Se preço ou vencimento mudarem
(nova simulação/dia), o reenvio idêntico pode ser impossível ou recusado; a tentativa permanece incerta (rejeição
após incerteza não descarta), mantendo o envio alterado bloqueado em vez de duplicar.

## Revisão 01367ee — corrida entre envios da mesma chave
Antes: rejeição do 1º envio apagava a entrada com o 2º em voo; o sucesso do 2º se perdia e o retry gerava chave nova
(`corrida-antes.txt`: 3/4 falham; `corrida-hook-antes.txt`: 4/4 falham, hook real).
Correção: `inflightCount` + `uncertain`. A reserva é SÍNCRONA na página (`markOrderAttemptSending` antes de `mutate`,
sem depender de `isPending`); o `mutationFn` só registra o desfecho e libera a reserva se não chegar a enviar.
Rejeição conclusiva só descarta com zero envios em voo, sem incerteza e sem confirmação; o descarte pela tela exige
pedido confirmado e zero envios em voo. Com a reserva, o 2º clique no mesmo tick fica bloqueado na tela (1 RPC).
Testes: `concurrentAttempt.audit.test.ts` (4), `concurrentAttemptHook.test.tsx` (4, ambas as ordens) e
`novoPedidoAmbiguousRetry.test.tsx` (16) — `reproducao-depois.txt`.
