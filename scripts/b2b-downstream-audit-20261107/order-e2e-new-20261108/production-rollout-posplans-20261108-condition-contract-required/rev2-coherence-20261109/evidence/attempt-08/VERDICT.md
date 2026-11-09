# Tentativa 08 — espelho com corpos LIVE atuais (cc1f6cc) — VEREDITO: FAIL (não é prova de compatibilidade)

- Corpos instalados no espelho a partir de scripts/commercial-plans-tenant-20261108/02-install.sql.review; apenas o bloco PRE de pins hosted foi omitido.
- md5 no espelho: create_partner_order_secure=fe82f5381d426136f2627803f3b0005d (LIVE informado fe82f538…: IGUAL);
  create_partner_order_condition_secure=e86385fefb25c68d9dd4d0fef6619f27 (LIVE e86385fe…: IGUAL).
- Demais corpos cc1f6cc (quote/assign/retire/publish/resolve…): md5 em hook-results.json `live_bodies_other_md5_unconfirmed` — NÃO confirmados contra produção; precisam de leitura readonly do auditor.
- Seams estruturais declarados (colunas/políticas/funções reais copiadas do repositório, nenhum stub): ["clientes.status_cliente", "commercial_payment_plans.created_by/is_default/sort_order + code_key/uq_cpp_single_default (LIVE pre-cc1f6cc shape)", "commercial_payment_plans.root_plan_id/superseded_by_id; assignments.id; partner_users.revoked_at", "platform_private.c2p1_assignment_allowed/c2p1_item_allowed real bodies (owner-orders p1-isolation/core)", "partner_users.tenant_id/valid_from (backfill = owner org of partner)", "LIVE policies cppa_admin_read/cpr_internal_select (created closed; cc1f6cc ALTERs their predicate) and item_prices ids", "platform_private.c2p1_snapshot_allowed real body (owner-orders p1-isolation/channels-core)", "public._cpp_validate_payload/_cpp_audit real bodies (migration 20260730014752)"]
- Resultado: 276/291 harness; CCR2 58/60.

## Falhas (abertas, não mascaradas)
1. plan_not_found (12 casos: create legado tenant F, respond quote legado/rollback): a fixture B3 compartilha os planos PLD/PLQ entre parceiros de A e F; o backfill LIVE de organization_id deixa planos multi-tenant sem dono e os corpos LIVE os negam. Exige fixture com planos exclusivos por empresa (modelo LIVE), não afrouxar o guard.
2. payment_choice_required no positivo do writer de condição (parceiro P): mesma causa provável (PLD sem empresa ⇒ opção não resolvida). Confirmar após (1).
3. B3 04-rollback-deny recusa porque pina o corpo pré-cc1f6cc de b2b_payment_condition_publish: o rollback B3 está obsoleto frente ao LIVE atual (achado real; não repinar).
4. Pós-rollback: decorrentes de (3).

Hashes: live_bodies.py=728b66199283e23a1106d06b89686b5493b60bdd3fe6fba2711e7bac6b41e6f9 ccr2_hook.py=60b788bc4835c0860d13bdaea37a974eadeff53156ed9ef0dc2bc11f7d9ebecd run_ccr2.py=8936a57795d328c37e54ebe0664a2bb4810be6f018cad2d05faa934120f21b5c
Tentativas 04/07 preservadas; 55/286 e 69/69 referem a captura histórica c34e7404…, não ao estado atual.
