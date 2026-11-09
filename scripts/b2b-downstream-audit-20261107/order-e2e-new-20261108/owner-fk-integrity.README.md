# Integridade owner FK — REVIEW_ONLY, INATIVO

## Origem e contenção

A captura READONLY fornecida pelo auditor mostra que a produção canônica não possui `product_packagings_owner_organization_id_fkey` nem `product_sale_units_owner_organization_id_fkey`, embora PRE30/INSTALL31 exijam ambas. Este pacote separado não remove nem afrouxa esses guards. O pacote `ad87` e o overlay ACL2db87 permanecem byte-idênticos; a diferença do overlay ACL continua limitada aos dez guards já revisados.

Relato do auditor: produção recebeu somente `11` de confirmação fechada e `21` de envio fechado, com `12/22` PASS. Não recebeu `31+`. Nenhum SQL hospedado, publicação, ativação, reinstalação de `11/21`, emissão fiscal, cobrança ou comunicação faz parte deste pacote.

## Artefatos e ordem

1. `25-owner-fk-pre.sql.readonly`: transação READ ONLY/ROLLBACK; mede linhas e órfãos, confere 57 colunas, 24 constraints existentes, owner/ACL das quatro relações de catálogo e ausência das duas FKs de destino. Qualquer órfão aborta com `OWNER_FK_ORPHANS_PRESENT` e SQLSTATE `23503`.
2. `26-owner-fk-install.sql.review`: transação única, `lock_timeout` e `statement_timeout`; bloqueia `organizations`, `product_packagings` e `product_sale_units` em ordem fixa, repete todas as checagens depois das esperas e adiciona somente as duas FKs validadas. Não limpa nem reatribui dados.
3. `27-owner-fk-post.sql.readonly`: exige as duas definições exatas, `convalidated=true`, zero órfãos e mesma estrutura/ACL.
4. Somente após POST27, o auditor pode repetir o PRE30 do overlay ACL e avaliar INSTALL31. Este pacote não instala nem ativa `31`.

Não há rollback que remova as FKs: retirar integridade referencial não é deny-only. O rollback93 físico existente preserva essas constraints e todo o histórico.

## Dados e concorrência

A instalação é permitida somente com zero órfãos nas duas relações. Não há UPDATE, DELETE, backfill, cadastro de organizações ou reparação automática. Se houver órfãos, o auditor deve tratar a origem em pacote separado; este candidato falha sem criar a outra FK. As checagens são repetidas depois dos locks para impedir que uma escrita concurrente validada antes da espera seja ignorada.

As contagens do ensaio são sintéticas e não substituem as contagens reais do PRE25. O complemento de contagens mencionado na fila não estava disponível no histórico recuperado; nenhuma contagem foi inventada. O PRE final mede os valores reais no momento de sua execução.

## Limites

PASS no PostgreSQL 17 descartável valida somente os artefatos e as costuras declaradas. Não certifica JWT, RLS, Storage, navegador, produção ou autoridade comercial; prova autenticada real permanece `NOT_RUN`. Qualquer aplicação futura é exclusiva do auditor, após revisão e autorização específica.
