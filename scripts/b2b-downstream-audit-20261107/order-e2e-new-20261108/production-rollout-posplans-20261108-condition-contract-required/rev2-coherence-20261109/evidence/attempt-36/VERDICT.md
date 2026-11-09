# Tentativa 36 — leitura LIVE 09/11 das 11 dependências (capture-request 29b)

exit 0 · harness 353/353 · CCR2 144/144 (PG 17.11 descartável). Guarda 81 **NÃO APROVADA** (aguarda revisão independente).
Correção do vendedor REVIEW_ONLY, pacote `seller-respond-fix-20261109/` inalterado (SHA256SUMS). Nada hospedado/publicado; gates OFF.

- Pins: `live-exact-7/live-pins-11-20261109.json`. md5 do corpo no espelho = LIVE **11/11**; owner postgres 11/11.
- Tentativa 35 (preservada): 5 ACLs do espelho divergiam de produção (corpos iguais):
  b2b_commercial_context e c2_producer_links só postgres (LIVE + authenticated, service_role);
  c2p1_settings_allowed, b2b_internal_origin_valid, c2_external_origin_contract_valid com proacl NULL (= EXECUTE PUBLIC, mais aberto que LIVE).
- Tentativa 36: só no espelho, ACL alinhada ao conjunto LIVE (REVOKE + GRANT exatos); comparação ordenada 11/11.
  Todos os testes de autoridade, concorrência e replay do vendedor (tentativa 33) passam com as permissões de produção.
- ACL do respond: mesmo conjunto; ordem do array difere e o PRE compara ordenado (correto).
- Costuras que permanecem: Auth sintética, tabelas reduzidas vazias, entitlements_for_user (tabelas SaaS ausentes).
