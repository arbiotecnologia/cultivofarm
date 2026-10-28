# AR Bio × FSF Agro — alteração superveniente do proprietário

## Estado e substituição
**DRAFT / NO-GO operacional.** Solicitação28/10/2026 02:37UTC substitui taxas/descontos do PDF julho2026, não contratos ou registros históricos.40% fixo todos prazos autorizados; base tabela vigente congelada×0,60;até30d juros0%;>30d até6m inclusive1,8%composto;>6m até12m2%composto;>12m negar sem política excepcional formal aprovada. O desconto40% não fica condicionado à quitação exclusiva antiga. Crédito, garantias, aprovações, inadimplência e isolamento compatíveis permanecem. Fonte PDF original continua indisponível; alteração do proprietário não atesta assinatura/vigência contratual.

## Ambiguidades e contrafactuais
Preferência técnica **taxa única da faixa sobre prazo financiado**, alternativa **marginal1,8% primeiros6 meses financiados e2% excedentes**. Ambas NÃO HOMOLOGADAS. Início na venda ou após30dias não escolhido. Meses financiados, ancoragem civil/fim de mês/bissexto,30/360/dias corridos, amortização, rateio centavos e billing aprovação/entrega indefinidos. `formula=null`, runtime OFF. Vetores com meses inteiros explícitos são aritmética hipotética, nunca vencimentos autorizados. Alternativa após30d nos contrafactuais usa explicitamente um mês hipotético: não transforma30dias em mês civil.

29/30dias: taxa0%/valor60000 para tabela100000.31dias: taxa normativa1,8%, valor BLOCKED por início/período.6meses exatos1,8%;6meses+1dia2%;12meses2%, mas classificação de datas reais e valores bloqueados por convenção.>12meses DENY no DRAFT sem exceção aprovada; backend real não foi testado como enforcement dessa regra.

## Diagnóstico das entidades existentes
Reutilizados mapa histórico e capturas canônicas do pacote existente; **nenhuma consulta LIVE nesta rodada**, sem recertificação. Fornecedora AR Bio referência007bb519-cba0-4704-be2c-cb93ad010048; FSF revenda/partner_id NULL até resolução canônica do owner, nunca tenant/produtor novo. Identidade/roles via organizations/profiles/user_roles/partner_accounts/partner_users, guardas C2 ativos. Não criar assignment global ou cliente paralelo.

`commercial_payment_plans` representa discount_percent/monthly_interest_percent/interest_type/months_count/max_days/installment_count e flags de crédito/financeiro/garantia. `commercial_payment_plan_assignments` liga versão publicada ao parceiro sob c2p1_assignment_allowed; DRAFT não aplicável. Catálogo/preço: commercial_condition_item_prices/price_rules e fn_resolve_b2b_cart únicos; features/isPathEntitled apenas restringem. Crédito/settings: partner_financial_settings e fn_b2b_credit_exposure com CAS/owner/RLS. Documentos seguem autorização binária própria, sem paths/URLs.

`fn_b2b_apply_interest(numeric,text,numeric,numeric)` capturado suporta uma taxa e duração numérica, não datas/faixas/carência/marginalidade. `simulate_b2b_payment_plan_secure` recebe valores do plano; cronograma30dias não é calendário civil. `partner_order_payment_terms/payment_schedule` preservam snapshots; accounts_receivable/installments/financial links reutilizados, sem segundo financeiro. Guarda b2b_phase1_order_visible não é provada por esquema local. Snapshots taxa/meses/parcelas/primeiro vencimento não representam explicitamente versão de faixa/incidência. Revisão de migrations históricas identifica cart_hash por parceiro/plano/total/linhas, não prova regra temporal; idempotência existente precisa teste integral do corpo atual, não inferir ausência de fingerprint em toda cadeia moderna.

Backend suporta a **aritmética de planos de taxa única parametrizados**, não comprova política completa por fronteiras de datas, escolha marginal ou início pós30d. Não converter suporte aritmético em instalação funcional.

## Resultados e evidência
Runner `test-arbio-fsf-override.py`, reutilizando harness e corpo capturado em PG descartável `/tmp`, sem candidato SQL: **41PASS/0FAIL/16BLOCKED/1NOT RUN**. Inclui1pin hash, testes especificação/desconto/faixas e Decimal60dígitos ROUND_HALF_UP versus helper/SQL independente. Contrafactuais sem arredondamento intermediário. Não testa amortização ou aprovação real.

Vitest **129/129 em8arquivos**, preview/atribuição/configuração financeira e página/diálogo real entrega com QueryClient/Auth/transporte simulados. Teste AR/FSF atual substitui vetores antigos; runner histórico aponta para JSON arquivado e não foi reexecutado. Evidências antigas não sobrescritas. Matriz nova `evidencias-arbio-fsf-override-20261028/matriz.csv`, execucao.json/resultados.json/vitest.log. Zero PASS JWT real; contagens não somadas às baterias históricas. Warnings Router/Dialog legados, sem falha teste.

Parcelamento, replay/mudança posterior faixa/snapshots integrais e cross-tenant real **BLOCKED**; regressões existentes não homologam política não instalada. LIVE/JWT/browser/pagamento/fiscal **NOT RUN**. Sem simular PASS para contrato ausente.

## P0/P1, fases e rollback
**P0:** decidir incidência/faixa/calendário/amortização/billing e validar comercial/jurídico antes de qualquer faturamento. Preservar achado anterior saldo10300→10600 e seis FAIL históricos de bateria financeira; zeroFAIL aritmético novo não os resolve. Provar título único, snapshots/replay e autoridade integral antes de GO. A2/entrega/envase/B2B/onfarm contidos.

**P1:** resolver parceiro canônico, mínimo/limite safra, índice/mora/pro-rata/antecipação/alçadas, documentos e garantias. Fases futuras: decisões assinadas→versões DRAFT/assignment específico pelas RPCs existentes→revisão independente/pinos atuais→instalação especificamente autorizada→JWT A/B/parcelas/recebíveis/replay/entrega homologados. Exceção>12 exige política própria aprovada, jamais extrapolação.

Rollback agora: descartar somente candidata local, sem efeito produtivo. Futuro: arquivar nova atribuição/versão via CAS autorizado, preservar pedidos/parcelas antigos/auditoria; nunca editar snapshots, restaurar ACL vulnerável, apagar dívida ou prometer rollback de operação in-flight.

## Arquivos e conflitos
Base auditada7252d6845, checkout inicial limpo. Alterados: DRAFT JSON; runner histórico(apenas aponta arquivo arquivado); teste TypeScript AR/FSF; AGENTS do pacote; plano original(seção9); roadmap; relatório antigo(apenas aviso histórico). Novos: JSON histórico; runner override; relatório atual e evidências separadas. Entregas/hooks/componentes/financeiro runtime, migrations e capturas originais intocados. Nenhum revert/reset, registro/contrato produtivo ou trabalho concorrente sobrescrito. Revisão independente read-only do suporte realizada; revisão dos diffs finais e homologação operacional permanecem gates, não aprovação de release.

Nenhum SQL mutante LIVE/migration/GRANT/deploy/publicação/usuário/fixture produtivo/pagamento/NF/comunicação realizado; build/typecheck manuais não executados conforme regras da plataforma.