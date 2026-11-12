# Auditoria das três origens — execução parcial, 12/11/2026

**Resultado: NÃO COMPROVADO E2E até faturamento.** Nenhuma ação hospedada, publicação, emissão ou cobrança. A autorização de dados fictícios foi aplicada somente aos testes isolados; não foram criados pedidos finais falsos para preencher a matriz.

## Versão e catálogo
Início observado: `c6321e19f489223ae9368a8d50ed700fbb6cea99`. Versão após correção: `639cfd68bbb1762ec03823e56601739fcf7a4544` (hashes dos arquivos efetivos em `evidence/source-manifest.json`; commits automáticos podem avançar com este relatório).
O catálogo tem pendências anteriores de revisão/ativação e navegação integral, registradas em `scripts/catalog-documentary-20261112/mobile-contracts/REPORT.md`; não se declara sua fila inteiramente homologada.

## Primeira falha reproduzível e correção focal
Comando em `evidence/buyer-finance-tests.log`: `novoPedidoQuoteOnly.test.tsx`, cenário quote_only com meio explícito. A criação simulada chegou ao ACK, mas apareceu a chamada inesperada `tenant_catalog_active_families_v1` no portal B2B; teste terminou exit 1 (57 PASS / 1 FAIL).
Causa: novo filtro compartilhado consultava leitor interno de famílias também no portal externo, contrariando o rollout B2B separado. Corrigido na origem `src/hooks/useActiveCatalogFamilies.ts`: consulta interna desabilitada para parceiro B2B/técnico, cliente e Superadmin; leitores canônicos existentes do parceiro permanecem inalterados. Sem alterar permissões, gates ou corpos servidor.
Reteste mesma bateria + contratos catálogo: 67/67 PASS, exit 0. Testes adicionais concretos dos dois papéis externos: zero consulta interna; rodada final 16/16 PASS. Falha inicial preservada, não reclassificada como defeito financeiro/fiscal confirmado.

## Matriz por origem e perfil
| Origem/perfil individual | Rota real | Entrada/UI | ID sintético persistido SQL | Totais/aprovações/handoff | Recebível/documento fiscal |
|---|---|---|---|---|---|
| Parceiro `parceiro_b2b` | `/portal-parceiro/novo` (catálogo também reaproveita NovoPedido) | Vitest React com transporte sintético: meio/cotação, bloqueios, ACK único, respostas inválidas e incerteza exercitados | NÃO COMPROVADO; `d4539dd9-b090-4433-9ed3-6f8f5d3e767b` é ID fornecido pelo mock, não registro nesta auditoria | Valores do mock, não totais persistidos. Aprovações posteriores não ligadas ao pedido deste cenário | NÃO COMPROVADO |
| Comercial `gestor_comercial` | `/comercial/pedidos-b2b/novo` | Playwright com página real/identidade sintética + RPC vazio: bloqueio `invalid_response`, zero envio; Vitest verifica carteira/tenant/isolamento de carrinho | Nenhum criado | NÃO COMPROVADO nesta origem | NÃO COMPROVADO |
| Vendedor `vendedor` | `/comercial/minha-carteira/pedido` | Playwright página real/identidade sintética + RPC vazio: acesso indisponível, zero envio; Vitest verifica carteira exclusiva, impedimento fiscal e rotas separadas | Nenhum criado | Vendedor não aprova comercial/crédito; regras não contornadas. Positivo com persistência NÃO COMPROVADO | NÃO COMPROVADO |
| Aprovação `gestor_comercial` | `/comercial/pedidos-b2b` | Painel React real com respostas sintéticas: eixo comercial explícito separado do crédito, poderes por papel | ID do painel `11111111-2222-4333-8444-555555555555` é mock, não persistido | Cenários de 0/1/2 aprovações, bloqueios e previsão única testados por contrato/UI; não cadeia SQL das três origens | Bloqueio operacional/fiscal mantido |
| Crédito/handoff `financeiro` | Financeiro B2B → Aprovações de crédito; `/comercial/pedidos-b2b` | Clique real em React aplica crédito uma vez por transporte sintético; revisão/reprovação e motivo, erros/reconciliação testados | Não ligado a registro SQL das três origens | Previsão R$20 no painel sintético; testes de residual 18→9→0 são parser/fixtures, não faturamento executado | NÃO COMPROVADO por persistência |
| Outra empresa/outros papéis | Rotas de entrada acima | Negativas tenant/URL/carteira/perfil executadas em Vitest; nenhum papel adicional atribuído | Não criado | Não autorizam escopo estrangeiro | Não autorizado |

## Separação das camadas
- **RPC/SQL com backend atual:** BLOCKED antes da restauração: `/tmp/r12/fullstack.dump`, `/tmp/r12/globals.sql` e espelho vendedor não disponíveis. Preflight versionado em `evidence/mirror-preflight.json`. Não executar preparador final que regenera pins sobre base ausente.
- **Reconstrução histórica:** fontes existem, mas helpers usam `session_replication_role=replica` e/ou costuras de configuração/reatribuição de planos. Não foram executados para passar esta auditoria de papéis/controles intactos. Provas antigas r12 não foram contadas como rodada atual.
- **SQL componente:** bateria catálogo PostgreSQL descartável executada nesta rodada (17 checks dentro dos testes), não envolve pedido/financeiro/fiscal e não prova o backend inteiro.
- **Browser sintético:** duas telas comerciais reais no Playwright, papéis distintos e transporte RPC vazio; rede externa bloqueada, zero pageerrors, nenhum POST de pedido. Não é fluxo positivo nem sessão JWT real. Capturas locais em `/tmp/browser/order-three-origins/`; script reproduzível nesta pasta de evidência, sem credenciais.
- **React/Vitest:** 70/70 na primeira bateria, depois 57/58 com regressão preservada, 67/67 no reteste e 16/16 finais. Baterias sobrepostas: não somar como cenários únicos. Transportes sintéticos não confirmam persistência.
- **Sessão real:** NÃO EXECUTADA. Não criar contas/convites, usar produção nem pedir credenciais para suprir espelho ausente.

## Rascunho não é autorização fiscal
`PENDING_ACCOUNTING`, aptidão MG declarada, NF DRAFT ou pedido com duas aprovações econômicas não constituem autorização SEFAZ. Mensagem observada/testada: “Aprovações comercial e de crédito concluídas. Liberação operacional para faturamento pendente.” `eligible/reasons` permanecem bloqueantes. Nenhuma NF homologatória autorizada, XML válido, protocolo, título ou cobrança foi criado nesta auditoria.
Recebível definitivo exige callback fiscal canônico confirmado; previsão não exigível é distinta. Não ativar candidatos/allowlists ou mudar revisão contábil para ultrapassar o gate.

## Bloqueios concretos para continuar
1. Composição backend atual reproduzível, integral e hash-pinned com schema/corpos/ACL/RLS/triggers; restauração de dados somente sintéticos sem remover controles e com papéis individuais. Fontes atuais instaladas de diagnóstico/seq/cancelamento e vendedor devem ser conferidas, não inferidas de relato.
2. Transporte UI→PostgREST local ligado a essa composição e autenticação local isolada, preservando cliente/origem de produção; nenhum servidor novo publicado no projeto.
3. Concluir pendências do catálogo sem ativação hospedada para respeitar ordem da fila.
4. Depois, repetir cada origem até sua primeira barreira real, registrar IDs/valores de leitura SQL e, somente se implementado/permitido pelo contrato local, documento de homologação e callback sem rede.

Não se solicita exportação de dados reais ou segredos. Não certificar fluxo completo a partir de mocks nem habilitar gates para fabricar o positivo.
