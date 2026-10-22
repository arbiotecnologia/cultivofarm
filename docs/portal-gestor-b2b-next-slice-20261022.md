# Portal gestor B2B — inventário inicial e próximo recorte

## Situação e evidência
C2-CAT publicado externamente pelo auditor: HEAD318957a2/deploymentafa325c5, UI teste4 catálogo35 itens (11 produtos24micros); filtros químicos/adubos vazios, não homologação positiva dessas famílias. AdministradorB projeção200null/cross-parceiro403. Provas do auditor, não do proprietário/agente; sem recarga. Monitor “verificando acesso” e reset/desanexação de filtros permanecem pendentes, causa não comprovada.

## Matriz inicial operação × perfil × empresa (não concessão de acesso)
| Operação | Módulo/contrato existente | Gestor B2B — escopo | Técnico / produtor | Estado |
|---|---|---|---|---|
| Catálogo/fichas | OwnerCatalog, usePartnerCatalog, FichasTecnicas, projeção C2_CAT_V1 | Parceiro validado + tenant/owner + entitlement | Técnico só fichas permitidas; produtor não herda | Promovido C2-CAT; UI pendente |
| Dashboard indicadores/pendências | DashboardPremium, usePartnerDashboardPremium/useCommercial | Indicadores próprios; mensagens/modelos requerem provas separadas | Nenhum acesso financeiro herdado | Não montar DashboardPremium integral por conter mensagens/favoritos e links de escrita |
| Pedidos próprios — lista | CommercialOwnOrders/useMyCommercialOrders/get_my_commercial_orders_projection | RPC derivada do ator, resposta partner_id exato, máximo100; escopo limitado a id/número/status/data | Hook atual exclusivo gestor; técnico/produtor não herdam | Existente no dashboard owner; candidato a primeiro recorte de indicadores sem sondagem extra |
| Financeiro parceiro | Financeiro/usePortalPartnerFinancial/rpc_portal_partner_financial | Ordem/título/parcelas pertinentes ao parceiro; precisa provar se obrigação do parceiro ou recebível fornecedor | Técnico sem financeiro; produtor somente seu contrato próprio | Bloqueado owner; inspecionar SQL/ACL/RLS/transitivos antes de montar |
| Financeiro interno fornecedor | useB2BReceivables, rpc_b2b_financial_kpis, geração/cancelamento/settings | Não é acesso automático do gestor externo; custos/saldos internos excluídos | Negado por capacidade de catálogo | Não reutilizar reader interno para inventar finanças próprias |
| Pedidos/itens | MeusPedidos/usePartnerOrders/usePartnerOrderItems | Parceiro/alvo/tenant e filhos comprovados, consultas separadas de escrita | Matriz por operação | Não abrir página completa sem inventário de filhos/mutations |
| Simulações | SimulacoesEquipe/usePartnerSimulations, conversão/archive RPC | Gestor financeiro versus técnico price-free; snapshots canônicos | Técnico mantém contrato preço-zero; produtor próprio escopo | Página atual agrega profiles, itens e mutations; não montar por catálogo200 |
| Entregas/OS | Encadeamento pedidos/entregas/OS existente a inventariar | Só cadeias pertinentes à empresa, não produção interna do fornecedor | Vínculos técnicos/produtor reais | Não homologado; sem criar vínculo/backfill nem fabricação químico/adubo |
| Equipe/vínculos | UsuariosClientesB2B/TecnicosProdutores e cadastro canônico | Autoridade administrativa específica, CAS/idempotência/auditoria | Papéis externos cumulativos independentes | PUC e writers C2.1 fechados; readers/provisioner exclusivos incompatíveis |
| Seleção portal | /selecionar-portal/useAvailableContexts/get_my_available_portal_contexts/set_my_context_preference | Contextos canônicos vigentes, não primaryRole inventado | Gestor/técnico/produtor reais e vínculos cliente/fazenda | Evolução coordenada separada; não remover count=1 isoladamente |

## Próximo recorte executável proposto: dashboard de acompanhamento próprio
1. Reutilizar a lista canônica já existente de pedidos próprios; agregar somente linhas autorizadas, sem chamadas extras e sem usar DashboardPremium inteiro.
2. Exibir contagens/status observados e pendências conhecidas; a lista é limitada100, portanto não chamar o resultado de total global nem inventar saldo. Não inferir pagamentos/entregas físicas pelo nome do status.
3. Links apenas para catálogo/fichas com capacidades C2_CAT_V1 e entitlements; nenhum link de escrita/financeiro sem capacidade específica homologada.
4. Corrigir stale/error/fences no reader próprio somente se reproduzido; manter lease/monitor. Recorte candidato inativo, diff separado, testes ator/tenant/revogação/tardias/limite/status e owner sem capacidades de irmãos.
5. Antes do recorte financeiro, capturar preflight somente leitura das RPCs/ACL/owner/entitlements/tenant/cadeia; documentar se o contrato atual expressa finanças do parceiro ou contas internas do fornecedor. Migration candidata guardada e rollback seguro só se necessária; nunca executar hosted nesta fase.

## Gates e limites
Dashboard em scripts/manager-own-dashboard-20261022 promovido só localmente após revisão: componente/agregador e parser reader sem defaults.29/29 Vitest+types PASS, regressões C2-CAT30/30 e build automático OK; mocks não certificam JWT/RLS/UI real. Nenhum SQL hosted/publicação.
Financeiro concreto separado INATIVO em scripts/partner-own-finance-20261022: inventário LIVE somente leitura, overload da RPC existente, página/hook, pre/postflight e rollback deny.30/30 PostgreSQL sintético+21/21 Vitest/types PASS. RPCs legadas continuam fechadas; projeção só obrigações de pedidos perante fornecedor e parcelas/pagamentos registrados, não receita/saldo próprio. Documentos sem prova owner-specific fechados. Entitlements e capability financeira coordenada ainda exigem revisão antes de instalação/promoção; REST/JWT/UI pendentes.
Nenhum novo grant/role/dado/fluxo paralelo; não atribuir gestor interno nem abrir Outlet inteiro. C2.1 só poderá avançar com consumidores/provisioner coordenados e triggers completos testados. Publicação C2-CAT antecede ativação de próximo recorte. Objetivo funcional ampliado não aprova permissões desconhecidas.
SU518022/CDN, anexos/perfis/origin-deny, monitor, XML/OS/CQ/termos, conteúdo técnico não vazio e demais backlog continuam adiados, não resolvidos.