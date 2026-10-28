# AR Bio × FSF Agro — referência comercial DRAFT

## Fonte, identidade e estado

**REVIEW ONLY / NO-GO.** Política de julho/2026, cinco páginas conforme informado pelo proprietário, “versão para apresentação comercial — sujeita a validação jurídica e contratual”. A ferramenta de leitura não localizou esse documento; o mount contém catálogos/tabela antigos, não o documento com este título. **Fonte utilizada: transcrição explícita desta solicitação.** Não alegar leitura das cinco páginas, assinatura, vigência ou validação jurídica. Obter original para cotejo e aprovação formal é gate, não impede cálculos da transcrição.

AR Bio = fornecedora; FSF Agro = revenda/parceiro, não produtor final nem tenant novo. Organização AR Bio de referência histórica `007bb519-cba0-4704-be2c-cb93ad010048`, sem alteração. `partner_id` FSF permanece NULL na proposta: precisa resolução canônica de parceiro já existente do commercial_owner, sem usar nome, UUID de fixture teste4 ou organização FSF legada como autorização. Nenhum usuário/role/tenant/vínculo criado; não duplicar entidade. Obrigações da revenda independem da cobrança do produtor.

Commit inicial auditado: `06aa71741`, checkout limpo; commits anteriores `0ad3b55d0`, `b6ba9412e`, `e964c6e62` preservados, sem revert/reset. Entregas e bateria financeira anteriores não editadas. Arquivos desta rodada são testes/referência no pacote já existente e atualização aditiva do plano/roadmap. Nenhum módulo runtime, pagamento, fiscal ou transporte externo novo.

## Proposta de parâmetros (não payload aplicável)

Arquivo `scripts/financial-installments-initial-20261024/arbio-fsf-policy.draft.json`: `runtime_enabled=false`, status DRAFT_REVIEW_ONLY. JSON é especificação, **não configuração instalada nem INSERT/UPDATE executável**.

| Condição | Desconto | Juros mensais | Prazo | Pré-requisitos referidos |
|---|---:|---:|---|---|
| À vista/antecipado | 40% | 0% | até7d ou antes entrega | **Somente quitação integral** |
| 30d | 35% | 0–1%, exata indefinida | até30d | limite aprovado |
| 60d | 30% | 1,5% composto | até60d | aprovação comercial e financeira geral |
| 90d | 25% | 2% | até90d | contrato, histórico positivo, sem saldo vencido |
| Safra aprovada | 20% | 2% | 6–8m | garantia e limite |
| Safra risco médio | 20% | 2,5% | 6–10m | classificação/aprovação a validar |
| Safra sem garantia forte | 15% | 3% | 6–10m | garantias adicionais |

Fórmula referida: tabela × (1 − desconto/100) × (1 + taxa_mensal/100)^meses, centavos Decimal/ROUND_HALF_UP. Não Price. Base de referência100.000; custos/doses/preço vigente não inferidos. Vetor30d usa0% **somente como exemplo**, não escolha da taxa operacional. Os meses2/3 para vetores60/90 são do exemplo, não autorização para converter todo calendário em30 dias.

### Definidos versus parametrizáveis versus indefinidos

- **Definidos na referência:** percentuais/descontos/faixas, exigência de quitação40%, bloqueio por vencidos/acordo, atraso>5d para pedidos e entregas, revenda independente, dupla aprovação antes produção/entrega, snapshots/auditoria, garantia de safra, triangular apenas formal.
- **Representáveis nos campos atuais, mas sem implantação:** desconto/taxa/método/meses; `max_days`7/30/60/90 para versões específicas; flags financeira/crédito/garantia; atribuição `buyer_scope=partner` ao parceiro FSF validado; `block_if_overdue=true`, bloqueio pedidos sem tolerância. Não criar assignment default global nem publicar planos para outras revendas.
- **Indefinidos (NULL, não usar defaults atuais):** mínimo safra, limite aprovado concreto por safra/parceiro/pedido, taxa exata30d, calendário safra/data inicial/vigência, índice IPCA/CDI/outro, day basis pro-rata, aprovação/alçadas/evidências, taxa por parcelas versus vencimento único, parcelamento, billing_trigger, método pagamento, suficiência e tipos de garantia/aceite.
- Multa2% e mora1%am pro rata são **sugeridas**, não cobrança automática. Índice e antecipação conforme contrato indefinidos. Sem supor30/360, calendário civil, IPCA/CDI cumulativo ou taxa sobre saldo original versus remanescente.
- Gatilho billing não segue de “pagamento antecipado”: preservar instalado `na_entrega` onde existir; não substituí-lo por `na_aprovacao` nem habilitar A2.

## Mapa canônico e autorização

Somente SELECT de metadados/policies no ref `swzpzcwiasxmjutrmvkm`, validado em config; nenhuma consulta de identidades pessoais ou dados comerciais produtivos.

| Domínio | Estruturas/consumidores existentes | Contrato/limite |
|---|---|---|
| Plano comercial | commercial_payment_plans; useCommercialPaymentPlansAdmin | rpc_admin_create_commercial_plan / version / metadata; não confundir com plano SaaS |
| Atribuição privada | commercial_payment_plan_assignments; useCommercialConditions | rpc_cc_upsert_assignment / submit / publish / archive; c2p1_assignment_allowed escopa destino |
| Preço | commercial_condition_item_prices/commercial_price_rules; fn_resolve_b2b_cart | motor vigente exclusivo; histórico não altera tabela/dose/custo |
| Configuração financeira | partner_financial_settings; useB2BFinanceiro, partnerSettings | rpc_update_partner_financial_settings, CAS integral; c2p1_settings_allowed e gates/roles ativos |
| Crédito | fn_b2b_credit_exposure; RPCs escopadas | helper interno postgres/service_role, não endpoint comprador; contas abertas+pedidos pendentes/comprometidos |
| Pedido/termos | create_partner_order_secure; partner_order_payment_terms | c2_order_actor_scope / c2_owner_order_guard, hash/idem, snapshots; não libera writer |
| Agenda | partner_order_payment_schedule | RLS b2b_phase1_order_visible; valores/juros/datas/snapshot não editáveis para adequar referência |
| Títulos | accounts_receivable/installments, financial links | gerador instalado + elegibilidade interna; bateria anterior P0/P1 preservada |
| Identidade | organizations/profiles/user_roles/partner_accounts/partner_users | owner derivado servidor+vínculo ativo; não conceder internos à revenda |
| Documentos | partner_documents/financial_documents/fiscal_invoices | contrato/pedido/NF/duplicata/boleto/aceite são requisitos, não prova; download binário own-owner ainda bloqueado |
| Auditoria | commercial_condition_audit_log/partner_order_audit_logs/financial_audit_log | canal autorizado/correlacionado; log gravável não é receipt de autoridade |

Metadados SELECT: juros MD5 `806e5d8789b08cd6790a10feaf95f26d`, simulação `37d4f45e388ed7b38f6f397b672629ee`, crédito `213ac31f3a30816ead75365b0d1fed18`, configuração `8c2af03a346cc76ea5bb80f07d3b2a68`, create plano `16d256e65fa347929846f8444c4c9db1`, assignment `215d43e1ba4e6342c8659426a39f6002`. Capturas/ACL não equivalem a prova JWT/RLS. Policies de partner_documents lidas incluem papéis internos amplos; isso **não comprova isolamento/download**: manter BLOCKED sem presumir vazamento nem reabrir Storage.

Features/SaaS somente restringem pelo catálogo de capacidades/entitlements existentes; atribuição comercial não concede feature/SaaS, role ou tenant. UI e RLS jamais substituídas pela especificação.

## Testes concretos e limitações

Execução: `test-arbio-fsf-reference.py` reutiliza **setup/helper PG da bateria existente** e corpos de juros/simulação capturados; crédito real capturado213ac31 rechecado por hash e SELECT nesta rodada. Não aplica candidate.sql.review. Fixture local de limite100.000 é cenário sintético, **não limite FSF aprovado**.

| Vetor100.000 | Decimal e corpo instalado |
|---|---:|
| Quitado à vista (somente cálculo) | 60.000,00 |
| 30d0% referência | 65.000,00 |
| 60d1,5% | 72.115,75 |
| 90d2% | 79.590,60 |
| Safra6m2% | 90.092,99 |
| Safra8m2% | 93.732,75 |
| Safra8m2,5% | 97.472,23 |
| Safra8m3% desconto15% | 107.675,46 |

Todos conferem centavos, sem divergência. Corpo de crédito:100.000=OK;100.000,01=LIMIT_EXCEEDED_BLOCK; sem limite=NO_LIMIT_DEFINED; título1.000 com baixa200 e atraso1dia produz800/OVERDUE_BLOCK com tolerância0. Tolerância5 exclui atraso5 e inclui6 — **não atende simultaneamente pedido bloqueado por qualquer vencido e entrega>5d**. Precisam gates distintos existentes/revisados, nunca substituir0por5 automaticamente.

Simulador com40% retorna60.000 sem receipt de quitação; **não é FAIL do simulador**, que apenas calcula. Regra de concessão/liquidação fica BLOCKED até contrato e prova canônica. Parcelas, risco/safra/contrato/garantias/histórico/acordos/recidiva, mora/índice/antecipação, aprovação dupla e faturamento/entrega real não demonstrados por calculador.

PG: **17 PASS / 0 FAIL / 16 BLOCKED / 1 NOT RUN**; dois PASS são hashes não funcionais. Zero PASS real; zero FAIL nesta referência não elimina seis FAIL da bateria anterior. Evidências/CSV/JSON em `docs/auditorias/evidencias-arbio-fsf-20261028/`. Testes TypeScript no consumidor preview/atribuição/método/role; regressões de config CAS/tenant, ACK perdido e entrega executadas conjuntamente, contagem final registrada na matriz. Sem duplicar testes históricos como novas homologações.
Vitest **121/121 em nove arquivos**, 14 novos neste lote. Preview TypeScript usa Number e compara a centavos os vetores previamente conferidos com Decimal no runner Python; não é segunda implementação Decimal. Matriz35 registros:18PASS incluindo grupoVitest/0FAIL/16BLOCKED/1NOT RUN. Revisão independente pediu delimitar cálculos40%/30d, crédito reduzido e nome do teste Number: incorporado, sem certificação jurídica/operacional.
Verificação final16/16 (referência14+integridade matriz2) após ajustes de rotulagem; não somar às121. Erro inicial de fixture `it.each` corrigido somente no teste; verificação automática mais recente build OK às02:36:45 UTC, sem erro atual. `git diff --check` PASS; warnings Router/Dialog legados permanecem. Evidências finais em `vitest-final.log`; não executados build/typecheck manuais.

## Prioridades e recomendações por fases (não executar)

1. **P0 jurídico/fonte/identidade:** obter original5p, validar fórmula/faixas/cláusulas/vigência e resolver parceiro existente AR Bio/FSF em contexto owner canônico; aceite do titular legal. Rollback nesta fase = descartar proposta local, sem efeito produtivo.
2. **P0 financeiro:** reprovar GO enquanto saldo com possível juros duplicados10.300→10.600 e rateio/datas da bateria anterior sem cadeia integral revisada. Provar40% exclusivamente quitado e dois gates vencidos0d/entrega>5d; acordo/recidiva/garantia/risco com autoridade server-side. Não escrever migração baseada em cláusula indefinida.
3. **P1 parâmetros:** definir taxa30d/mínimo/calendário/parcelas/billing/pro-rata/índice/aprovação/documentos. Propor versões comerciais DRAFT e assignment privado FSF, sem modificar versão publicada ou tabela histórica; métodos/categorias existentes ativos obrigatórios.
4. **P1 pacote revisável futuro:** PRE hashes/ACL/RLS/feature/consumidores+CAS; validar transação inteira, idempotência, logs, snapshots e rollback. Publicação somente após revisão independente e autorização específica; não aplicar esta especificação.
5. **Homologação controlada futura:** A/B, dois parceiros mesmo owner, roles cumulativos/isolados, saldo/cancelamento/ACK perdido, snapshots/taxa alterada, quitação parcial/total,5/6dias, produção/CQ reprovado, documentos e cobrança na aprovação/entrega. ZERO cobrança/NF/mensagens reais neste recorte.
6. **Rollback futuro:** arquivar apenas versão/atribuição nova pelo contrato autorizado/CAS; preservar histórico de pedidos/termos/recebíveis; contenção deny-only dos comandos novos se necessário. Nunca restaurar bodies/ACL vulneráveis, apagar parcelas ou rebasear snapshots, nem prometer cancelar in-flight.

## Preços históricos e documentos

Por hectare APENAS referência: Solo1 R$69, Solo2 R$84, BioInseticida01 R$84, BioInseticida02 R$65, BioFungicida R$50, BioInoculante R$25, BioSolubilizador R$50. Sem mapear automaticamente produtos/códigos do catálogo, dose ou ficha; tabela/dose/custo vigentes resolvidos servidor.

Exigir validação de contrato B2B/pedido formal/NF/duplicata ou boleto/aceite; aval/confissão/nota promissória/cessão são exemplos, não defaults jurídicos. Triangular só com acordo formal; nenhum cadastro de produtor para liberar venda da revenda. Armazenamento/receipts e bytes precisam autorização de owner, não URL portadora.

**Não executado:** SQL mutante LIVE/DDL/grants, users/fixtures produtivas, sessões JWT/browser, pagamentos/fiscal, comunicações, migrations/deploy/publicação. Infraestrutura de cálculo offline não valida contrato nem aplicação integral.