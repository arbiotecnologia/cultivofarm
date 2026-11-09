# Overlay ACL PRE30/INSTALL31 — REVIEW_ONLY, INATIVO

## Finalidade e origem

Este overlay separado corrige somente a comparação de ACL dos dez guards de relação em `30-physical-pre-after-confirmation-send.sql.readonly` e `31-physical-install.sql.review`. O pacote usado pelo auditor, identificado como `ad87`, permanece congelado e inalterado. `origin.json` registra os hashes reais desse pacote e dos dois artefatos de origem.

Relato do auditor em 09/11/2026 03:02 UTC: a produção canônica `swzpzcwiasxmjutrmvkm` recebeu somente `11` de confirmação fechada e `21` de envio fechado, com `12/22` PASS e writers desativados. O PRE30 parou em `FINISHED_PRE_RELATION_DRIFT public.estoque_movimentacoes` porque a ACL real tinha o mesmo conjunto de itens do pin, em outra ordem. RLS, FORCE RLS e owner foram preservados. A produção não recebeu `31` nem etapas posteriores. Nenhuma operação hospedada foi feita por este gerador.

## Comparação corrigida

Cada ACL é convertida em um array JSONB ordenado dos textos completos de seus `aclitem`. A ordem de armazenamento deixa de ser significativa, mas grantee, privilégios, grant option (`*`) e grantor continuam obrigatórios. Itens ausentes, extras, ampliados ou com grantor diferente abortam com o mesmo erro `FINISHED_PRE_RELATION_DRIFT`.

Não há `GRANT`, `REVOKE` ou reordenação de ACL no PRE30. Nenhum corpo de função, tabela, constraint, trigger ou candidato DDL mudou. O candidato DDL do novo `31` é byte-idêntico ao do `31` congelado; o manifesto e `origin.json` fixam essa propriedade.

## Evidência local final

- A tentativa 02 passou 12/12 verificações no PostgreSQL 17.11 descartável: reprodução do falso positivo antigo, aceite da ordem equivalente, cinco divergências reais negadas e execução byte a byte de `30/31`, POST32 e rollback93.
- Após o rollback, o writer de compra e o gate permaneceram fechados; os 18 pins de segurança, o histórico e os planos foram preservados.
- Checagem de tipos sem erros; testes focados da interface e das ordens: 94/94 + 13/13.
- Uma segunda geração independente do overlay foi comparada byte a byte com os artefatos promovidos. A tentativa 01, que parou por erro do adaptador do teste antes do SQL de ACL, também foi preservada em `evidence/acl-order-overlay-20261109/`.

## Uso restrito

- Não reinstalar `11/21` nem repetir etapas já aplicadas.
- Este diretório contém somente os artefatos alterados `30/31`, documentação, origem e evidência local.
- A revisão e qualquer aplicação futura continuam exclusivamente com o auditor e exigem autorização específica.
- Não há ativação, publicação, emissão fiscal, cobrança, recebível ou comunicação.
- PASS em PostgreSQL 17 descartável não certifica JWT, RLS, Storage, navegador ou produção; prova autenticada real permanece `NOT_RUN`.
