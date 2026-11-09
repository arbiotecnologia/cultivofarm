# Plano — piloto real mínimo ARBio: pedido de 2 embalagens → entrada → duas entregas parciais

Estado: `PLAN_ONLY_NOT_APPROVED`. Gates de logística e estoque permanecem OFF, a allowlist permanece vazia e não há SQL hospedado, publicação, envios, fiscal ou cobrança até que o plano seja revisado e aprovado pelo proprietário.

## Base reportada pelo auditor (produção `swzpzcwiasxmjutrmvkm`)
- Instalados: 11/21/26/31/41/51/61, com POST PASS. Nenhum deles deve ser reinstalado.
- `pilot_grants=0`, `new_partner_orders=0`, os dois gates OFF.
- Pré-requisito opcional: overlay do leitor 70/71/72 (`SELECT po.*`), revisado à parte.

## Escopo exato (uma única execução)
1. **Pedido**: o comprador real (gestor B2B da fixture exclusiva do proprietário) cria 1 pedido com 1 item químico ou fertilizante, de **2 embalagens inteiras**, pelo fluxo normal da UI. O meio de pagamento é escolhido explicitamente. Nenhum título é criado (o título só nasce na NF).
2. **Aprovação comercial** pelo fluxo existente. Não há waiver nem cobrança.
3. **OS de revenda** via `rpc_b2b_resale_os_create_v1`, com CAS `observed_updated_at` do leitor.
4. **Entrada de compra** `rpc_finished_product_purchase_entry_v1`: 2 embalagens, lote do fornecedor real e referência de compra real (nota do fornecedor). Não usar dado inventado.
5. **Entrega parcial 1**: reservar 1 embalagem, agrupar, enviar (manual), comprovar e confirmar. O pedido permanece aberto (cobertura parcial).
6. **Entrega parcial 2**: o mesmo ciclo com a 1 embalagem restante. Só então o pedido conclui com cobertura integral, ainda sem recebível.

## Allowlist (servidor, `platform_private.resale_pilot_allowlist_v1`)
- Uma linha por gate/operação: `b2b_resale` read/create, `finished_product` entry, `delivery` reserve/group/send/proof/confirm.
- Referências exatas: ator, organização ARBio, parceiro, pedido, item, produto, estoque e entregas. Linhas de entrega só depois que a entrega existe, com o UUID completo confirmado.
- `valid_until` curto (≤ 4 h a partir da abertura). Revogação por linha (`revoked_at`) e revogação total ao final, ou em qualquer falha.
- Sem curinga: referência nula só onde o objeto ainda não existe e a operação o cria.

## Sequência operacional (auditor)
1. Rodar os PRE somente leitura (60/62, 72 se aplicado) e conferir as contagens zero.
2. Inserir as linhas da allowlist da etapa 1.
3. Ligar o gate pelo tempo mínimo de cada janela e desligá-lo ao terminar.
4. Executar cada etapa e conferir a resposta canônica (ACK exato). Em resposta incerta, nada é reenviado: consulta-se o recibo.
5. Entre as etapas, desligar o gate e inserir as linhas seguintes com UUIDs reais.
6. No fim: revogar todas as linhas, gates OFF e POST com contagens. Esperado: 1 pedido, 1 OS, 1 lote, 2 entregas, 2 expedições, 0 títulos, 0 NF, 0 mensagens.

## Critérios de parada (fail-closed)
- Qualquer drift de PRE/POST, um erro 42501 inesperado, PT409 sem explicação ou efeito fora do escopo (título, NF, outbox, produção/CQ/envase).
- Diferença entre a quantidade do pedido, da entrada e das entregas.
- Expiração da allowlist no meio de uma etapa: parar e não estender automaticamente.

## Evidência exigida
JWT/RLS/Storage e browser reais, por etapa, com capturas READ ONLY antes e depois. Os testes sintéticos em PG descartável continuam sendo só prova de componente.

## Pendências para aprovação
- Identificar o comprador e o parceiro da fixture exclusiva (o proprietário cria), o produto e a embalagem.
- Definir a nota/lote reais do fornecedor para a entrada.
- Decidir se o overlay 70/71/72 é aplicado antes do piloto.
- Manter o calendário fiscal pendente e a NF fora do piloto, portanto também sem título.
