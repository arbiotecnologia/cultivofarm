# Reconciliação POSPLANOS — pacote escopado conferido localmente

**Estado: REVIEW_ONLY_INACTIVE_NOT_APPROVED. Nada foi aplicado, ativado ou publicado.**

O PRE agregado anterior `5401300b…` não foi promovido. O pacote antigo foi preservado byte a byte em `../evidence/superseded-production-rollout-posplans-20261108-before-attempt-93/`, com manifesto `0b7bf460…`. Attempts anteriores, inclusive falhas, permanecem imutáveis.

## Evidência LIVE e transcrição

- `live-current-metadata-a7b973949.json`: 20 funções, 120 triggers e 17 relações; SHA256 `8a53b1443ed789c76115b9ef16807ae835e1e0bda888d50e6f1606197792a6ac`.
- `live-current-relation-security-20261109.json`: complemento READONLY LIVE independente com schema/nome/RLS/FORCE RLS/owner/ACL de 18 relações; SHA256 `20a514091f0ab4301cd11f67d530e1a17b94c4a7e1fea17196f100dca51f712d`. A captura original permanece intacta; os 17 registros públicos coincidem em owner/ACL e o complemento adiciona `platform_private.envase_insert_permits_v1`. Todos os 18 pins são obrigatórios no PRE/POST, sem novos grants.
- `live-pre-drift-411cbbc.json`: diff independente com 126 funções removidas, 232 adicionadas e 9 relações substituídas; SHA256 `8af0e9df54e8802a6e6ebd2e9072a84799cbe72d2956b4bd2992a4526571ce6a`.
- Os 20 MD5 foram recalculados das definições locais e coincidem. A sobrecarga `public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)` contém `COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDA` e MD5 `a4d47ccf5d116141ed46e9de9ea7eeaa`.
- `ORIGEM_INVALIDO` foi somente erro de transcrição local, não divergência de produção. O pacote novo não contém essa grafia.
- `live-catalog-guards-20261108.sql.capture`: seis guards preservados, SHA256 `8e7c2859843d6f4eb39e09e37d49be19c16a8a0c8c530b61ab6cbf26ebe4addb`.

## Execuções desta correção

- **Attempt 94:** falha preservada no rollback isolado de envio fora do recorte logístico; os 18 pins e os 30 testes de contenção já tinham passado. Nenhum guard foi enfraquecido e a tentativa não foi promovida.
- **Attempt 95:** no recorte logístico REVIEW_ONLY, `exit=0`, **39/39 checkpoints**, **13/13** regressões parciais, **15/15** endpoint/leitor e **30/30** testes da contenção ARBio. PRE/POST conferiram os 18 pins de RLS/FORCE RLS/owner/ACL.
- UI integrada **21/21**, candidata **13/13**, compatibilidade OS **73/73** e typecheck `exit=0` repetidos na mesma tentativa de evidência.
- Rollback composto deny-only concluído: gates e writers fechados, histórico/recibos preservados e catálogo atual íntegro. O rollback isolado de envio não faz parte do pacote.
- Attempts 92/93 permanecem evidências históricas anteriores ao complemento; B4/fiscal/recebíveis continuam **NOT_RUN_OUT_OF_SCOPE**. Nenhum efeito financeiro, fiscal ou de comunicação.

A baseline escopada usa a captura corrigida, o diff independente e somente as dependências alteradas. Funções e relações fora do recorte não são redefinidas nem pinadas em versões antigas. A migração ampla de catálogo e os planos `cc1f6cc…` não foram reaplicados.

## Pacote real no repositório

`../production-rollout-posplans-20261108/`

- **36 arquivos** rastreados, incluindo README, contenção, complemento das 18 relações, evidências e mapa de origem.
- Manifesto SHA256: `bd09de0106bc47ea60a888883a8d9f4c1bb5ed1eca4a3d520e8e686154248693`.
- PRE escopado SHA256: `f07b1fdacdff5d5e2adcf43795308c23bc0b66a9b3ffc0f5963343aeb0fc14fd`.
- Evidência exata: `../evidence/attempt-95/`; `artifact-sources.json` liga cada cópia/geração aos insumos dessa execução.
- `verify_production_rollout.py` conferiu independentemente 36/36 hashes, origens, 20 MD5, 18 pins de relações, resultados e contenção.
- Pacote da attempt 93 preservado em `../evidence/superseded-production-rollout-posplans-20261108-before-attempt-95/`; não promovido.
- Rollback: contenção → endpoint → logística → físico → envio+confirmação compostos. O antigo rollback isolado de envio não faz parte do pacote.

O auditor deve revisar independentemente os hashes e executar o PRE somente em `swzpzcwiasxmjutrmvkm`, após comprovar o ref. Qualquer instalação futura exige autorização específica. PostgreSQL descartável e testes locais não provam JWT/RLS/Storage/hosted nem liberam operação real; a etapa autenticada permanece NOT_RUN.
