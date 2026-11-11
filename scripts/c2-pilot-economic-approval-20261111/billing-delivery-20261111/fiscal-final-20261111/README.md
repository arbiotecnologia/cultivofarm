# Faturamento parcial 2×R$10 + revenda 1+1 + negativa C2 na composição fiscal final (espelho)

Base: scripts de `851b14f9` (`git archive`), `rebuild_current.py` com `NEW_E2E_BUILD_FORECAST=1` (mesmo harness da 218/221).
Hashes medidos em cada execução = LIVE do auditor (apply_authorization 766fb81a, bridge 9b14fa08, allocate cc539ca8,
reconcile f8f3b5e5, índice b2b_one_title_per_document, PK alocação document_id) — `evidence/*/audit-20261111-live-hash-compare.json`.

## Execuções (todas preservadas)
| execução | mudança de entrada | resultado |
|---|---|---|
| 221 (baseline, pacote fiscal-eligibility…) | nenhuma (9+9) | 57/57 |
| r10 attempt-222 | `discount_percent=10→0` no plano P3 antes do pedido; asserções 9/18→10/20 | 57/57 |
| r11 attempt-222 | r10 + reserva/grupo/confirmação 1+1 no mesmo pedido | 58/58 |
Uma primeira tentativa r10 foi interrompida antes do fim para corrigir nomes de coluna da captura (sem resultado).
Diffs exatos contra 851b14f9: `harness-diff/r10.diff`, `harness-diff/r11.diff` (+ cópias dos arquivos executados).

## r11: pedido de teste 7f97da3b-5313-4f95-84a5-71e91088e18f (total 20, sem desconto)
- Previsão 3247d21a…: 20 → NF1 00…0900 R$10 (emissão 2027-02-01) → residual 10 (`faturado_parcial`) → NF2 00…0920 R$10 (2027-02-02) → 0 (`faturado_total`).
- Títulos: 742b3feb… (doc 0900, 1 parcela 69b17b6d… R$10, venc. 2027-03-03); 8c184905… (doc 0920, 1 parcela 8c336cef… R$10, venc. 2027-03-04). Vencimento = emissão + 30 dias.
  Ambos caem em dias úteis: nenhum ajuste de calendário foi exercitado (calendário Paracatu-MG sem fonte versionada continua pendente).
- Replay: NF1 por duas autorizações simultâneas → 1 documento/1 título; NF2 e NF 0910 concorrentes → 1 título + 1 close-pending (FISCAL_QUANTITY_OVERALLOCATED), 2ª intenção negada; replay concorrente final com um título; pagamento 10 com replay.
- Revenda 1+1: entrega 1412ba5d… (1 emb.) confirmada + replay, pedido segue `aprovado`; 2ª entrega a0a1012e… (1 emb.) confirmada → pedido `entregue`; 1 movimento de expedição por entrega; cancelamento separado devolve estoque.
- Rollback composto deny-only, histórico preservado e 38 gatilhos íntegros (checks do harness).
- NFs são documentos sintéticos; autorização pelo callback H13 real. Nada em produção.

## Negativa C2 na composição fiscal final (`c2_negative_fiscal_final.py`, evidence/attempt-001: 16 PASS, 0 FAIL)
Banco: dump r10 + Vendedor 02a–02d (catálogo reconciliado 6b56cfb1) + piloto 01/02/03/05 (SHA conferidos).
Pedido PB-like 04055430… criado pelos writers (quote_only, cotado R$10, 2 embalagens, total 20, C2 pendente contábil, snapshot nulo).
Duas aprovações explícitas → previsão 20/20. Negados sem efeito: approve_partner_order, approve_b2b_credit, generate_b2b_receivable_secure;
elegibilidade inelegível; sync da emissão `B2B_FORECAST_FISCAL_SOURCE_UNPROVEN`; NF sintética R$10 com retorno autorizado (e replay)
→ `FISCAL_AUTHORIZATION_CLOSE_PENDING`, NF fica DRAFT, zero título, zero alocação, residual 20, nenhum FISCAL_CONFIRMED.
Costuras: S0 gate OFF, S1 plano COT adotado, S2 config fiscal desativada só na criação, S3 documento NF sintético. Requer `c2neg_db.py` em `/tmp/c2neg/db.py`.
Auth por claims SQL é sintética: não prova JWT/RLS/Storage.
