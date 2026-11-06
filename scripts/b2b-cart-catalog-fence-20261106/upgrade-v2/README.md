# B2B_CART_CATALOG_FENCE_V2_UPGRADE (NÃO APLICADO)
Base: produção com `b2b_cart_catalog_fence_reviewed_20261106` (commit 9c99095). Capturado read-only: helper `ca57c161…`, motor `6bc0e12a…` — idênticos ao pacote.
Mudança: só o corpo de `platform_private.b2b_partner_cart_volume_price` → `cf2403a8…`. Rota B2B só para linha `unidade`+volume e comprador `parceiro_b2b` sem `administrador`/`gestor_comercial`; resto volta ao wrapper cercado.
Motivo: no v1 instalado o comprador também obtinha hectare/litro/dose pelo helper (ex.: catálogo técnico, `rpc_resolve_commercial_prices`) — reproduzido localmente.
Arquivos: 01-pre (exige helper v1 + todos os pins), 02-upgrade, 03-post, 04-rollback-to-v1; md5 em generated-md5.json.
Local: 40/40 (estado instalado reproduzido, misto 18,90 antes/depois/rollback, matriz completa de negativas). Sem prova JWT/RLS hospedada.
