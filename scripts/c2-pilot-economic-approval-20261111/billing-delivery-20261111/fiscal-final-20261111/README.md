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

## r12 (attempt-220): r11 + fiscal-eligibility 02 (af435182) instalado ANTES do fluxo + recuperação fiscal a meio do pedido — 59/59 PASS
- 02: `scripts/fiscal-eligibility-delivery-enum-20261111/02-install.sql.review` revisão `af435182215e8a1c9c1e83e5951f501dfaa9cc1b`,
  SHA-256 `18275b2793c92c613b9cc5625b2564adecd17b125e210e823bb93802d6c9b001` (verificado no gancho; 03 POST exit 0).
  `fn_fiscal_invoice_eligibility(text,uuid)` 6b3dde2b… → 70dba088…; `(text,uuid,uuid)` c920cc8f… inalterada. Costura: GUC `review_project_ref` na sessão do espelho.
- Recuperação: NF1 normal → residual 10. Callback H13 real da NF2 (910) dentro de BEGIN…ROLLBACK (dentro da tx: AUTHORIZED, 1 título, residual 0).
  Nova conexão: 1 título d88fa0e2…, 1 parcela 9cf3c4f4… R$10, 1 FISCAL_CONFIRMED, residual 10, NF2 sem título/alocação, DRAFT/PENDING — idêntico ao antes.
- Reprocessamento (callbacks concorrentes 910/920): 920 vence, 910 close-pending; reenvio explícito NF1 e NF2 autorizadas: mesmos títulos
  {d88fa0e2…, 076b87cb…}, mesmas parcelas {9cf3c4f4…, 565f5879…}, totais 10+10, 2 eventos FISCAL_CONFIRMED, residual 0.
- Pedido e11dd06e…, previsão 7f7f7d24… 20→10→0; emissões 2027-02-01/02-02, vencimentos 2027-03-03/03-04; revenda 1+1 → `entregue`.
- attempt-219: falha do meu gancho de teste (coluna `amount` inexistente; correta `original_amount`), preservada em `evidence/r12-attempt-219-harness-failure/`. Nenhum código de runtime alterado.
- Diff: `harness-diff/r12-vs-r11.diff` (+ arquivos executados `r12-*.py`).

## Negativa C2 attempt-002 (sobre dump r12 com 02 af435182 + Vendedor 02a–02d + piloto 01/02/03/05) — 16 PASS, 0 FAIL
Mesmos resultados da attempt-001: comercial/crédito/recebível negados `C2_ACCOUNTING_PENDING`, elegibilidade fiscal inelegível, sync
`B2B_FORECAST_FISCAL_SOURCE_UNPROVEN`, NF sintética autorizada fica DRAFT/close-pending, zero título/alocação, residual 20.
Entrega: nenhuma OS/entrega existe para o PB (impressão digital inalterada); criação de entrega não foi tentada nesta rodada.

## Negativa C2 v2 — attempt-006: 20 PASS, 0 FAIL (espelho isolado do dump r12, SHA-256 f595c0b9…)
- `prep_restore.sh`: restauração pre-data → data → **S-AUTH** (10 usuários fictícios de profiles/user_roles em auth.users) → post-data,
  tudo com `--exit-on-error` (zero erros); `profiles_user_id_fkey` e `user_roles_user_id_fkey` presentes e `convalidated=true`
  (`evidence/attempt-006/prep/`). Substitui a restauração da attempt-002 (2 FKs não criadas).
- `c2_negative_fiscal_final_v2.py`: os 16 checks originais + 4 de entrada logística (ponto real `rpc_b2b_resale_os_create_v1`, pré-requisito de toda entrega de revenda):
  1. estado contido: endpoint sem EXECUTE para authenticated (`permission denied`);
  2. **S-OS** (somente em transações revertidas, idênticas para PB e controle: GRANT do os_endpoint + gate + concessão `os_create` exata do piloto):
     PB negado `PT409 B2B_RESALE_ORDER_CONFLICT` (status `em_analise_comercial` ≠ `aprovado`, CAS com updated_at atual), repetição idem;
  3. controle positivo, mesmo ator 00…024: pedido aprovado sem OS 77b2c9a1… cria 1 OS dentro da transação (revertida, 0 persistida);
  4. nova conexão: PB e global inalterados — residual 20, títulos/parcelas, OS, entregas, movimentos e saldo de estoque (`effects.json`); gate OFF e ACL restaurados.
- Tentativas 003–005 preservadas (falhas do roteiro de teste/contenção do piloto antes de controle equivalente; ver NOTE.txt).
- Defeito real: nenhum. Observação: o código de negativa é o conflito genérico do endpoint, não um código C2 específico.
