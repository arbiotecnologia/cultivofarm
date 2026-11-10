# Complemento 03:23 — resultado parcial, NÃO GO

Somente PostgreSQL 17.11 descartável por socket Unix, restaurações integrais novas; nenhum SQL hospedado, publicação, emissão, cobrança ou envio. A prova 184 permanece histórica, não certifica os candidatos atuais.

## Alterações candidatas

- SYNC/CANCEL exigem READ COMMITTED, duas features canônicas e operações exatas no piloto existente antes/depois dos locks. Instalação sem concessões lifecycle; rollback revoga concessões sem apagar histórico.
- Início canônico candidato reserva EMISSION_STARTED na mesma transação da transmissão e preserva replay antes da reserva nova. Consulta protocolar candidata grava vínculo privado imutável ao evento de timeout, versão da previsão, emissão, NF e XML. Não usa created_at+UUID como causalidade.
- Grant dos helpers privados não foi ampliado. Vocabulário da allowlist foi estendido por constraints pinadas; registros físicos históricos são preservados.
- Constatação READONLY de produção sobre ausência de feature/gate nos helpers c2p1 foi fornecida pelo auditor, NÃO consultada pelo agente. Rótulo INACTIVE não é barreira operacional.

## Execuções preservadas

Evidências: `order-e2e-new-20261108/evidence/attempt-N/run.stdout.txt`, `run.stderr.txt`, `run.exitcode`, `checks.json`.

| Tentativa | Exit | Falha observada |
|---|---:|---|
| 188 | 1 | ModuleNotFoundError do teste de contenção; import corrigido |
| 189 | 1 | 23514: mutação de concessões de outros canais violou shape; mutação restringida ao lifecycle |
| 190 | 1 | PT409 FISCAL_IN_FLIGHT no controle positivo CANCEL; controle agora liquida transmissão via callback em rollback |
| 191 | 1 | P0001 FISCAL_PRODUCTION_ENDPOINT_BLOCKED no BEGIN da consulta: marcador ausente na restauração metadata-only |
| 192 | 1 | 23514 environment_label_check no marcador sintético; label corrigido para STAGING, ainda não reexecutado |

191 completou 48 verificações de contenção em `lifecycle-containment.json`: feature pedidos_b2b/contas_receber, gate, concessão revogada/expirada, referências divergentes, leitura não autoriza lifecycle, controles exatos em rollback e revogação real durante espera de papel, tenant, features e piloto. REPEATABLE READ nos dois wrappers foi negado antes dessas verificações. Auth SQL é sintética, não JWT hospedado.

31 estáticos passaram no espelho; não aprovam cadeia. Artefatos gerados nesse espelho ainda NÃO foram promovidos sobre os SQL históricos do repositório, para evitar apresentar pacote final não validado. Fonte modificada e SQL antigo não devem ser instalados como conjunto.

## Pendências deste candidato

Reexecutar correção STAGING; verificar origem fiscal/causalidade, 215/106/280 e guard imutável, corrida das duas intenções antes SYNC, begin×cancel ambos commits, estrangeiro sem espera, drift ACL executado, 18/9/9, parceiro747→738, pagamento9, callback tardio, preservação dos 38 gatilhos e rollback integral. Nenhum PASS novo desses cenários é declarado.

Leitor `rpc_receivable_money_projection_v1`: fonte candidata `financial-price-generator-20261029/integration/origin.sql.review` revoga authenticated explicitamente. Diagnóstico de catálogo/ator foi adicionado ao ensaio, mas não alcançado nas tentativas novas; positivo continua BLOCKED, sem grant e sem leitura owner como substituto.

Estado: **REVIEW_ONLY_INACTIVE_NOT_APPROVED**.