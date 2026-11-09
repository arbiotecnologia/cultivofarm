# Tentativas 09 (corpos históricos) e 10 (corpos LIVE atuais cc1f6cc) — negativa pós-revogação/aposentadoria reforçada

Hook sha256 e4148f9f…ee1f48; live_bodies sha256 728b6619…e6f9.
Replay pós-revogação e pós-retire: cart_hash VÁLIDO capturado ANTES da operação, NOVA chave; PASS exige exatamente
`ERROR:  payment_condition_unavailable` e contagens partner_orders/b2b_order_condition_snapshots/partner_order_idempotency iguais antes/depois.
- 09: ambos PASS (rc 3, erro esperado, deltas zero). Harness 300/300 — mas sobre corpo histórico c34e7404…, não prova de produção atual.
- 10: ambos PASS com writers md5 = LIVE (fe82f538… / e86385fe…). Harness 276/291: permanecem as falhas da tentativa 08
  (planos compartilhados entre tenants na fixture => plan_not_found / payment_choice_required; rollback B3 04 obsoleto frente ao publish LIVE).
Veredito 81: NÃO APROVÁVEL até corrigir a fixture por empresa e reexecutar com corpos LIVE. Pacote A: backend instalado pelo auditor
(order_attempt_status_readonly_reviewed_20261109) — não reinstalar; frontend não publicado.
