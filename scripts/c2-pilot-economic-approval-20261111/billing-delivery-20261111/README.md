# Faturamento parcial + entrega — PB-001042 (somente espelho; nada instalado)

Bateria: `test_billing_delivery_pg.py` (+ `positive_control.py`, `positive_delivery.py`, `positive_fiscal.py`, executados em sequência).
Base: espelho do estado reportado de produção (Vendedor 02a–02d, catálogo 6b56cfb1) + piloto `../02-install.sql.review`/`05` com SHA conferido.
Auth por claims SQL (sintética, com `exp`): não prova JWT/RLS/Storage hospedados.

## Comandos
```
rm -rf /tmp/pb && mkdir -p /tmp/pb/proj && cp -r scripts /tmp/pb/proj/ && rm -rf /tmp/pb/proj/scripts/vendedor-role-20261111/writers-20261111/evidence/measure
(cd /tmp/pb/proj && python3 scripts/vendedor-role-20261111/writers-20261111/measure_live.py)   # gera /tmp/vendedor-mirror.dump
cd scripts/c2-pilot-economic-approval-20261111/billing-delivery-20261111 && python3 test_billing_delivery_pg.py
```
Evidência vigente: `evidence/attempt-011` (exit 0; 75 verificações: 52 PASS, 0 FAIL, 23 INFO/BLOCKED). `executed.json` traz SHA dos scripts e dos arquivos do piloto executados, costuras e achados.

## Histórico de tentativas (preservado)
001–002 falha de asserção do teste (`CONSULTATION_NOT_AUTHORIZED` contém "AUTHORIZ"); 003–006 construção incremental do controle;
004/005 entrega exige linha reservada inteira (`DELIVERY_RESERVATION_NOT_OWNED`) ⇒ parcial 1+1 = duas reservas de 1;
007 replay de agrupamento com argumentos diferentes (`DELIVERY_REPLAY_CONFLICT`, correto); 008 claims sem `exp` ⇒ `tenant_catalog_fence_denied` na conclusão da OS (defeito do harness, não do produto); 009 coluna `quantidade_entregue`; 010–011 etapa fiscal.

## Costuras (configuração/evidência, nunca resultado)
S0 gate global de previsão OFF; S1 plano "Sob consulta TESTE" adotado por A; S2 configuração fiscal desativada só na criação do PB;
S3 gates de logística/produto acabado ligados + concessões exatas; P1 controle = pedido normal `C2_EXTERNAL_ORDER_ORIGIN_V1` (não é o PB);
P2 gate de criação de previsão + concessão exata do controle; P3 linha em `storage.objects` para o comprovante; P4 concessão de reserva re-apontada à linha devolvida.

## Conclusões
- PB C2 pendente contábil, com as duas aprovações explícitas e previsão 20: aprovação LIVE, crédito LIVE, título por pedido, OS de revenda (mesmo com concessão exata), RPCs fiscais de serviço e transição da previsão negados; status direto negado; previsão, NF=0, títulos=0 e pedido byte-idênticos — inclusive depois de validar a contabilidade da emitente (snapshot C2 imutável: **não há transição formal C2 → validado**; BLOQUEIO preservado).
- Controle: compra → lote próprio → OS revenda → 2 reservas → entregas 1+1 (replay, concorrência em 2 conexões, excesso negado, FSF negado, rollback de compra) passam; pedido só fica `entregue` na 2ª.
- **Integração pós-autorização não existe nas rotinas efetivas**: `rpc_fiscal_invoice_apply_authorization_v1` (service-only) altera só a NF; a transição da previsão aceita apenas `EMISSION_*`/`CONSULTATION_NOT_AUTHORIZED` e nenhuma rotina reduz residual; título B2B é único por pedido (`ux_ar_one_active_per_b2b_order`) e nasce por status do pedido; `b2b_allocate_document` (B4) não está instalado.
- Rascunho de NF normal é `MANUAL_RECORD`, sem vínculo pedido/origem e exige `customer_id`; entregas B2B não têm cliente ⇒ rascunho e título por entrega inalcançáveis. Título por pedido nega `B2B_PAYMENT_METHOD_NOT_CONFIGURED`.
- `fn_fiscal_invoice_eligibility('ENTREGA',…)` falha com `invalid input value for enum status_entrega: ""` (achado fiscal; não alterado por instrução).
- Positivo NF autorizada → 2 títulos/residual 20→10→0/datas pela emissão: **BLOCKED (transição não suportada)**, não simulado.

Sem correção de produto ⇒ sem PRE/INSTALL/POST/rollback.
