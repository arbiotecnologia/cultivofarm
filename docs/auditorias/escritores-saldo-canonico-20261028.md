# Fechamento da causa-raiz — escritores e saldo canônico B2B

## Resultado e escopo

**NO-GO para SQL implantável, frontend e remediação histórica.** Causa monetária identificada: financiamento é copiado duas vezes na geração, e o significado da coluna de juros muda quando ocorre a primeira baixa. O experimento harmonizado agora cobre o loop integral de atribuições do escritor alternativo, não sua autorização integral. Nenhuma correção unilateral aplicada.

Base inspecionada: `1da2c3136beb670d0b94578ee880d24cd06dea41`; árvore inicialmente limpa. Capturas anteriores, DRAFT, Entregas e pacotes de SQL review anteriores preservados. Nenhum revert, alteração de dependências, sessão ou dado produtivo.

## Captura atual: metadados, não títulos reais

Destino confirmado pela CLI: Supabase externo `swzpzcwiasxmjutrmvkm`. Consultas `supabase.read_query` exclusivamente SELECT sobre catálogos, sem executar RPCs financeiras ou ler linhas de clientes/pagamentos.

- `receivable-writers-live-20261028.json`: **59 corpos** com OID, assinatura qualificada, owner, ACL, MD5 e texto exato; busca por AR, eventos e schedule.
- `receivable-writers-dependencies-live-20261028.json`: **46 helpers diretos**, dez relações com OIDs, colunas, constraints, RLS/policies e triggers/corpos.
- União: **105 corpos distintos**, matriz lexical de **16 escritores diretos** e leitores/guards. **64 correspondências com a captura anterior, zero drift MD5**. Isso não equivale a 64 contratos diferentes certificados nem atualidade das dependências restantes.
- Pinos e hashes SHA256 em `evidencias-escritores-saldo-20261028/pinos-drift.json` e `SHA256SUMS`; índices históricos continuam no manifesto anterior, sem nova homologação de índices.

Matrizes: `matriz-escritores-leitores-sql.csv` (105 linhas, OID/MD5/ACL/owner, linha dentro do corpo, campos e chamados qualificados ainda não capturados); `matriz-consumidores-runtime.csv` (17 arquivos, MD5 e linhas de referência). Busca lexical não fecha SQL dinâmico, importador externo nem chamada montada por nome.

## Contrato semântico inequívoco: observado versus harmonização proposta

| Campo | Semântica observada / proposta limitada |
|---|---|
| `terms.table_amount` | Tabela congelada no snapshot comercial; nunca substituída por preço atual. |
| `terms.net_amount_after_discount` | Base líquida congelada, distinta do total financiado. |
| `terms.final_amount` / AR `total_amount` | Total contratado financiado do título; não saldo nem caixa realizado. |
| schedule `principal_amount`, `interest_amount`, `amount` | Principal, remuneração inicial e total da parcela respectivamente; fonte econômica vinculada ao `payment_terms_id` canônico. |
| parcela `original_amount` / `net_amount` | **Total financiado imutável**, copiado de schedule.amount no fluxo externo; net não é saldo dinâmico. No manual/genérico corresponde ao valor original gerado. Não converter para principal. |
| parcela `interest_amount` | **Conflito LIVE**: remuneração inicial no INSERT/UPDATE B2B; soma dos encargos dos eventos após recálculo. Não existe semântica uniforme instalada. Proposta: somente acumulado de encargos de eventos. |
| `penalty_amount`, `discount_amount` | Ajustes monetários dos eventos, somados inclusive estornos; não a taxa comercial de desconto do pedido. |
| parcela `received_amount` | Soma de `receivable_payments.amount_received`, incluindo eventos reversores negativos. |
| `amount_paid` | Campo de eventos **payable**, não renomear recebimentos AR nem criar alias paralelo. |
| `outstanding_balance` | Não é coluna nas duas tabelas capturadas; nome não encontrado nos corpos novos. Saldo é projeção, com aliases `balance`/`saldo` em consumidores específicos. Não inventar campo persistido. |

Proposta de saldo exigível: `max(0, original + encargos_eventos + multas_eventos − descontos_eventos − recebimentos_eventos)`, com centavos. Remuneração inicial já está em original. Caixa realizado continua baseado nos eventos; competência e exposição de crédito precisam contratos próprios, não igualdade universal de métricas.

### Cadeia da duplicação

1. `fn_generate_receivable_installments()` MD5 `f632f15c9f46cb9889082fc533a27ea1`: ramo externo copia amount=10.300 em original/net e juros=300 na coluna operacional.
2. `generate_b2b_receivable_secure_impl(uuid)` MD5 `1bdac7fae6d702fb42d3a30539e9c9c3`: insere título final e loop repõe os mesmos juros; corrigir somente o trigger não resolve.
3. `rpc_register_receivable_payment(uuid,jsonb)` MD5 `db41f7e2cfcb196ef64536f62746f365` e `calcularSaldoRecebivel`/`saldoParcela`: fórmula aditiva permite saldo inicial **10.600** e baixa majorada.
4. `fn_recalc_receivable_installment()` MD5 `c8a1d33461c76eb3da3c7af1c011cf2b`: substitui juros por SUM(eventos); financiamento desaparece da coluna de ajustes mas continua em original.

Experimento local mínimo: INSERT externo com juros operacionais zero; loop de atribuições com juros operacionais derivados de SUM(eventos), sem mudar original/net/datas e sem tocar no financiamento do schedule. Não apagar multa/desconto/recebimentos nem recalcular política atual. Original=10.300; baixa3.000 + juros100 + multa200 − desconto50 dá **7.550**; segunda baixa1.000 dá6.550; estorno da primeira mantém9.300.

O loop original executado após baixa produz **7.750**, pois troca juros100 por300. Loop experimental preserva7.550 e snapshot de juros iniciais300. Esse PASS é **do bloco extraído**, não do wrapper/core inteiro, gates, tickets ou RLS.

## Todos os caminhos encontrados e fronteira de cobertura

- Geração B2B: wrapper → autorização/escopo → pedido FOR UPDATE → advisory → priceable → impl → elegibilidade/termos/fiscal/referências → INSERT/trigger → loop → vínculo → status/audit. Wrapper contém bloqueios de origem/contabilidade; não foram contornados para fabricar sucesso.
- Automático `tg_auto_b2b_receivable`: aprovação aborta atomicamente em falha financeira; outros momentos podem registrar falha. Não libera gatilho billing indefinido.
- Manual `rpc_create_financial_title`: contexto privado txid/ator/tenant de parcelas; não criar bypass para B2B.
- Recorrência e reversão: `fn_generate_recurring_title`, `fn_revert_recurring_generation`; calendário/ledger/guards completos não instalados no ensaio.
- Entrega histórica: `fn_generate_receivable_from_entrega` contém DELETE/reinserção em ramo customizado, incompatível com contenção de histórico; A2 segue não homologada, não executar nem remover guardas.
- Pagamento e estorno: eventos append-only, recálculo e auditoria; cancelamento de recibo não estorna pagamento.
- Cancelamentos: `cancel_b2b_receivable_secure` fechado; `rpc_cancel_financial_installment` sem tenant no corpo continua FAIL sintético, não ataque real provado.
- Fiscal manual e vínculo de entrega atualizam metadados AR; não prova importação financeira.
- Importação/encontro de contas: **writer não identificado**. Scripts externos/admin/SQL dinâmico permanecem não demonstrados, não alegar inexistência.
- Edges runtime-harness contêm cleanup privilegiado DELETE; não executados, não são mecanismo permitido de remediação.
- Frontend: NovaConta/Baixa/Estorno/ContaDrawer/ContasReceber/useB2BFinanceiro; BI FluxoCaixa/DRE/recorrência/portal/ReportShell e Edge exportadora usam tabelas/nomes de RPC condicionais. Nenhum arquivo runtime alterado.

## Testes realmente executados

| Grupo PG | PASS | FAIL | BLOCKED | NOT RUN |
|---|---:|---:|---:|---:|
| Baseline | 56 | 13 | 0 | 0 |
| Experimento não instalável | 66 | 4 | 0 | 0 |
| Gates reais/integrados | 0 | 0 | 8 | 1 |
| **Total** | **122** | **17** | **8** | **1** |

**148 cenários**, matriz/execucao.json/log em `evidencias-escritores-saldo-20261028`. Não somar com80PASS/14FAIL históricos. Runner existente ampliado, opção `--writers-phase` preserva destino das evidências anteriores. Corpos monetários reais com MD5 conferido; Auth/H15/staff/tabelas reduzidos, FKs/RLS/SaaS/fiscal/risco excluídos explicitamente. Exit zero indica diagnóstico concluído; `has_failures=true`, `operational_go=false`.

Cobertura nova: loop exato baseline versus hipótese, repetição depois da baixa, snapshot imutável e transação abortada sem compensação, duas sessões mesma chave/ACK único, chaves distintas excedendo saldo, estorno simultâneo, diagnóstico agregado. Proposta nega10.600 nas duas sessões. Recibo/cancelamento simultâneo e revogação durante locks com guards reais permanecem BLOCKED. Concorrência exercitada localmente não é homologação JWT.

Vetores AR Bio×FSF **são fixtures de totais previamente confirmados**, sem repetir cálculo de taxa:0/1/6/8/12meses; desconto40%,0%/1,8%/2% preservados. Quantidade de parcelas na fixture é mecânica, não contrato de amortização/calendário. Rateio em centavos, baixas/estornos conferem conservação; prazos fracionários/parcelamento/billing pendentes.

**Vitest194/194 em12 arquivos**, dois novos casos de preservação de ajustes e centavos; regressões de contas/baixa/estorno/caixa/DRE/reconciliação/Entregas/matriz. Execução preliminar189/189 em10arquivos não somada. Sem browser autenticado, sessão real, RLS/JWT ou razão contábil.

## Dependências exatas que impedem SQL review instalável

Novos46helpers incluem billing eligibility/priceable/fiscal/origin e wrappers h15/roles. **Capturado não significa integrado**. Faltam fechamento recursivo de chamados, instalação fiel de:

1. `platform_private.platform_actor_access_ready`, `entitlements_for_user`, infraestrutura/tabela de tickets, auth.users/perfis/user_roles e sessões: nenhum stub pode certificar autorização.
2. Triggers tenant/SaaS/risco/status e guards de origem em todas as tabelas; schemas/enums/FKs/index/ACL completos, não apenas dez relações novas.
3. `partner_order_items`, parceiros/organizações/clientes, catálogo global categorias/métodos/contas, dados de risco/governança, company fiscal e resolver/fiscal auxiliares.
4. Infraestrutura privada `financial_initial_installments`, recorrências/log e helpers de calendário; payable completo para caminhos condicionais/compensações.
5. Cadeia inteira wrapper/impl/autotrigger com origem autorizada e fiscal/priceável, sem ticket/JSON fabricado; contratos BI/exposição/competência e eventuais importadores dinâmicos.
6. Reprovação/CQ, na_aprovacao/na_entrega, envase/B2B e cross-tenant JWT A/B continuam gates externos, não ganhos por este experimento.

**Não há novo candidate.sql.review, PRE/POST executável ou rollback emitido**: fronteira integral ainda desconhecida. OID/MD5/ACL/corpos e diff conceitual estão preparados; não tratá-los como preflight. Futura proposta deverá pinçar corpos/ACL/owners/policies/triggers/índices antes/depois, validar atomicidade/replay e conter writers com deny-only, jamais restaurar corpo vulnerável ou transformar histórico.

## Remediação histórica separada, somente diagnóstico

`receivable-history-diagnostic.sql.readonly` é SELECT inativo para auditor: deriva empresa de h15/staff, retorna apenas contagens, suprime grupos com menos de5títulos. **Executado apenas no PG sintético**, nunca sobre registros LIVE. Não exporta IDs, valores, JSON, nomes ou dados pessoais. Contagem divergente não classifica automaticamente juros como duplicados: pagamentos/estornos podem mudar a proveniência.

Plano por empresa: autorização do auditor → diagnóstico agregado → conciliação manual restrita com termos canônicos, schedule vinculado, original, eventos/auditoria/recibos → separar título intacto, pago/estornado, origem ambígua e snapshot divergente → validação contábil/jurídica → autorização específica de procedimento futuro. Não recalcular política atual, fazer UPDATE retroativo, apagar/recriar parcelas, compensar nem alterar documentos emitidos automaticamente. Não inventar ledger contábil paralelo.

**P0:** dupla remuneração inicial; replay de writer que substitui encargo do evento; baixa acima do total e cancelamento sem tenant no corpo. **P1:** aging omite ajustes exigíveis frente ao saldo operacional, métricas BI/crédito e rateio/calendário ainda a contratar. Não quantificar impacto produtivo sem conciliação autorizada. Produção, histórico e cobrança/fiscal permanecem preservados.
## Revisão independente e limitações adicionais

Revisão read-only confirmou hashes de duas capturas/64comparações e17consumidores, NO-GO e fronteira parcial. Incorporados: validação dos dois ACKs de estorno/UUID único/uma linha reversora, grupos1/4/5 no diagnóstico e indicador juros/eventos. Matriz renomeia a coluna para referências lexicais que podem ser relações, não funções ausentes certificadas; campos também são lexicais e podem pertencer ao ramo payable. `fn_h6b_num` existe no manifesto antigo/harness embora fora da união nova.

As duas sessões são lançadas juntas, mas **não há sinal comprovando espera simultânea na região crítica**; resultado é de duas sessões, não certificação de contenção/locks. Ainda faltam validar auditoria concorrente completa, recibo/cancelamento e ordenamentos de revogação. Diagnóstico não detecta vínculos schedule nulos nem garante cobertura/multiplicidade; foreign_child depende da visibilidade RLS. Flags são apenas triagem manual e não prova de juros duplicados; jamais autorização de UPDATE. Os seis indicadores completos/0títulos e RLS real ficam não homologados.
