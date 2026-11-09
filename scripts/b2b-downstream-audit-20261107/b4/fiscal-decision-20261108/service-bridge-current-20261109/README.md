# Ponte fiscal B4 + previsão separada — REVIEW ONLY, INATIVO

Pacote local, não aprovado para instalação. Nenhuma operação hosted, emissão, cobrança, envio ou publicação foi realizada.

## Decisão implementada localmente

`forecast-pre-nf-20261109/` contém PRE/POST, instalação revisável e rollback deny-only:

- previsão privada, separada e não exigível após aprovação comercial e crédito/condição/preço válidos;
- simulação/cotação não cria previsão nem recebível;
- nenhum `accounts_receivable` antes da NF;
- NF autorizada reduz a cobertura residual e gera o título definitivo pelo motor B4;
- vencimento definitivo permanece baseado na emissão da NF e no prazo contratado;
- rollback fecha writers e preserva previsões, documentos, snapshots, títulos e histórico.

## Evidência principal

Tentativa 149 em PostgreSQL 17 descartável, restauração integral nova e funções reais reconciliadas: **50/50 PASS**.

- Seller91 executado com MD5 `97bcdb9884b54adb3bd4aae4915e32d0`.
- Envelope H13 104/protocolo 100: um documento, uma alocação, um snapshot e um título.
- Replay estável, sem duplicação e sem `CLOSE_PENDING`.
- Exposição total de crédito antes/depois: `5968,64`; pedido + previsão + título não foram somados duas vezes.
- Previsão final `faturado_total`, residual zero; ACL e dez gatilhos de recebíveis preservados.
- Rollback deny-only preservou histórico e negou chamadas autenticadas posteriores.

Evidências: `order-e2e-new-20261108/evidence/attempt-149/`. O diagnóstico 125 (`FISCAL_DOCUMENT_LOCKED`) permanece preservado como característica anterior, não como aprovação.

## Limites

O positivo integrado novo usa NF total. NF parcial, rejeição/cancelamento pós-autorização e concorrência específica do reconciliador não foram reexecutados nesta tentativa; resultados anteriores não certificam esta nova costura. A UI dos novos estados de previsão também não foi implementada.

Costuras sintéticas de Auth/schema/eventos fiscais, adaptador sem rede, `HOMOLOGATION`/ambiente 2. Não é prova JWT/RLS/Storage, homologação SEFAZ ou prontidão de produção. O pacote permanece `REVIEW_ONLY_INACTIVE_NOT_APPROVED`.
