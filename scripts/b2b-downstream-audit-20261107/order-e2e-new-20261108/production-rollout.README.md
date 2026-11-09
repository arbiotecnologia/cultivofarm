# Rollout POSPLANOS escopado + contenção ARBio — REVIEW_ONLY, INATIVO

## Estado e limites

- Nenhuma operação hospedada, instalação, ativação, publicação, emissão fiscal, cobrança ou comunicação foi executada.
- Este pacote substitui o rollout POSPLANOS anterior, cujo PRE agregado antigo não corresponde à captura LIVE reconciliada.
- O PRE atual é escopado pela captura LIVE integral, pelo diff independente e pelas dependências efetivamente alteradas. Funções e relações fora do recorte não são redefinidas nem pinadas em versões antigas.
- O complemento LIVE independente fixa RLS, FORCE RLS, owner e ACL de 18 relações no PRE e no POST. `platform_private.envase_insert_permits_v1` permanece com RLS e FORCE RLS desligados e ACL somente do proprietário; as 17 relações públicas permanecem com RLS ligado, FORCE RLS desligado e exatamente as ACLs capturadas. Nenhum grant é acrescentado.
- A captura corrigida contém `COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDA`; o MD5 `a4d47ccf5d116141ed46e9de9ea7eeaa` da sobrecarga curta foi conferido com as demais 19 definições.
- PASS em PostgreSQL descartável e testes locais não comprova JWT, RLS, Storage, navegador, sessão real nem autoridade hospedada.

## Pré-requisitos preservados

- Produção canônica declarada: `swzpzcwiasxmjutrmvkm`; qualquer ausência ou divergência de ref falha fechado.
- Planos `cc1f6cc…` já instalados não são reaplicados nem revertidos.
- Os seis guards de catálogo, ACLs, dez gatilhos de recebíveis, fence `delivery_no_downstream`, histórico e recibos permanecem preservados.
- B4, ponte fiscal, NF/NFS-e, recebíveis, pagamentos, comunicação e ativação automática estão fora do escopo.

## Ordem de revisão

1. `00-production-pre-posplans.sql.readonly`.
2. `11`/`12`: confirmação fechada.
3. `20`/`21`/`22`: envio fechado.
4. `30`/`31`/`32`: produto acabado com gate OFF.
5. `40`/`41`/`42`: logística de revenda com gate OFF.
6. `50`/`51`/`52`: leitor e endpoint de OS com gate OFF.
7. `60`/`61`/`62`: contenção obrigatória do piloto ARBio, ainda com ambos os gates OFF.

Não existe script de ativação. `finished_product_gate_v1` e `b2b_resale_logistics_gate_v1` são somente chaves-mestras: a operação exige também concessões server-side exatas por ator, organização, operação e referências sintéticas, com validade e revogação. Outra organização e ator ARBio fora da allowlist permanecem negados.

## Rollback deny-only

Ordem: `89` contenção → `90` endpoint/leitor → `94` logística → `93` físico → `91` envio+confirmação compostos.

Não usar o antigo rollback isolado de envio: seus guards globais foram superados. O rollback composto mede o estado escopado atual, incluindo `private` e `cf_user_guards_v1`, revoga writers e não apaga allowlist, histórico ou recibos.

## Evidência e integridade

- `evidence-summary.json`: contagens e limites da execução.
- `evidence-source-manifest.json`: hashes das fontes presentes no espelho do ensaio.
- `artifact-sources.json`: origem e hash de cada artefato copiado ou insumo de cada arquivo gerado.
- `manifest.json`: SHA256 e tamanho de todos os arquivos do pacote.
- `verify_production_rollout.py`, na pasta pai, confere novamente arquivos, origens, captura e resultados sem conexão hospedada.

A instalação futura exige revisão independente e autorização específica. A etapa autenticada permanece NOT_RUN até concessões exatas e provas reais aprovadas.
