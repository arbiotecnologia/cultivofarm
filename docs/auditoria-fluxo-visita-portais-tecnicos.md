# Auditoria — Fluxo de atendimento nos portais técnicos (correção pós-auditoria)

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção (`navfzbwgwzruipouyfnk`) não foi acessada.
Harness runtime: `supabase/functions/visita-atendimentos-runtime-harness` (usuários Auth efêmeros reais, criados e removidos na execução).

## Resultado da última execução

**15 PASS · 0 FAIL · 1 BLOCKED (16 gates)** — run `bdff6ec1`.

## Defeitos P0/P1 e disposição

| ID | Achado | Correção | Evidência |
| --- | --- | --- | --- |
| P0-1 | Solicitação sem cultura falhava | Motor aceita cultura nula em `solicitacao_produtor`/`ocorrencia_campo`, resolve pela safra ativa quando inequívoca e devolve `missing_fields`/`next_step` | T4 |
| P0-2 | Listagem `STABLE` escrevia (`CREATE TEMP TABLE`) | Reescrita como CTE/`UNION ALL` puramente relacional | T2, T3 |
| P0-3 | Offline usava INSERT direto | `useOfflineSync` só aceita `create_technical_visit` (contrato canônico `p_*`); ausência de `operationType` é recusada; caminho legado apenas para pendências antigas | T7 |
| P0-4 | Guard não fail-closed | Guard exige marker `STAGING` **e** `project_ref` esperado, recusa o ref de produção e aborta se o marker não existir — em migrations, rollback e verify | T1 |
| P0-5 | Rollback destrutivo/incompleto | `rollback.sql` reescrito: não remove `origem_atendimento`, restaura o comportamento anterior do motor via `CREATE OR REPLACE` (assinatura, grants, owner e `search_path` preservados); `verify-restoration.sql` valida V1–V7 com checksum SHA-256 | T10 (execução via psql fora do harness) |
| P1-1 | Depuração exposta | IDs e logs removidos de `MobileRegistrarOcorrencia` | — |
| P1-2 | Workspace sem campos prometidos | Listagem e cartões passam a trazer cultura, urgência, responsável, SLA (`data_prevista`) e `proxima_acao`; resumo ganhou o total `todos` | T2, T6 |
| P1-3 | Falha parcial de mídia invalidava a visita | Upload com falha não bloqueia; a mídia é reenfileirada. Referência idempotente por `client_uuid` (UUID determinístico por índice) | T9 |
| P1-4 | Relatório ausente | Este documento | — |

## Defeitos adicionais encontrados **pelo próprio harness** (não previstos na auditoria)

1. Listagem e resumo referenciavam o status inexistente `ajuste_solicitado` → a listagem falhava para **todos** os perfis técnicos. Corrigido nos três pontos (listagem, resumo, motor).
2. Resumo contava OS por `ordens_servico.registro_consultor_id`, coluna inexistente → resumo quebrado. Passou a usar `ordens_servico_onfarm`.
3. Resolução de cultura usava função de janela em `HAVING` (SQL inválido) → criação falhava. Reescrita com CTE.
4. `is_visit_responsible` comparava `consultor_profile_id` (id de perfil) com `user_id` → **o técnico não enxergava a própria visita**. Agora aceita responsável, criador e perfil do usuário; o motor grava `consultor_profile_id`.
5. Índices únicos de mídia eram **parciais**, impedindo `ON CONFLICT (client_uuid)` → o upsert idempotente falhava. Substituídos por índice único simples.

## Matriz de gates

| Gate | Descrição | Status |
| --- | --- | --- |
| T1 (C1) | Guard fail-closed comprovado no runtime | PASS |
| T2 (C2) | Listagem executa para consultor técnico | PASS |
| T3 (C3) | Listagem executa para técnico agrônomo | PASS |
| T4 (C2b) | Aba inválida devolve `invalid_tab` (sem lista vazia silenciosa) | PASS |
| T5 (C2c) | Resumo coerente com total `todos` | PASS |
| T6 (C4) | Demanda sem cultura abre rascunho com `missing_fields` e `next_step` | PASS |
| T7 (C5) | Disputa entre dois técnicos: 1 visita e 1 evento de timeline | PASS |
| T8 (C6) | Ocorrência online idempotente, visível na aba e com projeção ampliada | PASS |
| T9 (C7) | Replay offline pela RPC canônica preserva origem, diagnóstico e GPS sem duplicar | PASS |
| T10 (C8a) | Produtor recebe `forbidden` na listagem técnica | PASS |
| T11 (C8a-w) | Produtor não cria visita | PASS |
| T12 (C8b) | Perfil sem vínculo recebe `forbidden` | PASS |
| T13 (C8b-w) | Perfil sem vínculo não cria visita | PASS |
| T14 (C9) | Referência de mídia idempotente; visita preservada em falha parcial | PASS |
| T15 (C11) | Motor único sem overload ambíguo | PASS |
| T16 (C10) | Rollback + verify com checksum | **BLOCKED** |

## Ressalva aberta (T16)

`restoration/visita-portais-tecnicos/rollback.sql` e `verify-restoration.sql` são forward-safe, transacionais, guardados por fail-closed e não destrutivos, mas sua execução exige `psql` com credenciais de staging fora do escopo do harness. **Não executados.**

## Situação

**🟡 APTO COM RESSALVA** — não declarado apto pleno enquanto T16 não for executado manualmente em staging.
