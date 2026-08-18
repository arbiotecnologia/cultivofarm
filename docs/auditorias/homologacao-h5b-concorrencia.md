# H5b — Correção de concorrência e imutabilidade de CQ

**Ambiente:** staging `ikaauvsflpmamgxmkhoq` (exclusivo). Produção `navfzbwgwzruipouyfnk` não foi tocada.
**Migration aplicada:** `supabase/migrations/20260913000000_h5b_concorrencia_cq_imutavel.sql`
**Kit:** `restoration/homologacao-h5/34..37`

## Bloqueadores corrigidos

| ID | Descrição | Correção |
|----|-----------|----------|
| H5-B01 | Geração concorrente de OS a partir do mesmo pedido B2B podia duplicar OS/links | `pg_advisory_xact_lock(hashtext('generate_production_orders_from_partner:' \|\| pedido))` no início da função, serializando chamadas simultâneas; a segunda chamada retorna replay (`os_created=0`) |
| H5-B02 | Envases concorrentes podiam ultrapassar o volume produzido do lote (janela entre leitura e insert) | `fn_validate_envase_volume` passa a fazer `SELECT ... FROM public.lotes ... FOR UPDATE` antes de somar o envasado, cobrindo também inserts diretos via RLS |
| H5-B03 | Resultado final de CQ podia ser sobrescrito/excluído, apagando histórico | Gatilho `fn_cq_resultado_imutavel` bloqueia UPDATE material e DELETE de análises com `resultado` preenchido; reanálise exige NOVA linha. Bypass de manutenção `app.cq_purge_fixture` fechado para `anon`/`authenticated` |

## Evidência T10 — concorrência real (conexões paralelas)

Runner: `restoration/homologacao-h5/35-h5b-concorrencia.mjs` (Node + `pg`, duas conexões
independentes sincronizadas por relógio com `pg_sleep` para forçar sobreposição real).

```
=== H5B RESUMO: 19/19 PASS ===
PASS_H5B_CONCORRENCIA
```

Casos cobertos:

- **T10-A1..A5** geração concorrente de OS: nenhuma `unique_violation`, ambas as chamadas
  terminam com sucesso controlado, exatamente 1 OS e 1 link, replay não polui a timeline
  (1 evento `op_gerada` do motor; o segundo evento é do gatilho pré-existente de transição
  de status do planejamento, não do replay).
- **R1/R2** OS gerada fica programável automaticamente; pedido inelegível segue bloqueado.
- **T10-B1..B4** reserva de estoque concorrente: no máximo uma consome além do saldo, saldo
  nunca negativo (min=3, total conservado=10), chave idempotente repetida retorna `replay=true`
  e não acrescenta movimentação ao livro.
- **T10-C1..C2** envase concorrente: apenas um persiste, o outro falha com mensagem de overfill;
  total envasado ≤ volume produzido.
- **R3..R7** CQ: resultado final não sobrescrito, análise finalizada não excluída, reanálise
  cria nova linha, gate usa a última análise (`created_at DESC, seq DESC`), reprovação
  posterior volta a bloquear envases.
- **T10-Z** zero resíduos de fixtures após teardown.

## Postcheck estático

`restoration/homologacao-h5/37-h5b-postcheck.sql` → **7 PASS / 0 FAIL** (`PASS_H5B_POSTCHECK`).

## Higiene de dados

`restoration/homologacao-h5/36-h5b-purge-fixtures.sql` remove resíduos com prefixo `H5B-`.
Os gatilhos append-only/anti-delete são desabilitados **apenas dentro da transação de
manutenção** (papel `postgres`, dono das tabelas) e reabilitados antes do `COMMIT`; o guard
de ambiente aborta fora do staging.

## Validações locais

- Baseline `.env` e `src/integrations/supabase/types.ts` = staging (`c75bb87f`), sem drift.
- Vitest e build de produção executados ao final desta fase (ver resumo da conversa).

## Gate

**H5b — APROVADA.** H6 não iniciada.
