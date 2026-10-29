# Price até 3 parcelas — AR Bio × FSF Agro (offline, 29/10/2026 17:41 UTC)

Somente candidato offline. Sem runtime, SQL hosted, migration, deploy, GRANT, usuário real, cobrança ou remediação histórica.

## Decisões humanas registradas
- AR Bio vendedora/credora/emitente; FSF Agro compradora/devedora (não é prova fiscal/contábil).
- Cadastro primeiro, configuração financeira depois e bloqueada até completa.
- Limite de crédito FSF junto à AR Bio: R$ 100.000,00; zero/NULL/negativo/NaN/Infinity bloqueiam.
- Geração de recebível só por ação manual autorizada; automática bloqueada.
- Desconto fixo 40%, aplicado uma vez. 1 parcela/30 dias: 0%. 2–3 parcelas mensais: Price 1,8% a.m. sobre saldo devedor desde o 1º período. 4+ rejeitado.
- Price substitui juros compostos sobre o principal inteiro só para NOVOS planos candidatos; 2%/prazo longo fica referência inativa; históricos 10300/7550 intocados.

## Implementação
- `scripts/financial-installments-initial-20261024/price-schedule.py`: motor Decimal (prestação em precisão total, arredondamento meio-para-cima, última parcela fecha o saldo), oráculo independente em frações, calendário candidato separado.
- `arbio-fsf-policy.draft.json`: bloco `price_schedule_candidate` (inativo).
- `src/test/financeiro/priceScheduleOffline.test.ts`.

## Resultados (esta rodada, sem somar históricos)
- price-schedule.py: 155 verificações, 0 FAIL — PRICE_GREEN 146, PRICE_RED_SUPERSEDED 2 (full-term 3m = 63.298,67 > Price 62.172,84), HISTORICAL_PRESERVED 1, CALENDAR_CANDIDATE_ONLY 6.
- Vetores 60.000 (100.000 − 40%): 2x 30.812,41/30.812,41; 3x 3 × 20.724,28, juros 2.172,84.
- Vitest: 6 arquivos, 57 testes PASS (inclui cancelamento/risco/partes PG 810, red/green 10300/7550, proveniência, bateria e referência AR Bio).
- Datas candidatas (base explícita + 30 dias, meses civis a partir do 1º vencimento com clamp no fim do mês): testados 29/01, 31/12 → bissexto 29/02/2028 e 2024, virada de ano.

## BLOCKED (exige humano ou prova externa)
1. Calendário: qual evento define a data-base (pedido, aprovação, entrega, emissão da NF?); regra de período irregular/pro-rata; ajuste para dia útil. Hoje o motor recusa sem essas decisões e não usa o clique manual como data-base.
2. Cadeia PG composta com Price: os geradores capturados não implementam Price e a cobrança continua negada (`PAYMENT_TERMS_NOT_DEFINED`, `C2_ACCOUNTING_PENDING`, `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED`); não houve contorno.
3. Origem fiscal/contábil, BI/proveniência e JWT/RLS A/B reais.

## Evidências
`docs/auditorias/evidencias-cadeia-financeira-20261029/price-schedule-1741/` (`results.json`, `price-run.txt`, `vitest-final.txt`, `SHA256SUMS.versioned`, `check-git-tree.py <commit>`). O manifesto só lista arquivos não ignorados pelo Git; conferir com o checker contra o commit que contiver esta rodada.

## Rodada 17:49 UTC — correções da revisão do commit 69acee5
- Decisão humana: 1º vencimento = emissão da NF + 30 dias; geração manual tardia/repetida não reinicia prazo (testado com geração em 03/11, 20/11 e 15/01 → mesmas datas).
- Validação monetária explícita (principal, limite, exposição): NaN/sNaN/Infinity, texto inválido, bool, float, None, lista, subcentavo e negativos viram erros de domínio; exceção não controlada conta como FAIL. Exposição negativa não amplia o limite.
- Valores minúsculos: planos com parcela/amortização zero ou negativa são rejeitados (`PLAN_NOT_REPRESENTABLE_IN_CENTS`, ex.: 0,01 em 2x/3x, 0,02 em 3x), sem mudar n.
- Testes tautológicos removidos; oráculo independente em frações com arredondamento próprio compara todas as linhas (juros/amortização) em 24 cenários, mais vetores fixos 60.000 em 3x (1080,00/19644,28; 726,40/19997,88; 366,44/20357,84).
- `due_dates_candidate` valida n 1..3 (bool/float/texto não), data `date` real (datetime/texto recusados) e geração não anterior à NF. Vencimentos seguintes (mês civil com clamp) são CANDIDATOS, não bloqueio implementado; dia útil e pro-rata não são aplicados.
- Base de exposição: o mesmo caso (60.000 em 3x com 40.000 já expostos) cabe pelo principal e excede pelo total financiado. A função capturada `fn_b2b_credit_exposure` usa `original_amount - received` e `final_amount_with_interest` (total financiado), mas o contrato não está comprovado: a API candidata exige a base explícita e `production_eligibility` sempre nega.
- Resultado: 212 verificações, 0 FAIL — PRICE_GREEN 192, PRICE_RED_SUPERSEDED 2 (excesso full-term 1.125,83), PRODUCTION_GATE 2, NF_ANCHOR_DECIDED 10, CALENDAR_CANDIDATE_ONLY 6. Vitest 6 arquivos/57 testes PASS.
- Manifesto anterior `price-schedule-1741/SHA256SUMS.versioned` conferido contra objetos Git reais do commit 69acee5: 4 entradas, 0 falhas.
- PG ponta a ponta com Price: NÃO executado (BLOCKED). Os geradores capturados não calculam Price e a cobrança é negada por `PAYMENT_TERMS_NOT_DEFINED`/`C2_ACCOUNTING_PENDING`/`B2B_INTERNAL_DOWNSTREAM_UNVERIFIED`; injetar parcelas contornaria esses gates. Os testes desta rodada são de componente.
- Evidências: `price-schedule-1749/` (results.json, price-run.txt, vitest-final.txt, check-previous-1741-vs-69acee5.txt, SHA256SUMS.versioned, check-git-tree.py).
