> **SUPERADO — somente histórico.** Decisão técnica do auditor (2026-11-06): contrato único B2B_PAYMENT_CONDITION_V1 rebaseado em `../b2b-payment-condition-v1-rebase-20261106/`. Evidências 101/101 abaixo ficam como histórico.

# B2B_PAYMENT_METHOD_V1 rev. 2 — meio de pagamento escolhido no pedido (B3)

Status: **NÃO APROVADO PARA IMPLANTAÇÃO; NÃO APLICADO.** Revisão 9c0d288 tratada só em código e PG descartável.
Sem SQL remoto, publicação, cadastro de meios, cobrança, documento, envio ou alteração de PB-001036/teste4.

## Correções da revisão 9c0d288
| # | Bloqueador | Correção |
|---|---|---|
| 1 | Totais divergentes (motor antigo × Price) | simulate/create com meio são **gerados dos corpos LIVE** (37d4f45e/c34e7404) por 12+9 deltas exatos (contagem = 1). Após carrinho e juros do plano, `b2b_payment_method_schedule` gera as parcelas; `final_amount` = soma; juros = final − líquido. O mesmo valor alimenta crédito, `cart_hash` (base LIVE + config/versão/tipo/n/prazo/taxa/total), pedido, terms, schedule, snapshot, idempotência e ACK. A tela usa só `simulation.schedule/amounts`; resposta ou ACK com soma ≠ total é recusada. |
| 2 | Create stub | O harness usa o **corpo REAL c34e7404** (estado instalado do B2, gatilhos reais de pedido/itens/condição), crédito/juros/plano REAIS e h15 REAL. Cobre desconto, Price 1000→1036,22, crédito real bloqueando pelo total Price, replay, cotação, gatilho deferido isolado e install/rollback transacionais. |
| 3 | Autoridade antes das travas | Ordem documentada abaixo; o resolve roda depois do lock de idempotência e trava config→plano→atribuição→meio; nova leitura depois das esperas de embalagem/crédito; `config_save` e ativação reautorizam depois do advisory. Cinco testes com duas/três sessões. |
| 4 | Duplicação com B2B_PAYMENT_CONDITION_V1 | Ver RECONCILIATION-PRIOR-CANDIDATE.md (decisão do auditor). |
| 5 | Promissória/crédito proibidos por CHECK | Os seis meios são configuráveis: único (dinheiro/pix/débito) = 1; boleto ≤ 3; promissória/crédito ≤ 36; n > 1 exige taxa Price **explícita** (0 é permitido). Sem config ativa = indisponível. |
| 6 | Bloqueio global | Ativação **por empresa vendedora**: `off` (padrão, nenhuma linha) → `pilot` (parceiros listados da própria empresa) → `enforced`. O gatilho só exige meio em pedidos de parceiros ativados; outras empresas seguem o contrato atual. Ativar exige config ativa e administrador. |
| 7 | Sem tela de configuração | Aba **Motor Comercial B2B → Meios de pagamento**: admin/financeiro editam com CAS, admin ativa/piloto, gestor comercial consulta. Pedido comercial interno usa o mesmo leitor e exige meio quando a empresa está ativada (sem bypass por papel). |

## Ordem de travas
```text
create:  advisory b2b_idem:<parceiro>:<chave> (LIVE) -> reautorização LIVE -> replay
         -> config FOR SHARE -> plano FOR SHARE -> atribuição publicada FOR SHARE -> payment_methods FOR SHARE
         -> b2b_packaging_lock (LIVE) -> advisory b2b_credit:<parceiro> (LIVE) -> resolve sem trava (autoridade) -> INSERT
config:  advisory b2b_pmc:<org>:<plano>:<meio> -> reautorização -> config FOR UPDATE -> plano/meio FOR SHARE -> CAS
ativação: advisory b2b_pma:<org> -> reautorização -> linha FOR UPDATE -> CAS
```
Escritores globais de planos/meios que tomem FOR UPDATE nesses registros esperam o pedido em curso; não verifiquei a ordem
interna desses escritores no hospedado.

## Evidência (PG descartável, não é prova hospedada)
`test-local-pg.py` → `evidence-local-pg.json`: **101/101**. Costuras declaradas: as do harness B2 (auth.uid por GUC,
has_role/c2_* mínimos, entitlements, tabelas de 2º nível), `payment_methods` mínima, leitor de condição com portas mínimas,
pins de colunas trocados só na cópia temporária. O caminho interno é barrado pela guarda LIVE de origem interna
(`B2B_INTERNAL_ISSUER_AMBIGUOUS` no harness) nos dois contratos; a positiva interna não foi demonstrada.

## Limitações abertas
- Datas: referência = data do pedido; sem ajuste a dia útil Paracatu-MG; o vencimento definitivo é do B4 (emissão da NF).
- `partner_order_payment_schedule` continua recebendo datas estimadas antes da NF (como o LIVE); o B4 precisa recalcular.
- Outros criadores de pedido (conversão de simulação, cotação respondida) não recebem meio; numa empresa ativada eles falham com `B2B_PAYMENT_METHOD_REQUIRED`.
- Rollback 04 é só negação: empresa já ativada fica bloqueada até nova revisão.
- Sem JWT/RLS/PostgREST/browser autenticado.
