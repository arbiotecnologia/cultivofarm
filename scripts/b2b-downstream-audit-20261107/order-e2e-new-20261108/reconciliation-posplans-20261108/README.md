# Reconciliação POSPLANOS — concluída localmente

**Estado: pacote REVIEW_ONLY_INACTIVE_NOT_APPROVED. Nada foi aplicado, ativado ou publicado.**

O PRE anterior `4f68d404` falhou corretamente em `CONFIRM_PRE_DRIFT`; o auditor não instalou a cadeia de entregas. Todas as tentativas desta reconciliação foram preservadas em `evidence/posplans-reconciliation-20261108-attempt*`, inclusive as falhas.

## Evidência LIVE fornecida

- `live-catalog-guards-20261108.sql.capture`: seis corpos reais fornecidos pelo proprietário para a produção canônica relatada `swzpzcwiasxmjutrmvkm`.
- `live-catalog-guards-20261108.json`: SHA256 `8e7c2859843d6f4eb39e09e37d49be19c16a8a0c8c530b61ab6cbf26ebe4addb` e MD5s medidos por `pg_get_functiondef` em PostgreSQL 17.11 descartável.
- Esclarecimento aceito como fato relatado: nenhuma das 114 funções alteradas é diretamente redefinida pelos cinco instaladores.

## Resultado final — attempt 10

- Fresh rehearsal logístico: **38/38**, exit 0.
- Parciais/revogação/concorrência: **13/13**.
- Endpoint/leitor: **15/15**.
- UI integrada **21/21**, candidata **13/13**, compatibilidade OS **73/73**; typecheck e build OK.
- Seis guards LIVE e oito ACLs restritas preservados antes/depois e após rollback.
- Histórico preservado; gates e writers fechados após rollback deny-only.
- B4/fiscal: **NOT_RUN_OUT_OF_SCOPE**. As tentativas 7/8 preservam `B4_PRE_SHARED_BODY` sem enfraquecer o PRE.

A baseline restrita usa o schema mínimo de apresentação já declarado, os seis corpos capturados e dependências geradas por fontes canônicas. A migração ampla não foi reaplicada. Claims sintéticos completos foram necessários porque o fence atual valida `role`, `sub`, `iat` e `exp`; nenhum fence foi desabilitado.

O rollback da confirmação é composto: exige o estado integral medido após os rollbacks posteriores e executa somente REVOKE. Isso corrige a comparação isolada que incluía funções de estágios futuros sem aceitar estado arbitrário.

## Pacote para revisão

`../production-rollout-posplans-20261108/`

- 23 arquivos rastreados.
- Manifesto SHA256: `7fc669b8d5402c025b19daf8575aa8227e04ca4de9641d383343115485aaf8c2`.
- Ordem: PRE READONLY → confirmação → envio → físico OFF → logística OFF → leitor/endpoint OFF.
- Rollbacks em ordem inversa, deny-only.
- Planos `cc1f6cc…`, B4, ponte fiscal, NF/NFS-e, recebíveis, pagamentos, comunicação, publicação e ativação automática estão excluídos.

O auditor deve revisar independentemente os hashes e executar o PRE somente em `swzpzcwiasxmjutrmvkm`. Qualquer instalação futura exige autorização específica. PostgreSQL descartável e testes locais não provam JWT/RLS/Storage/hosted nem liberam operação real.
