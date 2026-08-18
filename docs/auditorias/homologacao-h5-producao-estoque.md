
## H5b — Reserva atômica e idempotente (staging ikaauvsflpmamgxmkhoq)

- **H5-001 (P1) corrigido**: `rpc_estoque_reservar_v1` passa a reservar todas as
  embalagens em uma única transação, com chave de idempotência obrigatória,
  `FOR UPDATE` e advisory locks por chave e por OS. `reservar_estoque_item`
  ficou fail-closed por papel, sem grants a `PUBLIC`/`anon`.
- **H5-002 (P1) corrigido**: o contexto do ledger era herdado de motores que o
  abriam e não o fechavam na mesma transação (ex.: envase), fazendo a reserva
  gravar `acao='entrada'` e `idempotency_key = NULL` — o que anulava a detecção
  de replay. Agora a reserva impõe o próprio contexto (`fn_estoque_ctx_force`)
  e o fecha inclusive em erro.
- **Frontend**: `ReservarEstoqueDialog` deixou de fazer laço item a item; envia
  uma chamada única com chave estável por abertura do diálogo
  (`useEsteiraLaboratorio.reservarEstoqueLote`).
- **Evidência**: `restoration/homologacao-h5/32-h5-postcheck.sql` — **12/12 PASS**
  (`PASS_H5_POSTCHECK`), transacional com ROLLBACK e zero resíduo. Cobre ACL de
  `anon`, `search_path`, chave obrigatória, negativa acima do saldo, reserva
  atômica, replay sem duplicar, rastreabilidade causal, cancelamento único e
  ausência de saldo negativo.
- **Migrations**: `20260911000000_h5_reserva_atomica_idempotente.sql`,
  `20260912000000_h5b_ctx_reserva_forcado.sql`. Produção `navfzbwgwzruipouyfnk`
  intocada.
- **Regressão**: typecheck OK, Vitest **3105 passed**, baseline `c75bb87f` de
  `.env`/`types.ts` conferida.

**GATE: H5 — APROVADA.**
