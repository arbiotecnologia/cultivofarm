# Reconciliação POSPLANOS — pacote escopado conferido localmente

**Estado: REVIEW_ONLY_INACTIVE_NOT_APPROVED. Nada foi aplicado, ativado ou publicado.**

O PRE agregado anterior `5401300b…` não foi promovido. O pacote antigo foi preservado byte a byte em `../evidence/superseded-production-rollout-posplans-20261108-before-attempt-93/`, com manifesto `0b7bf460…`. Attempts anteriores, inclusive falhas, permanecem imutáveis.

## Evidência LIVE e transcrição

- `live-current-metadata-a7b973949.json`: 20 funções, 120 triggers e 17 relações; SHA256 `8a53b1443ed789c76115b9ef16807ae835e1e0bda888d50e6f1606197792a6ac`.
- `live-pre-drift-411cbbc.json`: diff independente com 126 funções removidas, 232 adicionadas e 9 relações substituídas; SHA256 `8af0e9df54e8802a6e6ebd2e9072a84799cbe72d2956b4bd2992a4526571ce6a`.
- Os 20 MD5 foram recalculados das definições locais e coincidem. A sobrecarga `public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)` contém `COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDA` e MD5 `a4d47ccf5d116141ed46e9de9ea7eeaa`.
- `ORIGEM_INVALIDO` foi somente erro de transcrição local, não divergência de produção. O pacote novo não contém essa grafia.
- `live-catalog-guards-20261108.sql.capture`: seis guards preservados, SHA256 `8e7c2859843d6f4eb39e09e37d49be19c16a8a0c8c530b61ab6cbf26ebe4addb`.

## Execuções desta correção

- **Attempt 92:** falha preservada antes dos candidatos. A baseline histórica ainda exigia `ORIGEM_INVALIDO`; nenhum PRE foi enfraquecido para contornar a falha.
- **Attempt 93:** `exit=0`, **39/39 checkpoints**, **13/13** regressões parciais, **15/15** endpoint/leitor e **30/30** testes da contenção ARBio.
- UI integrada **21/21**, candidata **13/13**, compatibilidade OS **73/73** e typecheck `exit=0` repetidos na mesma tentativa de evidência. A primeira invocação da suíte candidata sem sua configuração específica foi preservada como falha de descoberta e repetida com o config correto.
- Rollback deny-only concluído: gates e writers fechados, histórico/recibos preservados e catálogo atual íntegro.
- B4/fiscal/recebíveis: **NOT_RUN_OUT_OF_SCOPE**. Nenhum efeito financeiro, fiscal ou de comunicação.

A baseline escopada usa a captura corrigida, o diff independente e somente as dependências alteradas. Funções e relações fora do recorte não são redefinidas nem pinadas em versões antigas. A migração ampla de catálogo e os planos `cc1f6cc…` não foram reaplicados.

## Pacote real no repositório

`../production-rollout-posplans-20261108/`

- **35 arquivos** rastreados, incluindo README, contenção, evidências e mapa de origem.
- Manifesto SHA256: `8b6ffefb96f7b70608dd0927b7307d43072b20ff9da7d2d478e5ad356fa588a3`.
- PRE escopado SHA256: `1e71c12c3253e3c83874606c23771443d9b756048ea792cc8fc674859a6c681b`.
- Evidência exata: `../evidence/attempt-93/`; `artifact-sources.json` liga cada cópia/geração aos insumos dessa execução.
- `verify_production_rollout.py` conferiu independentemente 35/35 hashes, origens, 20 MD5, resultados e contenção.
- Rollback: contenção → endpoint → logística → físico → envio+confirmação compostos. O antigo rollback isolado de envio não faz parte do pacote.

O auditor deve revisar independentemente os hashes e executar o PRE somente em `swzpzcwiasxmjutrmvkm`, após comprovar o ref. Qualquer instalação futura exige autorização específica. PostgreSQL descartável e testes locais não provam JWT/RLS/Storage/hosted nem liberam operação real; a etapa autenticada permanece NOT_RUN.
