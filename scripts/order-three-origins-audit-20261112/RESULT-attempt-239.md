# Execução 12/11/2026 — origem Parceiro B2B (composição revisada local)
Runner: order-e2e-new-20261108/rebuild_current.py (PG 17 descartável, sem dump r12, fontes com SHA em scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-239/source-manifest.json). exit=0; checks 57/57 PASS; 38 gatilhos presentes/habilitados/idênticos no início e fim.
Costuras declaradas: Auth por claims SQL; vínculo cliente sintético 301 e negativas de revogação/tenant via replication_role (fixture, não fluxo); ACL de serviço em tg_auto_b2b_receivable (harness). Não prova JWT/RLS/Storage.
| Etapa | Resultado | IDs/valores |
|---|---|---|
| Pedido canônico B2B | PASS | c66fb0b0-6a5a-4872-9f09-f8c80a77721a, PB-001001, tabela 20,00, desconto 2,00, final 18,00; boleto 30d; 1 parcela 18,00 venc. 12/12/2026; termos 3f16307d-4ed0-4968-8fb6-42c92dcac751 |
| Aprovação comercial | PASS | ator ...0024 |
| Termos financeiros | PASS | approved por ...0024 (MESMO ator) |
| Crédito | Só automático reason OK; credit_approved_by nulo | NÃO comprova aprovação explícita por papel distinto |
| Previsão pré-NF | PASS | ab36eb37-8631-426b-94e9-a9bc519f4d5d aguardando_fiscal 18,00; 0 recebíveis |
| NF parcial 1 (adaptador local) | PASS | invoice ...0900 → recebível fa336d8c-2e0f-4b20-a892-c98703992e9d; faturado_parcial, residual 9,00 |
| NF parcial 2 / corrida | PASS | vencedora ...0920 → 36ea98ff-9157-4129-887a-b00095684510; perdedora ...0910 sem título; faturado_total residual 0; 2 títulos = 18,00 |
| Pagamento 9,00 + replay | PASS | 7ca033d4-37bd-4466-b47b-2949146dc602 (idempotente) |
| Rollback | PASS | histórico preservado |
Empresa/cliente sintéticos (org ...0001, cliente ...0301); nenhum dado fiscal AR Bio; protocolo LOCAL, sem SEFAZ, cobrança ou envio.
Pendências: aprovação de crédito explícita por papel distinto não exercitada neste runner (candidato C2-piloto do ledger é o caminho); origens Comercial e Vendedor não compostas (capabilities fora das migrações); browser sobre esta base não executado.
