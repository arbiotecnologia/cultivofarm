# Tentativa 149 — decisão final, somente local

- Exit code: 0; **50/50 verificações PASS**; banco temporário removido.
- Restauração integral nova, sem reutilizar checkpoint; Seller91 MD5 `97bcdb9884b54adb3bd4aae4915e32d0`.
- Previsão criada após aprovação comercial + crédito válido, separada de título e sem recebível pré-NF.
- Callback H13 real com envelope 104/protocolo 100: `AUTHORIZED`, `reconciliationPending=false`, um documento/alocação/snapshot/título; replay idempotente.
- Crédito: exposição total `5968,64` antes e depois; mudança apenas entre comprometido não faturado e saldo em aberto.
- Previsão final: `faturado_total`, residual `0`, versão `9`.
- ACL e dez gatilhos de recebíveis preservados; rollback deny-only fecha writers e mantém histórico.
- Atalho UI de crédito: 3 arquivos/16 testes PASS nesta execução, typecheck 0 e build automático OK.

Arquivos principais: `checks.json`, `forecast-pre-nf.json`, `forecast-post-nf.json`, `integrated-strict-fiscal-callback.json`, `integrated-b4-fiscal-bridge.json`, `full-logistics-rollback.json`, stdout/stderr/exit e cleanup.

Limites: positivo integrado de NF total; parciais, rejeição/cancelamento pós-autorização e concorrência específica do reconciliador não reexecutados nesta tentativa. UI dos novos estados de previsão não implementada. Auth/schema/eventos fiscais sintéticos; nenhuma prova JWT/RLS/Storage, SEFAZ ou produção. Nenhuma operação hosted, publicação, emissão, cobrança ou envio.
