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

Complemento READ ONLY relatado pelo auditor em 09/11/2026 03:57 UTC: `product_packagings` e `product_sale_units` têm, cada uma, `total=1`, `owner_null=0`, `orphan_owner=0` e `owner_product_mismatch=0`. Esses valores estão preservados em `live-owner-fk-reconciliation.auditor-report.json`, com origem e hash; são evidência independente relatada, não medição hospedada feita pelo agente. O PRE25/POST27 mede os quatro contadores novamente e continua exigindo zero owner nulo/órfão no momento de cada execução. O contador de divergência entre owner do item e owner do produto é diagnóstico: as duas FKs deste pacote garantem somente a existência da organização, sem criar uma regra nova de igualdade entre owners.

O mesmo relato registra nove regressões READ ONLY da normalização ACL: ordem diferente aceita e privilégio extra, grant option, role ausente/extra, grantor alterado, duplicata, vazio e NULL rejeitados. Isso complementa, sem substituir, os testes locais do overlay ACL. A suíte ACL anterior cobriu ordem e cinco divergências; o ensaio consolidado FK acrescenta duplicata, vazio e NULL usando exatamente a expressão de normalização dos dez guards. As contagens e mutações do ensaio FK são sintéticas; nenhuma contagem foi inventada.

Para reproduzir a captura, a fixture descartável reconcilia `product_packagings.peso_liquido_kg` de `numeric` para `numeric(12,3)`, recria `product_sale_units.forma_fisica` como coluna `GENERATED ALWAYS AS (...) STORED` com a expressão capturada e remove temporariamente as duas FKs-alvo. O runner mede `pg_attribute.attgenerated`, `pg_attribute.attidentity` e `pg_get_expr(adbin,adrelid)` no banco descartável e exige respectivamente `'s'`, `''` e a expressão real relatada, além do tipo `text` e `attnotnull=false`; nenhum `pg_attrdef` é sintetizado. A tentativa 05 preservou a reprovação da hipótese incorreta de DEFAULT: PostgreSQL não aceita referência a outra coluna em DEFAULT. A tentativa 07 identificou que a fixture também não possuía `catalogo_volumes_medida_shape`; o ensaio seguinte adiciona essa constraint com a definição capturada e lê todas as constraints com `pg_get_constraintdef(oid)`, exatamente como o PRE, evitando comparar a forma `NOT VERBOSE`. A tentativa 08 mostrou que a fixture B3 antiga ainda usava `preco_brl=0,01` como sentinel nas apresentações. Somente no descartável, o runner preserva IDs/linhas e reconcilia esse campo para zero antes de validar a constraint; `catalogo_precos_embalagem` não é alterada. Qualquer outra forma de violação aborta para inspeção, sem UPDATE genérico. Essas mudanças pertencem somente ao ensaio: o INSTALL26 não altera dados, tipos, defaults, expressões ou outras constraints e contém exclusivamente as duas adições de FK. O runner compara todas as 57 colunas esperadas e as 24 constraints restantes antes de executar o PRE25, falhando sobre qualquer divergência não reconciliada. A coluna adicional `produtos.oculto`, ausente da projeção capturada e não rejeitada pelo PRE30 real, permanece preservada e explicitamente fora desse escopo. Para medir a enforcement da FK sem ser mascarado pelo guard de imutabilidade de embalagem, a sonda local usa `DISABLE TRIGGER USER` dentro de uma transação que aborta e é revertida; gatilhos internos de FK permanecem ativos. Essa costura não existe no INSTALL26 e não altera os writers ou triggers finais.

## Evidência final

A tentativa 10 terminou com `exit=0` no PostgreSQL 17.11 descartável. A evidência registra `attgenerated='s'`, `attidentity=''`, tipo `text`, `attnotnull=false` e a expressão capturada medida por `pg_get_expr`; `pg_attrdef_synthesized=false`. O PRE30 reproduziu a falha pelas duas FKs ausentes; PRE25 aceitou a estrutura reconciliada e mediu os quatro contadores. Para cada uma das duas tabelas, um owner órfão foi negado pelo PRE25 e abortou INSTALL26 sem instalação parcial. INSTALL26/POST27 criaram as duas definições exatas e validadas, ambas impediram owner inexistente e a reexecução falhou fechado. Os casos ACL adicionais duplicata/vazio/NULL foram negados; combinados à suíte ACL 12/12, cobrem as nove categorias. PRE30/INSTALL31 finais, POST32 e rollback93 passaram, POST27 continuou PASS após o rollback, writer/gate permaneceram fechados e os 18 pins de segurança, histórico e planos foram preservados.

`evidence-owner-fk.json` vincula o hash exato do runner e dos cinco artefatos finais executados (`25/26/27/30/31`). `evidence-acl-overlay.json` preserva a suíte ACL anterior. O manifesto fixa também a evidência READ ONLY relatada pelo auditor; nenhum desses registros é prova JWT/RLS/Storage/browser real.

## Limites

PASS no PostgreSQL 17 descartável valida somente os artefatos e as costuras declaradas. Não certifica JWT, RLS, Storage, navegador, produção ou autoridade comercial; prova autenticada real permanece `NOT_RUN`. Qualquer aplicação futura é exclusiva do auditor, após revisão e autorização específica.
