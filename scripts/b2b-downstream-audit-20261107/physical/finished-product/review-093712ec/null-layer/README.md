# Revisão física 093712ec — nulidade e instalação em camadas

**Escopo:** somente artefatos locais e PostgreSQL descartável. Nenhuma consulta ou escrita hosted, publicação, NF, cobrança ou envio. O estado de produção é o relatado pelo auditor, não uma nova leitura do agente.

## Achados reproduzidos antes da correção

`test_null_contract.py` instalou o candidato anterior e testou o `CHECK` real e os dois helpers, com gate ligado e desligado. O resultado válido foi **27/51, exit 1**, com **24 falhas funcionais**:

- o `CHECK` aceitou expressão NULL para `embalagem_versao`, `conteudo_por_unidade`, `unidade_conteudo`, `quantidade_conteudo`, `quantidade` e `unidade_comercial`;
- com gate ligado, helpers devolveram NULL em casos de metadados nulos;
- seis callers usavam `IF NOT finished_product_*_valid_v1(...)`, que também não nega NULL;
- origem inesperada, `embalagem_id=NULL`, volume em sólido e conteúdo dimensional incoerente já eram negados.

A primeira execução foi mascarada por conflito do índice único de lote agregado. Está preservada em `before-harness-unique-index/` e **não** foi usada como achado funcional. A repetição usa um lote sintético distinto por sonda.

## Correção

Somente `assemble.py` gerou os SQLs. O contrato agora declara nulidade explicitamente e envolve o predicado do `CHECK` com `IS TRUE`; os helpers também terminam em `IS TRUE`. Os seis callers usam `IS NOT TRUE`. O gate continua fechado por padrão e, desligado, a operação é negada; isso não foi confundido com validação positiva de metadados.

Resultados independentes, sem soma:

| Prova | Resultado |
|---|---:|
| Nulidade, dimensões e callers após correção | **51/51, exit 0** |
| Compra/downstream, guards, replays, concorrência e rollback | **49/49, exit 0** |
| Legado biológico com gate desligado | **6/6, exit 0** |
| Revisão estática dos artefatos | **35/35, exit 0** |

## Camadas e estado LIVE relatado

O auditor relatou que o PRE completo parou em `FINISHED_PRE_FUNCTION_DRIFT delivery_confirm_apply_v1` e que estas funções estão ausentes em LIVE:

- `platform_private.delivery_confirm_apply_v1(uuid,timestamptz,text,jsonb)`;
- `platform_private.delivery_send_apply_v1(uuid,timestamptz,text)`.

Os demais seis corpos/owners/ACLs foram relatados como coincidentes. Nenhum pin foi removido.

- `install-foundation.sql.review`: 9 funções de entrada/estoque, metadata e novos objetos; não contém confirm/send.
- `install-downstream.sql.review`: somente confirm/send; exige os corpos originais e o POST exato da entrada. Ausência gera `FINISHED_PRE_DEPENDENCY_MISSING`.
- `install.sql.review`: pacote completo preservado, ainda fail-closed na primeira dependência divergente/ausente.

`test_layers.py` simulou a ausência por `DROP` exclusivamente no PG descartável. O pacote completo abortou antes de criar objetos; a entrada instalou, passou POST e executou compra canônica sem downstream; downstream permaneceu bloqueado. Depois, os corpos capturados foram recompostos com MD5 e ACL exatos, a camada downstream instalou e o fluxo reserva→expedição→entrega passou sem segunda baixa: **16/16, exit 0**.

A primeira recomposição não restaurou o ACL explícito e foi negada por `FINISHED_PRE_ACL_DRIFT`. Está preservada em `layers-first-acl-reconstruction/`; a correção do harness restaura somente o ACL `postgres=X/postgres` capturado, sem grant a clientes.

## Artefato e contenção

Candidato completo SHA256: `962b6cdcf64138b28478a438e51d2a0b67f5b1777d0475e720aba52e905dd9fd`.

O candidato continua **INATIVO/BLOQUEADO/NÃO APROVADO**. A camada downstream depende da instalação canônica das duas funções ausentes. Revisão independente LIVE e homologação JWT/RLS/Storage/PostgREST/browser continuam pendentes. B3/B4, gates fiscais/financeiros/contábeis e comunicação não foram alterados.
