# Tentativa 34 — complemento de captura 09/11 (3 funções privadas)

exit 0 · harness 352/352 · CCR2 143/143 (PG 17.11 descartável). Guarda 81 **NÃO APROVADA**; correção do vendedor REVIEW_ONLY, pacote inalterado.
Nada hospedado/publicado/ativado; gates OFF.

Captura `live-exact-7/capture-3-20261109.json`: md5 do texto confere 3/3. Instaladas verbatim com ACL LIVE; md5/ACL no espelho = produção:
| Função | antes no espelho | LIVE = espelho depois | ACL |
|---|---|---|---|
| assert_b2b_partner_scope(uuid,uuid) | (cópia 29/10 do repo, mesmo md5) | f86f43f9… | postgres,service_role |
| c2_internal_order_target_reason(uuid,uuid) | stub c1c36de1… | 07d7c900… | postgres |
| h15_actor_organization() privado | 64e10608… (já igual) | 64e10608… | postgres,authenticated,service_role |

Todos os resultados das tentativas 29/33 se mantêm com os corpos reais (revogado negado, alvo fora da carteira, vendedor dono, negativas e locks).
Ainda sem confirmação 09/11: b2b_commercial_context (2f1063f0…, 29/10), c2_producer_links (881cdf48…, 29/10), resale_pilot_delivery_scope_v1 (pin POST62),
ACL do respond, demais itens de `attempt-29/capture-request-20261109b.json`; entitlements_for_user segue costura declarada.
