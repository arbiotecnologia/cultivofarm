# partner_orders — leitura do dono comercial (SELECT-only), 2026-10-29

Problema real (sessão JWT do titular): admin AR Bio recebe `[]` em `partner_orders?partner_id=eq.7e52de9a…` com 7 pedidos existentes. Causa: restrictive ALL `b2b_phase1_tenant_guard` exige parceiro do comprador (`org_partner`), nulo para o tenant dono.

Correção: helper `platform_private.b2b_owner_internal_partner_readable(uuid)` (DEFINER, search_path '', sem PUBLIC/anon) + guarda dividida por comando. Só SELECT ganha `OR helper`; INSERT/UPDATE/DELETE mantêm o predicado phase1 idêntico. `organizations.partner_account_id` e o helper phase1 intocados. As permissivas (admin/gestor_comercial/financeiro) continuam a limitar papéis.

Pins: pré-políticas `8e07ffe28764e18b6b9b5b0f13df8410` (lido no hosted 21:5xZ), helper `fa72ca18fc673cb4a5ff4867e65137cd`, pós-políticas `87776bb912a6157a493cd0488586c7af`; dependências phase1/h15/has_role rechecadas no pré e no pós. `LOCK TABLE … ACCESS EXCLUSIVE` antes do pré: políticas lidas e trocadas sob o mesmo lock; redefinição concorrente de função é detectada pelo pós (aborta).

Arquivos para revisão: `install.sql.final.review`, `rollback.sql.final.review`, `preflight.sql.readonly`, `postflight.sql.readonly`, `pins.json`. Evidência: `docs/auditorias/evidencias-cadeia-financeira-20261029/partner-orders-owner-read/` (42/42).

Limites: PG descartável, linhas sintéticas, claims sem assinatura (não prova JWT/RLS). Nenhum ator sintético tem DML permitido no baseline, então a equivalência DML foi provada no lado negado (SQLSTATE 42501/0 linhas/estado inalterado), não num caminho de escrita bem-sucedido. Prova real: repetir o GET do admin AR Bio (esperado 7) e os negativos FSF após instalação. Decisão superadmin do pacote de crédito segue pendência separada.

**Itens pendentes:** este pacote sozinho não libera `partner_order_items` (a tela de itens continua vazia). Complemento obrigatório para leitura completa: `scripts/partner-order-items-owner-read-20261029/`.
