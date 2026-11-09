# Captura LIVE verificada pelo auditor (09/11/2026 16:51Z, ref swzpzcwiasxmjutrmvkm) — sem repin

- 34/34 pares de attempt-08 `live_bodies_other_md5_unconfirmed` = md5(pg_get_functiondef) em produção (relato readonly do auditor).
- Tentativa 13: 29 desses 34 corpos foram exercitados e têm md5 idêntico; os 5 restantes não são usados nela.
- Das 70 assinaturas pedidas na tentativa 13, 8 ficam cobertas por essa verificação; 62 continuam sem md5 LIVE confirmado
  (3 são funções novas da 81, que não existem em produção por não estarem instaladas). Lista em live-capture-verified-20261109.json.
- Nenhum pin, harness ou SQL alterado; arquivo apenas registra evidência (sha256 do JSON 16d12cc4…652d).

## Pacote A — observação real readonly (auditor)
Ator FSF (org 8f57…) chamando partner_order_attempt_status_v1 para o parceiro ARBio 5c4f35f8…: HTTP 403, 42501
`C2_INTERNAL_TARGET_DENIED:target_outside_portfolio`. É a negação cross-tenant esperada; nenhuma escrita. Contexto FSF próprio 200.
