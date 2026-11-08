# Reconciliação POSPLANOS — fresh rehearsal com guards LIVE

**Estado: ensaio local attempt 3 em andamento. Nenhum pacote novo está aprovado ou foi aplicado/publicado.**

O PRE anterior `4f68d404` falhou corretamente em `CONFIRM_PRE_DRIFT`; o auditor não instalou a cadeia de entregas. A tentativa 2 também foi preservada: a migração ampla abortou no próprio PRE por ACLs históricas fora do recorte, antes dos candidatos. Esse PRE não foi enfraquecido.

## Nova evidência fornecida pelo proprietário

- `live-catalog-guards-20261108.sql.capture`: seis corpos LIVE reais de `*_catalog_tenant_guard`, fornecidos em 08/11/2026 para a produção canônica relatada `swzpzcwiasxmjutrmvkm`.
- `live-catalog-guards-20261108.json`: hashes medidos por `md5(pg_get_functiondef(oid))` em PostgreSQL 17.11 descartável e SHA256 da captura.
- Esclarecimento factual: nenhuma das 114 funções alteradas é diretamente redefinida pelos cinco instaladores; o problema é a baseline antiga e suas dependências/guards.

## Correção do ensaio

`physical/finished-product/current_catalog.py` não reaplica mais a migração ampla. Ele monta uma baseline restrita com:

1. os seis corpos capturados, sem alteração semântica;
2. os seis triggers `a000_*_catalog_tenant_guard` habilitados;
3. as três dependências necessárias geradas pelas fontes canônicas `fence_section.py` e `codigo_section.py`;
4. as oito ACLs restritas relatadas;
5. medição dos nove corpos após a composição, sem pins provisórios.

A antiga costura sintética do guard de estoque é substituída somente no PostgreSQL descartável. O ledger usado pelos geradores canônicos é uma costura local declarada; nada dessa montagem entra nos candidatos de instalação.

## Validação exigida

O pacote `production-rollout-posplans-20261108/` só pode ser montado após o fresh rehearsal integral terminar com exit 0, incluindo PRE/POST, parciais 13/13, leitor/endpoint 15/15, concorrência, rollbacks deny-only, preservação dos seis guards/oito ACLs e gates OFF. As provas locais de interface desta tentativa já registram 21/21, 13/13 e 73/73; typecheck exit 0.

`00-current-live-capture.sql.readonly` permanece disponível para complementação READONLY de metadados caso alguma dependência ainda divergir. Resultados de PostgreSQL descartável não provam JWT/RLS/Storage/hosted e não autorizam instalação, ativação, fiscal, recebíveis, cobranças, envios ou publicação.
