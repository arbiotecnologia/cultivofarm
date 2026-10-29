# partner_order_items — complemento de leitura do dono comercial (SELECT-only)

Depende do pacote `partner-orders-owner-read-20261029` instalado (pré confere helper `fa72ca18…` e políticas de pedidos `87776bb9…`). Sem os itens, o cabeçalho fica legível mas os itens continuam `[]` (provado no estágio "orders-only"): **não declarar leitura completa com só o pacote de pedidos**.

Causa: restrictive ALL `b2b_phase1_tenant_guard` em itens usa `b2b_phase1_order_visible(order_id)` → caminho phase1 do comprador. Correção: helper `b2b_owner_internal_order_readable(order)` = pedido existe e `b2b_owner_internal_partner_readable(partner)`; só SELECT ganha `OR`; INSERT/UPDATE/DELETE idênticos. Permissiva de itens preservada: admin/gestor_comercial/parceiro do próprio pedido — **financeiro continua sem itens** (baseline não admite).

Pins: itens pré `3233f822832e8121b0c42aaf572c4ada` (hosted), `b2b_phase1_order_visible` `8504f07fbc3a7975accf919f386d00eb` (hosted), helper e pós em `pins.json`. Trava ACCESS EXCLUSIVE em pedidos+itens antes do pré; dependências rechecadas no pós.

Ordem de instalação: pedidos → itens. Reversão: itens primeiro (não toca pedidos), depois pedidos.
Ensaio 42/42 em `docs/auditorias/evidencias-cadeia-financeira-20261029/partner-order-items-owner-read/`. Limites: dados sintéticos, claims sem assinatura, equivalência DML só no lado negado. Prova real: GET de pedidos (7) e itens do admin AR Bio, negativos FSF.
