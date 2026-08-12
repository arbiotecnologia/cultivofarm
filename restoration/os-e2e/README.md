# Fluxo completo da OS AR Bio — reconciliação e certificação E2E

Ambiente autorizado: **staging `ikaauvsflpmamgxmkhoq`**.
Produção `navfzbwgwzruipouyfnk` **proibida**. Sem publish. Sem transmissão SEFAZ.

## Artefatos

| Arquivo | Papel |
|---|---|
| `staging-psql.sh` | Conexão psql ao staging via `STAGING_DSN` (nunca imprime a DSN) |
| `10-migration-20260829000000_os_e2e_reconciliacao_entrega_cq.sql` | Motor de entrega, CQ determinístico, `search_path`, revogação de `anon` |
| `20-postcheck-20260829000000.sql` | Postcheck da migration 20260829 |
| `10-migration-20260830000000_os_esteira_acl_hardening.sql` | Hardening residual de ACL/`search_path` (espelhado em `supabase/migrations/`) |
| `90-rollback-20260830000000.sql` | Rollback de contingência do hardening |
| `30-e2e-20260830.sql` | E2E determinístico do nascimento à finalização (transacional, termina em `ROLLBACK`) |

## Fase 0 — higienização

`src/routes/index.tsx` restaurado; `.env` e `src/integrations/supabase/types.ts` (21.850 linhas)
realinhados ao staging `ikaauvsflpmamgxmkhoq`.

## Fase 1 — reauditoria do que já estava aplicado

Confirmado ativo no staging: motor de entrega `fn_entrega_confirmar_engine_v1` /
`rpc_entrega_confirmar_v1`, ações canônicas de estoque (`expedicao`,
`cancelamento_reserva`, `entrada`), `pode_finalizar` exigindo entrega confirmada em
`vw_os_integridade_esteira`, e o gate servidor de CQ em
`rpc_validar_integridade_esteira` (bloqueia `enviar_envase` sem CQ aprovado).

## Fase 2/3/4 — hardening residual (migration 20260830000000)

Achados corrigidos, sem alterar regra de negócio:

1. `vw_os_integridade_esteira` concedia **todos** os privilégios a `anon` e escrita a
   `authenticated`. Reduzido a `SELECT` para `authenticated`/`service_role`; `anon` revogado.
2. `rpc_validar_integridade_esteira` (2 sobrecargas), `rpc_cockpit_metricas_v1/v2` e
   `rpc_bi_esteira_resumo` estavam sem `pg_temp` no `search_path`. Normalizados.

A migration é idempotente e **fail-closed**: aborta se o marcador de ambiente não for
`STAGING` / `ikaauvsflpmamgxmkhoq`, e aborta explicitamente ao detectar produção.

### Postcheck (4/4 PASS)

| Gate | Resultado |
|---|---|
| G1 view sem `anon` e sem escrita | PASS |
| G2 `pg_temp` em toda a superfície OS | PASS |
| G3 nenhum `EXECUTE` para `anon` na superfície OS | PASS |
| G4 sem resíduo de fixtures E2E no staging | PASS |

## Fase 5 — E2E determinístico (24/24 PASS)

`30-e2e-20260830.sql` cria fixtures, assume o papel `authenticated` do usuário real
(`request.jwt.claims` + `SET LOCAL ROLE`), percorre a escada completa e faz `ROLLBACK`
— nenhum dado permanece no staging (comprovado pelo gate G4).

Escada exercitada: `aberta → aprovada → programada → em_producao → em_cq → envase →
pronto_entrega → entregue → finalizada`.

| # | Gate | Resultado |
|---|---|---|
| T00 | fixtures | PASS |
| T01 | `rpc_programar_os_v1` leva `aberta` a `programada` | PASS |
| T02 | replay da programação idempotente | PASS |
| T03 | `assumir_producao` → `em_producao` | PASS |
| T04 | `rpc_cockpit_gerar_lote_v1` convergente | PASS |
| T05 | concorrência de lote: 1 lote por programação | PASS |
| T06 | `enviar_envase` **bloqueado** sem CQ aprovado | PASS |
| T07 | `enviar_cq` → `em_cq` | PASS |
| T08 | `aprovar_cq` duplicado gera 1 laudo | PASS |
| T09 | `enviar_envase` liberado após CQ | PASS |
| T10 | `rpc_cockpit_registrar_envase_v1` | PASS |
| T11 | replay por chave de idempotência não duplica estoque | PASS |
| T12 | movimentações usam apenas rótulos aceitos pelo CHECK | PASS |
| T13 | `concluir_envase` → `pronto_entrega` | PASS |
| T14 | `pode_finalizar = false` sem entrega confirmada | PASS |
| T15 | `rpc_cockpit_criar_entrega_v1` | PASS |
| T16 | replay de entrega não duplica | PASS |
| T17 | confirmação sem recebedor bloqueia (`COCKPIT_ENTREGA_RECEBEDOR_OBRIGATORIO`) | PASS |
| T18 | `rpc_entrega_confirmar_v1` conclui a entrega | PASS |
| T19 | baixa registrada com ação `expedicao` | PASS |
| T20 | estoque reservado → `expedido` | PASS |
| T21 | OS atinge `finalizada` | PASS |
| T22 | replay da confirmação idempotente (1 movimentação) | PASS |
| T23 | trilha de eventos da esteira (15 eventos) | PASS |

## Fase 6 — regressão

- `tsgo --noEmit`: limpo
- `vitest run`: **2776 passed**, 4 skipped (171 arquivos)
- `bun run build`: OK
- Binding de conexão: `.env` apontando para `ikaauvsflpmamgxmkhoq`; `types.ts` com 21.850 linhas

## Veredito

**APTO NO STAGING.** Fluxo da OS certificado ponta a ponta, com bloqueios fail-closed
(CQ antes do envase, recebedor na entrega, finalização apenas após entrega confirmada),
idempotência comprovada em todos os motores transacionais e superfície de ACL sem
exposição a `anon`. Promoção para produção permanece **pendente de autorização humana
explícita**.
