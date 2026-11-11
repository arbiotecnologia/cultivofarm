# Correção: enum `status_entrega` em `fn_fiscal_invoice_eligibility` (somente espelho)

Status: REVIEW_ONLY — nada aplicado em produção, nada publicado.

## Espelho fiscal completo (commit 851b14f9, manifesto final-manifest-20261110.json)
- Fonte: `git archive 851b14f9af3455a2f1215eefb448ef201ddf57a5 scripts` em /tmp/r851; executado
  `NEW_E2E_BUILD_FORECAST=1 NEW_E2E_TIMEOUT=900 python3 scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/rebuild_current.py`
  (mesmo harness/ordem do manifesto da tentativa 218). Resultado: attempt-221, exit 0, 57/57 PASS.
- Único desvio na cópia temporária: gancho de medição + pg_dump antes do cenário de duas NFs (`evidence/fullstack-attempt-221/mirror-hook.diff`).
- Hashes medidos no espelho = LIVE informados pelo auditor (`audit-20261111-live-hash-compare.json`):
  apply_authorization 766fb81a…, bridge 9b14fa08…, allocate cc539ca8…, reconcile_fiscal_v1(uuid,uuid) f8f3b5e5…;
  índice b2b_one_title_per_document(b2b_document_id) e PK alocação(document_id); b4_order_condition_snapshots presente.

## Defeito
`coalesce(ent.status,'')` com `ent.status` do tipo enum: o literal `''` é convertido para enum e falha
(`invalid input value for enum status_entrega: ""`) em TODA chamada com origem ENTREGA encontrada.
Ocorre no overload `(text,uuid)` (md5 6b3dde2b…); o `(text,uuid,uuid)` (c920cc8f…) delega a ele e herda o erro.
Reproduzido no espelho completo com os hashes LIVE acima. O MD5 de produção destas duas sobrecargas NÃO foi medido:
o PRE fixa 6b3dde2b…/c920cc8f…; se divergir, aborta.

## Correção (3 âncoras, candidato 4d37996a…)
`ent.status::text` nas duas comparações e na mensagem. Nada mais muda.

## Arquivos
- `01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback.sql.review` (exigem `SET fiscal_elig_fix.review_project_ref='swzpzcwiasxmjutrmvkm'`)
- `generate.py` (`--verify`), `candidate.sql`, `candidate-md5.json`, `live-capture/`, `test_pg.py`, `SHA256SUMS`

## Teste
Banco descartável restaurado do pg_dump do espelho completo; `python3 test_pg.py` → `evidence/attempt-001`: 74/74 PASS.
Cobre: reprodução antes (2 e 3 args); PRE/drift ACL; install sem ref; reinstalação aborta; POST; 3-arg, ACL e as 4 rotinas fiscais intocadas;
12 entregas concluídas (9 parciais de pedidos com >1 entrega) sem NOT_COMPLETED; 3 canceladas negadas; `separado`/`em_rota` negadas
(estado criado só em transação revertida com triggers em réplica — costura declarada); inexistente; anon e ator sem empresa negados;
origem PARTNER_ORDER idêntica antes/depois em todos os pedidos; rollback exato, reinstalação e rollback final.
Auth por claims SQL é sintética: não prova JWT/RLS/Storage.

## Cobertura fiscal parcial no espelho (attempt-221) e o que NÃO foi executado
Executado pela composição (pedido de controle elegível, NFs sintéticas inseridas e autorizadas pelo callback H13 real):
duas NFs parciais de R$9 (total 18), um título por NF com IDs distintos, previsão residual 18→9→0 (`faturado_total`),
replay concorrente da NF1 (um documento/título), corrida das duas últimas NFs (um título + um close-pending explícito por
FISCAL_QUANTITY_OVERALLOCATED), segunda intenção negada, pagamento 9 com replay, rollback deny-only preservando histórico e 38 gatilhos.
NOT_RUN: variante 2×R$10 (20→10→0) com o pedido PB-like, vencimentos por emissão, revenda 1+1 dentro desta composição e
negativa C2 nesta composição — exigem nova fixture neste espelho; não alegados.
