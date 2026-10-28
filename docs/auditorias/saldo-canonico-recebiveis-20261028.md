# P0 — contrato de saldo dos recebíveis B2B

## Decisão desta fase

**NO-GO. Não há correção runtime nem SQL instalável.** A alteração isolada do gerador foi testada somente dentro do PostgreSQL descartável e falha quando outro escritor recoloca os juros de financiamento. Não publicar uma correção só de frontend, não converter `original_amount` em principal e não remover globalmente os juros dos saldos.

Base solicitada confirmada no início: `9430e8e71f2e363e8f02ac524a6edb1272f68f20`, árvore limpa. Commits automáticos seguintes foram inspecionados antes de novas edições; nenhum revert, edição de Entregas ou conflito externo identificado. Política DRAFT definitiva intacta; nenhum teste de taxa aprovado foi repetido.

## Evidência LIVE exclusivamente de metadados

`lovable supabase info --json` confirmou ref **swzpzcwiasxmjutrmvkm**, produção externa. O comando de diagnóstico SQL da CLI recusou o banco externo; consultas seguintes usaram **somente SELECT** por `supabase.read_query`. Nenhuma leitura de linhas de clientes, usuários, títulos ou pagamentos.

Captura 20:26–20:28 UTC: **93 corpos de função**, oito tabelas com colunas/defaults/nullabilidade/constraints/ACL/RLS/policies/triggers e 38 índices. Inclui geradores, baixas, recibos, cancelamentos, BI, crédito e reconciliações encontrados por referência textual aos campos/tabelas financeiros. Views públicas/materializadas com essas referências: zero. Isso não é prova de cobertura de SQL dinâmico nem de fechamento transitivo de cada helper; não declarar “todos os contratos certificados”.

Manifesto: `scripts/financial-installments-initial-20261024/receivable-semantics-live-20261028.json`.

SHA256: `5291043aa23869274f31f9d24390d7525f1472001798186b990f68b6ad9576bb`.

| Corpo LIVE | MD5 |
|---|---|
| fn_generate_receivable_installments() | f632f15c9f46cb9889082fc533a27ea1 |
| generate_b2b_receivable_secure_impl(uuid) | 1bdac7fae6d702fb42d3a30539e9c9c3 |
| rpc_register_receivable_payment(uuid,jsonb) | db41f7e2cfcb196ef64536f62746f365 |
| fn_recalc_receivable_installment() | c8a1d33461c76eb3da3c7af1c011cf2b |
| fn_reverse_payment(uuid,text,text) | 9f2bfe6b1291cfeaa4814ee67c103be6 |
| issue_financial_receipt(uuid,text) | 49a1d165279ab4253e4e586fc7ccdeb3 |
| cancel_financial_receipt(uuid,text) | 0174a6a0ec6a4728f7bc8a143aea0bad |
| rpc_cancel_financial_installment(uuid,text,text) | c7d30a08b1cbd00936cd83aa5bf3415c |
| fn_fin_cashflow(date,date,text,text) | 197ffcc5735bcab0454e2936f1b76642 |
| fn_fin_aging(text) | 495aa7b0ff5bf32f362b763a2a3f0f07 |
| fn_financial_inconsistencies() | 2c75b1da47c9bdab169d28ec04eb0a12 |

Demais hashes/ACL/corpos no manifesto; 18 corpos carregados no ensaio tiveram MD5 normalizado pelo PostgreSQL conferido contra a captura. Hash textual não é homologação funcional ou autorização. Gerador experimental efetivo MD5 `2abb7f0efcde19a629b7c346be4121ff`; separado dos hashes capturados por modo no JSON. Baseline e experimento usam schemas recém-criados, sem herdar dados.

## Semântica identificada e menor contrato proposto

1. **Valor de tabela → desconto → principal líquido → financiamento → total do cronograma** são conceitos separados nos termos/schedule (`principal_amount`, `interest_amount`, `amount`). Não recalcular snapshots por política atual.
2. Gerador externo grava **`original_amount=s.amount` e `net_amount=s.amount`**, portanto ambos já contêm financiamento; também grava `interest_amount=s.interest_amount`.
3. RPC de baixa e helpers `calcularSaldoRecebivel`/`saldoParcela`/FluxoCaixa somam **original + juros + multa − descontos − recebido**. Antes da primeira baixa: **10.300 + 300 = 10.600**.
4. Trigger real `fn_recalc_receivable_installment` substitui `interest_amount`, multa/desconto/recebido pelas **somas dos eventos de pagamento**, incluindo estornos; compara esses eventos com **original financiado**. Após baixa 3.000, juros monetários 100, multa 200 e desconto 50: saldo correto **7.550**. Converter original para principal 10.000 daria **7.250**, perdendo financiamento contratado.
5. Contrato mínimo recomendado, ainda **não implantável**: original/net = total financiado imutável da parcela; interest/penalty/discount = ajustes monetários acumulados das baixas; financiamento permanece nos snapshots comerciais. Inicialização dos ajustes em zero, sem modificar o valor do título/cronograma/histórico.
6. Experimento troca somente a expressão de juros do INSERT externo por `0::numeric`. Reproduz saldo inicial correto, rejeição de 10.600 e pagamentos/estornos/recibos corretos. Entretanto `generate_b2b_receivable_secure_impl` **faz UPDATE com juros do schedule novamente**. Ensaio do mesmo efeito devolve 10.600. O writer completo NÃO foi homologado no harness; esta prova é do fragmento de atribuição, não da autorização integral.

**Por isso não foi produzido candidate/PRE/POST/rollback SQL nesta fase.** Um pacote unilateral criaria falsa segurança. Fontes/ACL/policies/triggers ficam capturadas para futura composição, não servem como preflight pronto. Futuro rollback deve negar apenas os writers homologados afetados, manter ACL/contenções/snapshots e jamais restaurar corpos vulneráveis; fronteira de instalação ainda não definida.

## Consumidores e divergências

- `src/lib/financeiro/baixaRecebimento.ts`, `contasReceber.ts`; `BaixaDialog`, `ContaDrawer`, `ContasReceber`, `FluxoCaixa`: contrato aditivo. Remover juros globally apagaria ajustes legítimos.
- DRE/drill-down e `PortalFinanceiro` apresentam original; não confundir valor da parcela com principal econômico ou caixa realizado.
- `fn_fin_cashflow` aditivo; `fn_fin_aging`, `fn_fin_dashboard_kpis` e várias projeções de crédito/relatórios usam original−recebido−desconto, sem mesmos ajustes. Famílias `get_financial_*`, `get_report_*`, `rpc_b2b_*`, `rpc_portal_partner_financial`, `platform_private.b2b_own_obligations` estão capturadas; guards e contratos próprios não substituídos. A concordância completa fica BLOCKED.
- Recibos e PDF usam **amount do evento**, não saldo devedor. Cancelar recibo não estorna pagamento; estorno registra evento negativo preservando original. Documentos emitidos não devem ser reescritos.

## Testes realmente executados

Runner novo **no pacote de parcelas existente**, usando helper `scripts/contracts-c2-20261022/integral/pg.py`; socket `/tmp`, TCP desativado, nenhum DSN hosted.

| Grupo | PASS | FAIL | BLOCKED | NOT RUN |
|---|---:|---:|---:|---:|
| Baseline capturada em schema parcial | 37 | 10 | 0 | 0 |
| Experimento não instalável | 43 | 4 | 0 | 0 |
| Gates não certificados | 0 | 0 | 8 | 1 |
| **Total PG** | **80** | **14** | **8** | **1** |

**Vitest: 222/222, 12 arquivos**, cinco novos testes de caracterização; regressões de baixa/estorno, contas, caixa/DRE, financeiro da entrega e consumidor real da entrega. Não somar com históricos sobrepostos. Teste que espera 10.600 é caracterização do defeito, NÃO PASS do requisito saldo correto; matriz PG registra FAIL do requisito.

Cenários: duas baixas parciais/integral, juros monetários/mora/multa/desconto, replay por mesma chave com ACK descartado pelo chamador, conflito fingerprint, revogação simulada antes da chamada, tenant sintético estrangeiro, recibo/replay/cancelamento, estorno parcial/replay, soma de eventos e imutabilidade título/parcela/pagamento. Não houve simulação de timeout de rede, cliques concorrentes em duas sessões nem revogação durante espera. Estes gates permanecem não certificados.

Fixtures de totais **já definidos**, não nova prova de taxa: tabela10.000, desconto40%, 0m/até30d=6.000; duração numérica1m explicitamente>30d=6.108;6m=6.677,87;8m=7.029,96;12m=7.609,45. Quantidade de parcelas igual a meses e intervalos+30d neste harness são **fixtures mecânicas**, não política de parcelamento/calendário aprovada. Última parcela absorve resíduo centesimal. Principal/juros do schedule sintético não homologam o rateio real antigo.

18 corpos reais distintos (recarregados para cada modo): gerador, recálculo, fingerprint/normalização, RPC baixa, estorno, snapshots, append-only, auditoria, metadados/aliases e emissão/cancelamento de recibo, cancelamentos e cashflow/aging. Tipos/defaults/nullability/checks/unique índices relevantes copiados; **FKs externos, RLS, guards de tenant/SaaS/readiness, triggers de risco/B2B/fiscal e creator de pedido não carregados**. Roles/h15/Auth sintéticos. Matriz identifica exclusões por trigger. “Ledger” neste ensaio é **receivable_payments**, não razão contábil.

Execução termina com zero se concluiu o diagnóstico, mesmo com FAIL: ler counts/matriz e `has_failures=true`/`operational_go=false`, nunca usar exit code como aprovação. Erros de infraestrutura/hash interrompem a execução.

## Prioridades e impacto

**P0:** duplicação inicial e baixa acima do total, reproduzidas na cadeia de corpos capturados; writer alternativo torna ajuste único insuficiente. Impacto: saldo/limite/crédito/inadimplência/baixa/cobrança podem ficar majorados. Nenhum título real inspecionado, logo não afirmar montante de perda em produção.

**P0 adicional:** `rpc_cancel_financial_installment` não deriva tenant em seu corpo. Ensaio como postgres com Auth/h15 simulados cancela parcela B usando ator A; **não prova exploit JWT/RLS real**, pois policies/guards foram excluídos. Reavaliar SECURITY DEFINER/ACL/trigger tenant sob sessão real autorizada, sem divulgar dados ou reabrir cancelamento. Não corrigido fora da fronteira autorizada deste contrato.

**P1:** aging versus cashflow divergem quando há ajustes monetários/juros duplicados; rateio real principal/juros de 1–5 centavos da bateria histórica permanece pendente. Datas/calendário, billing/A2 e contabilidade não resolvidos pelo experimento.

## Próximos gates e remediação histórica (sem execução)

1. Revisão independente dos corpos e diffs; completar fechamento transitivo de creator/gerador B2B, guard tenant/H15/SaaS/risco, fiscal/approval/billing e projeções autorizadas. Testar o writer inteiro, não só assignment.
2. Definir único contrato compatível para writer de INSERT e UPDATE, BI/crédito e baixa. Não criar tabela/RPC financeira paralela. Preparar então `*.review` inativos com PRE/POST hashes+owner/ACL+schema+policies+triggers+índices agregados e rollback deny-only; falha de drift antes de DDL, teste transacional integral.
3. Histórico: futura consulta somente leitura autorizada por tenant, vinculando título→ordem→termos→schedule exatos→eventos/estornos→auditoria. Classificar sem pagamentos, com eventos concordantes, eventos conflitantes e origem não comprovada. **Nunca inferir juros históricos por igualdade numérica ou taxa atual.** Separar ajuste comercial/documental/contábil e aprová-lo explicitamente; nenhuma limpeza/reprocessamento automático.
4. Conter retentativas/baixas do título duvidoso só por contrato aprovado, sem editar original/snapshot, sem apagar pagamentos/recibos. Proposta de correção de histórico requer identidade, centavos, recibos/documentos, conciliação e audit imutável próprios.
5. Instalação autorizada posterior + JWT/RLS A/B, locks/revogação, replay/concorrência, browser e contabilidade. Calendário fracionário/parcelamento/gatilho billing ainda dependem de validação; AR Bio×FSF DRAFT OFF e entrega/A2 preservados.

## Arquivos e evidências

- Novo manifesto e `test-receivable-semantics.py` no pacote existente.
- Novo `src/test/financeiro/receivableSemantics.test.ts`.
- `docs/auditorias/evidencias-saldo-canonico-20261028/{execucao.json,matriz.csv,pg.log,vitest.log}`; matriz suplementar do plano original, cenários reais9.180 intactos.
- Atualizações aditivas deste relatório, bateria original, plano original, roadmap e instruções raiz/pacote.

Reprodução: `python3 scripts/financial-installments-initial-20261024/test-receivable-semantics.py`; comando Vitest completo no log. Nenhum SQL mutante LIVE, migration/GRANT/deploy/publicação, usuário/dado produtivo, cobrança/NF/mensagem; contratos históricos, fontes inativas anteriores e runtime preservados.
## Revisão independente e validação final

Revisão read-only inspecionou os93corpos,33triggers,40policies e38índices e confirmou MD5 textual; recomendou NO-GO. Corrigidos no harness: exemplo1m, schemas independentes, hash experimental separado, quitação com centavos independentes, duas baixas, comparação por parcela antes do estorno, recusa+atomicidade do cancelamento e sinalização explícita de FAIL. Demais cenários multissessão/cadeia completa ficam BLOCKED, não foram convertidos em PASS. Igualdade BI é teste de hipótese de saldo exigível, não declaração de que competência, caixa e exposição devem sempre ser iguais: após parcial7.550 operacional/7.250 aging/7.300 exposição pela expressão original−recebido são métricas divergentes a contratar.
