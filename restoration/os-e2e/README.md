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

## Fase 6 — harness complementar de perfis + determinismo do CQ

`32-perfis-cq-20260901.sql` (transacional, BEGIN/ROLLBACK, guard staging `ikaauvsflpmamgxmkhoq`):

- P01/P02 — nenhum EXECUTE para `anon`/`PUBLIC` nos 13 motores sensíveis da OS.
- P03/P04 — `vw_os_integridade_esteira` sem `anon`; `authenticated` apenas `SELECT`.
- P05 — todas as SECURITY DEFINER auditadas com `search_path = public, pg_temp`.
- P06/P09 — perfis `gestor` e `producao` operam dentro do escopo previsto.
- P07/P08 — `operador_onfarm` não cruza OS de origem manual; usuário sem role é negado.
- C01–C03 — `controle_qualidade.seq` monotônica; `fn_cq_ultimo_resultado` desempata
  `created_at` idêntico e permanece estável após UPDATE (ctid alterado).
- C04 — CQ reprovado mais recente bloqueia o envase.

Resultado: **13/13 PASS**, ROLLBACK sem resíduo. Nenhuma migration nova foi necessária.

## Fase 6 FINAL — auditoria independente e certificação (retomada)

Alvo exclusivo: staging `ikaauvsflpmamgxmkhoq` via `staging-psql.sh`/`$STAGING_DSN`.
Produção `navfzbwgwzruipouyfnk` não acessada. Sem publish, sem SEFAZ.

### Correções incrementais aplicadas
- `16-migration-20260902000000_os_guard_marker_canonico.sql` (+ cópia em
  `supabase/migrations/`): cria `public.fn_os_assert_staging_exato()`, guard
  canônico por MARKER EXATO (`_fiscal_staging_marker` = STAGING /
  ikaauvsflpmamgxmkhoq) que remedia a ausência de marker exato no guard
  estrutural da migration `20260831000000_os_e2e_fase5_idempotencia.sql`
  (não reescrita). PUBLIC/anon revogados; EXECUTE apenas para `service_role`.
  Postcheck OK.
- `96-rollback-20260902000000.sql`: rollback exato, ensaiado em BEGIN/ROLLBACK
  (função ausente após o drop, restaurada pelo rollback da transação).
- `ctid` como ordem do CQ: **eliminado**. Nenhuma função em `public` referencia
  `ctid`; a ordem canônica é `created_at DESC, seq DESC` via
  `fn_cq_ultimo_resultado` (migration `20260901000000_cq_ordem_canonica.sql`).

### Evidências
- Harness `31-e2e-fase5-20260831.sql`: **35/35 PASS**, ROLLBACK sem resíduo.
- Harness `32-perfis-cq-20260901.sql`: **13/13 PASS**, ROLLBACK sem resíduo.
- ACL/RLS: anon=0 e PUBLIC=0 nos 13 motores sensíveis; `pg_temp` em todas as
  SECURITY DEFINER auditadas; `vw_os_integridade_esteira` sem anon e só SELECT
  para authenticated.
- Órfãos/consistência: `cq_sem_lote=0`, `cq_seq_nulo=0`, `mov_qtd_negativa=0`,
  `estoque_negativo=0`, `reserva_maior_que_saldo=0`,
  `os_finalizada_sem_entrega_confirmada=0`. Resíduo legado conhecido e não
  tocado: `entregas_sem_os=4` (agosto/2026) e `lotes_sem_programacao=1`.
- Regressão: `tsgo --noEmit` limpo; Vitest **2776 passed / 4 skipped**; build PASS.
- `src/integrations/supabase/types.ts` (21.850 linhas) e `.env` realinhados ao
  staging após reset automático do ambiente.

### Pendência
- Playwright real segue bloqueado: `E2E_ADMIN_USER`, `E2E_ADMIN_PASSWORD`,
  `E2E_BASE_URL` = MISSING.

Veredito: **APTO_PARA_HOMOLOGACAO_BROWSER**.
