# Bateria financeira do fluxo B2B — 28/10/2026

## Resultado e limites

**NO-GO financeiro/operacional.** Extensão do plano original, não novo módulo. PostgreSQL descartável: **29 PASS, 6 FAIL, 17 BLOCKED, 1 NOT RUN**. Vitest: **115/115 em nove arquivos**, 15 novos. Não somar às 620/332 execuções anteriores: há sobreposição. Matriz suplementar: 54 registros (30 PASS incluindo grupo Vitest, seis FAIL, 17 BLOCKED, um NOT RUN); matriz original com 9.180 combinações reais e seus gates intacta. Zero PASS JWT real.

Os FAIL são discrepâncias de corpos instalados executados em schema reduzido, **não exploits demonstrados nem homologação de produção**. Saída zero do runner significa execução concluída; `has_failures=true` e matriz impedem confundi-la com aprovação. Nenhuma regra foi modificada para fazer teste passar.

Sem alterações em Entregas, hooks/diálogos operacionais, permissões, rotas, dependências, commits ou SQL de candidatos. Nenhum pagamento/fiscal real, fixture/usuário produtivo, migration/GRANT/deploy/publicação. Apenas SELECT de definições/colunas no ref canônico validado em `supabase/config.toml`.

## Contratos identificados antes dos cálculos

Hashes lidos em SELECT e reconfirmados em SELECT independente nesta rodada:

| Função instalada | MD5 |
|---|---|
| fn_b2b_apply_interest | 806e5d8789b08cd6790a10feaf95f26d |
| simulate_b2b_payment_plan_secure | 37d4f45e388ed7b38f6f397b672629ee |
| fn_generate_receivable_installments | f632f15c9f46cb9889082fc533a27ea1 |
| rpc_create_financial_title | 0778b876b300e08d53f1cf7790394fc5 |

Captura 02:25–02:29 UTC: metadados obtidos por `supabase.read_query`, corpos sem registros pessoais no manifesto local. Pinos locais comprovam equivalência textual ao manifesto; **não são atestação independente do banco**. Verificação externa futura deve recapturar hashes/ACL/cadeia. SHA256 do manifesto e dependências substituídas estão em `execucao.json`.

Campos de plano: `monthly_interest_percent` e `discount_percent` numeric(6,3), `months_count` numeric(6,2), `interest_type` none/simple/compound, `installment_count`, `max_days`. Valores do cronograma numeric(14,2); termos guardam snapshots de taxas/método/meses/desconto e totais. Existência de campo não prova imutabilidade: triggers integrais não carregados.

- Desconto/preço: carrinho resolvido pelo servidor entrega `table_amount`, `discount_amount`, `net_amount`; nesta bateria carrinho é fixture controlada, **não teste do resolver de preços**. Para a fixture única, líquido = 10.000 × (1 − desconto/100).
- Simples: ROUND(líquido × (1 + taxa_mensal/100 × months_count), 2).
- Compostos: ROUND(líquido × (1 + taxa_mensal/100)^months_count, 2). **Não é Price/amortização mensal do saldo.** Juros incidem sobre líquido integral do carrinho; taxa e prazo são parâmetros independentes da quantidade de parcelas.
- Decimal com precisão 60 e ROUND_HALF_UP; total calculado uma vez, parcela regular arredondada e resíduo na última. Principal de cada parcela = ROUND(valor_parcela × líquido/total, 2); juros = valor − principal. Esta fórmula real pode não conservar as somas dos componentes.
- Simulação B2B: primeiro vencimento explícito ou CURRENT_DATE + max_days; demais em **30 dias corridos**, não meses civis. Gerador comum não B2B usa meses de calendário. Não presumir conversão max_days/30 → months_count.
- Carência 60 dias: primeiro vencimento +60; months_count permanece 3 na fixture. Não significa juros dispensados durante carência.
- UI limita taxa a 0–100%, parcelas 1–60 e meses 0–60; manual 1–36. Limite econômico/server global não homologado. RPC de simulação recusa taxa negativa e desconto >40% para não administrador; isso não concede autoridade para desconto 5/10% a qualquer ator.

## Valores concretos — parcelas a centavos

| Condição | Total | Parcelas |
|---|---:|---|
| À vista / 30 dias | 10.000,00 | 10.000,00 |
| 30/60/90 dias sem juros | 10.000,00 | 3.333,33 / 3.333,33 / 3.333,34 |
| 3x 1% simples, 3 meses | 10.300,00 | 3.433,33 / 3.433,33 / 3.433,34 |
| 6x 1,5% compostos, 6 meses | 10.934,43 | 5 × 1.822,41 + 1.822,38 |
| 12x 2% compostos, 12 meses | 12.682,42 | 11 × 1.056,87 + 1.056,85 |
| Desconto 5% +3x simples | 9.785,00 | 3.261,67 / 3.261,67 / 3.261,66 |
| Desconto 10% +6x compostos | 9.840,99 | 5 × 1.640,17 + 1.640,14 |
| Carência 60 dias, 3x simples | 10.300,00 | mesmas parcelas, vencimentos +60/+90/+120 |

No corpo manual instalado, sem juros: 30% +3x = 3.000 +2.333,33 +2.333,33 +2.333,34; 50% +2x = 5.000 +2.500 +2.500. Desigual =1.000 +3.500 +5.500, datas +12/+47/+111. Valores/datas armazenados e dois eventos de auditoria conferidos. **Não é financiamento com entrada B2B**: sua RPC não recebe entrada/array e não existe política comprovada de incidência sobre saldo. Não criar título manual para contornar a contenção B2B.

## FAIL e impactos — prioridades

### P0 — juros possivelmente contados duas vezes no saldo

Gerador B2B capturado grava `original_amount=s.amount` (total já financiado) e `interest_amount=s.interest_amount`. Cronograma 10.300/juros300 produz soma original+juros **10.600**, enquanto total do título é10.300. Valores por parcela/juros/datas comparados ao cronograma; consumidor `calcularSaldoRecebivel` e `saldoParcela` somam ambos. Risco: saldo, baixa máxima, inadimplência, crédito/BI e cobrança ficarem majorados. Não houve baixa real nem comprovação de toda cadeia/trigger. **Gate:** revisar origem/componentes e consumidores canônicos, reproduzir integralmente; proposta mínima somente após revisão e autorização, sem alterar histórico.

### P1 — rateio de principal e juros

Totais/parcelas PASS, mas principal/juros agregados FAIL:
- 6x: principal9.999,99 e juros934,44 versus10.000/934,43 (1 centavo).
- 12x: principal9.999,95 e juros2.682,47 versus10.000/2.682,42 (5 centavos).
- 10% +6x: principal8.999,98 e juros841,01 versus9.000/840,99 (2 centavos).

Impacto: conciliação dos componentes e relatórios divergem, apesar de soma parcelas exata. Oráculo confere componentes por parcela e reporta divergência agregada; não redistribui silenciosamente resíduo nem muda fórmula.

### P1 — datas manuais repetidas/retroativas

Corpo `rpc_create_financial_title` aceita duas datas iguais e uma anterior à emissão na transação local revertida. Total positivo, parcelas zero, soma excessiva e fração de centavo foram recusados nos cenários próprios. **Não concluir ausência de validação no servidor inteiro:** guards de data/snapshot/tenant e triggers instalados completos ausentes. Gate de revisão integral antes de corrigir.

## BLOCKED / NOT RUN e próximos gates

Cada caso possui status/evidência em `matriz-financeira.csv`. Permanecem BLOCKED:
1. Entrada e agenda B2B personalizadas; entrada >total. Manual demonstrado não é contrato substituto.
2. Taxa excessiva servidor, carrinho zero/parcela zero B2B, desconto autorizado por matriz e features/plano: resolver/gates/stubs não certificam.
3. Alteração pós-aprovação/taxa após faturamento, cancelamento após recebível, persistência e imutabilidade de auditoria/snapshots.
4. `na_aprovacao` atomically e `na_entrega`: A2/autoridade/contabilidade/CQ/estoque/envase/onfarm sem homologação integral; nenhum título para reprovado/CQ reprovado ainda não provado.
5. Idempotência financeira servidor/ACK perdido; reexecução das regressões locais mostra duplo clique/reconsulta scoped **sem redispatch financeiro**, não replay de cobrança servidor.
6. Cross-tenant A/B JWT/RLS, revogação durante locks, Storage e múltiplas abas/remount.
7. Pagamento parcial/mora/antecipação: helpers existentes conferem7.000 de saldo após3.000, ajustes de mora/multa/desconto e desconto monetário500; **política automática e baixa persistida não exercitadas**.

NOT RUN: sessões/JWT/browser, pagamento/fiscal reais (proibidos nesta rodada). Próximos gates P0/P1: cadeia instalada+triggers+resolver/feature → revisão independente da proposta mínima → instalação autorizada → testes reais controlados A/B → GO somente zero P0 e P1 crítico comprovado. A entrega continua protegida e sem liberação/publicação.

## Arquivos e reprodução

- Pacote existente: `scripts/financial-installments-initial-20261024/test-financial-battery.py`, `financial-battery-live.json`, regra em AGENTS do pacote; candidatos históricos intactos.
- Teste existente módulo financeiro: `src/test/financeiro/bateriaB2bOffline.test.ts` (15 casos), sem código runtime novo.
- Plano original, roadmap e AGENTS raiz atualizados; matriz suplementar e evidências em `docs/auditorias/evidencias-financeiro-b2b-20261028/` (fixtures Decimal, componentes/datas, resultados PG, logs, resumo, hash/limites).
- PostgreSQL: `python3 scripts/financial-installments-initial-20261024/test-financial-battery.py` usa helper existente socket em /tmp, sem endereço/DSN hosted. Auth/roles, C2, crédito, carrinho/hash, seletor e h15 são sintéticos; schema/triggers/RLS incompletos explícitos.
- Vitest: `bun run test -- src/test/financeiro/bateriaB2bOffline.test.ts src/test/financeiro/contasReceber.test.ts src/test/financeiro/contasReceberLacunas.test.ts src/test/financeiro/contasReceberRevisao.test.tsx src/test/comercial/preview-cronograma.test.ts src/test/entregas/consumidorEntrega.test.tsx src/test/entregas/confirmacaoEntregaAck.test.tsx src/test/financeiro/deliveryFinanceReconciliation.test.tsx src/test/rbac/order-flow-coverage.test.ts`.
- Revisão independente inicial pediu delimitar pinos/stubs e comparar rateio/gerador por parcela; incorporados. Não certificou produção. Build/typecheck automáticos da plataforma, sem invocação manual; build OK observado. Warnings Router/Dialog legados persistem.