# Manual do Usuário — AR Bio Manager

> Documento consolidado de usabilidade. Descreve **o que existe hoje no sistema** e **como usar cada recurso**, área por área, seguindo exatamente a navegação real da aplicação.
> Documentação técnica correspondente: [`docs/REFERENCIA-TECNICA.md`](./REFERENCIA-TECNICA.md).
> Última revisão: julho/2026.

---

## Sumário

1. [Visão geral do sistema](#1-visão-geral-do-sistema)
2. [Glossário](#2-glossário)
3. [Acesso, login e portais](#3-acesso-login-e-portais)
4. [Perfis de usuário e o que cada um enxerga](#4-perfis-de-usuário-e-o-que-cada-um-enxerga)
5. [Como navegar](#5-como-navegar)
6. [Dashboard](#6-dashboard)
7. [Comercial e Relacionamento](#7-comercial-e-relacionamento)
8. [Campo e Assistência Técnica](#8-campo-e-assistência-técnica)
9. [Produção On-Farm](#9-produção-on-farm)
10. [Financeiro](#10-financeiro)
11. [Financeiro B2B](#11-financeiro-b2b)
12. [Inteligência e Controle](#12-inteligência-e-controle)
13. [Administração e Configurações](#13-administração-e-configurações)
14. [Módulo Fiscal](#14-módulo-fiscal)
15. [Módulo de Comunicação e Notificações](#15-módulo-de-comunicação-e-notificações)
16. [Portal do Produtor](#16-portal-do-produtor)
17. [Portal do Parceiro B2B](#17-portal-do-parceiro-b2b)
18. [Aplicativo móvel (`/app`)](#18-aplicativo-móvel-app)
19. [Páginas públicas](#19-páginas-públicas)
20. [Processos ponta a ponta](#20-processos-ponta-a-ponta)
21. [Perguntas frequentes e erros comuns](#21-perguntas-frequentes-e-erros-comuns)

---

## 1. Visão geral do sistema

O AR Bio Manager é a plataforma de gestão da operação de bioinsumos on-farm da AR Bio. Ele cobre o ciclo completo:

```text
Cliente/Fazenda → Visita técnica → Recomendação → Ordem de Serviço
      → Planejamento (PCP) → Produção do lote → Controle de Qualidade
      → Envase → Estoque → Entrega → Confirmação em campo → Faturamento
```

Em torno desse eixo operacional existem os módulos de **Comercial**, **Financeiro**, **Financeiro B2B**, **Inteligência (BI e relatórios)**, **Fiscal** e **Comunicação**, além de três experiências dedicadas: **Portal do Produtor**, **Portal do Parceiro B2B** e o **aplicativo móvel de campo**.

O sistema é multiperfil: a mesma base de dados é apresentada de formas diferentes conforme o papel do usuário, com regras de acesso aplicadas tanto na interface quanto no banco de dados.

---

## 2. Glossário

| Termo | Significado |
|---|---|
| **OS** | Ordem de Serviço — pedido formal de produção de um bioinsumo para um cliente. |
| **Lote** | Batelada física produzida no laboratório on-farm, vinculada a uma ou mais OS. |
| **CQ** | Controle de Qualidade — análise laboratorial que aprova ou reprova o lote. |
| **Envase** | Etapa de embalagem e identificação do produto aprovado. |
| **PCP** | Planejamento e Controle da Produção — define quando cada OS entra em produção. |
| **On-farm** | Produção realizada na própria fazenda / unidade próxima ao cliente. |
| **Talhão** | Subdivisão da fazenda usada como unidade de manejo e histórico agronômico. |
| **Protocolo** | Receita agronômica padronizada (produto, dose, alvo, momento de aplicação). |
| **Recomendação** | Indicação técnica gerada na visita, que pode virar OS. |
| **Aplicação** | Registro do uso do produto em campo, após a entrega. |
| **B2B / Parceiro** | Revenda ou distribuidor que compra e representa a AR Bio junto a produtores. |
| **DLQ** | Dead Letter Queue — fila de mensagens de comunicação que falharam definitivamente. |
| **Feature flag** | Chave que liga/desliga um recurso sem alterar código. |

---

## 3. Acesso, login e portais

### 3.1 Entrar no sistema

1. Acesse a rota `/auth`.
2. Informe e-mail e senha cadastrados.
3. Após autenticar, o sistema redireciona automaticamente para a **página inicial do seu perfil** — você não precisa escolher para onde ir.

Destino automático por perfil:

| Perfil | Vai para |
|---|---|
| Administrador, Gestor | `/dashboard/geral` |
| Cliente/Produtor | `/portal` |
| Parceiro B2B | `/portal-parceiro/pedidos` |
| Parceiro B2B Técnico | `/portal-parceiro/dashboard` |
| Consultor Técnico, Técnico Agrônomo, Aplicador | `/app` (aplicativo móvel) |
| Gestor Comercial | `/comercial/dashboard-consolidado` |
| Financeiro | `/financeiro` |
| Operador On-Farm | `/cockpit-laboratorio` |
| Produção | `/operacao/dashboard-producao` |
| Administrativo | `/solicitacoes` |

### 3.2 Acesso pendente

Se o usuário existe mas ainda **não tem papel atribuído**, ele cai em `/acesso-pendente`. Nessa tela ele vê a orientação para procurar um administrador. Um administrador resolve isso em **Configurações → Usuários**, atribuindo o papel adequado.

### 3.3 Seleção de portal

Usuários que acumulam mais de um contexto (por exemplo, é produtor **e** tem acesso técnico) veem a tela `/selecionar-portal`, onde escolhem em qual experiência querem trabalhar. A escolha fica salva e é sincronizada entre abas abertas do navegador.

> **Administrador não passa por essa tela.** O administrador tem acesso integral e é levado direto ao painel; ele ainda pode navegar manualmente para qualquer portal digitando a rota ou usando os itens de menu.

### 3.4 Sem permissão

Ao tentar abrir uma rota fora do seu escopo, o usuário é levado a `/sem-permissao`, com a indicação de voltar à sua área inicial. Isso é esperado e não indica erro do sistema.

### 3.5 Sair

Botão de sair no canto superior direito do cabeçalho (ícone de porta). Encerra a sessão em todas as abas.

---

## 4. Perfis de usuário e o que cada um enxerga

Papéis existentes no sistema:

`administrador` · `gestor` · `gestor_comercial` · `consultor_tecnico` · `tecnico_agronomo` · `aplicador` · `operador_onfarm` · `producao` · `administrativo` · `financeiro` · `cliente_produtor` · `parceiro_b2b` · `parceiro_b2b_tecnico`

Resumo prático:

| Perfil | Foco de trabalho | Áreas típicas |
|---|---|---|
| **Administrador** | Acesso total, configuração e governança | Todas |
| **Gestor** | Visão executiva e decisão | Dashboards, BI, Financeiro, Comercial |
| **Gestor Comercial** | Carteira, campanhas, propostas | Comercial, Clientes, Catálogo, Simulador |
| **Consultor Técnico / Técnico Agrônomo** | Campo, visitas, recomendações | App móvel, Visita Técnica, Fazendas, Protocolos |
| **Aplicador** | Execução em campo | App móvel, Aplicações |
| **Operador On-Farm** | Laboratório e produção | Cockpit Laboratório, Lotes, CQ, Envase |
| **Produção** | Fluxo produtivo e PCP | Dashboard Produção, Planejamento, OS, Estoque |
| **Administrativo** | Triagem de demandas e apoio | Solicitações, Clientes, Entregas |
| **Financeiro** | Contas, caixa, DRE, cobrança | Financeiro, Financeiro B2B, Relatórios |
| **Cliente/Produtor** | Acompanhar sua própria operação | Portal do Produtor |
| **Parceiro B2B / B2B Técnico** | Pedidos, catálogo, carteira de produtores | Portal do Parceiro |

Cada item de menu respeita esse mapeamento — se você não vê uma área, é porque seu papel não a inclui.

---

## 5. Como navegar

- **Barra lateral (desktop):** agrupada em oito seções, na ordem — Dashboard, Comercial e Relacionamento, Campo e Assistência Técnica, Produção On-Farm, Financeiro, Financeiro B2B, Inteligência e Controle, Administração. Cada seção pode ter subgrupos.
- **Busca de navegação:** os itens possuem palavras-chave/apelidos (ex.: "cashflow" encontra Fluxo de Caixa; "os" encontra Ordens de Serviço), então basta digitar o termo que você usa no dia a dia.
- **Cabeçalho:** mostra seu nome, seu papel, o sino de alertas operacionais, o sino de notificações e o botão de sair.
- **Rotas antigas continuam funcionando:** links salvos como `/executivo`, `/painel-operacional`, `/auditoria-sync`, `/financeiro/configuracoes` ou `/comercial/dashboard-b2b` redirecionam automaticamente para o destino atual, preservando filtros na URL quando aplicável.
- **Mobile:** navegação por abas na parte inferior da tela, com um botão flutuante de registro rápido para o consultor.

---

## 6. Dashboard

### 6.1 Visão Geral — `/dashboard/geral`
Página inicial de administradores e gestores. Consolida os indicadores do momento: demandas abertas, produção em curso, entregas pendentes e alertas ativos. Use-a como ponto de partida diário.

### 6.2 Visão Executiva — `/dashboard/executivo`
Painel de direção, organizado em abas:

| Aba | Conteúdo |
|---|---|
| Operacional | Cartões de resumo, score de saúde operacional e linha do tempo de eventos |
| Financeiro | Resumo financeiro do período |
| Clientes & Fazendas | Concentração e evolução da carteira |
| Alertas & Ações | Pendências que exigem decisão |
| Relatórios | Geração de relatórios executivos |
| Gargalos | O que está travando a esteira, por severidade |

**Como usar:** escolha o período no filtro (padrão: 30 dias), ajuste os demais filtros e use o botão de atualizar no cabeçalho para recarregar todas as abas de uma vez. A data/hora da última atualização fica visível para você saber a recência dos dados.

### 6.3 Visão Operacional — `/dashboard/operacional`
Foco no andamento do dia: filas por etapa, atrasos e o que precisa de ação imediata na operação.

---

## 7. Comercial e Relacionamento

### Visão Comercial
- **Dashboard Consolidado** (`/comercial/dashboard-consolidado`) — panorama comercial unificado, incluindo B2B.
- **Indicadores** (`/comercial/indicadores`) — KPIs de desempenho comercial por período.
- **Alertas Comerciais** (`/comercial/alertas`) — oportunidades e riscos de carteira.

### Clientes e Propriedades
- **Clientes** (`/clientes`) — lista com busca e filtros; abas separam clientes diretos e parceiros. Clique em um registro para abrir o detalhe (`/clientes/:id`), com dados cadastrais, fazendas vinculadas, histórico de atendimento e situação financeira.
  - *Cadastrar:* botão de novo cliente → preencher identificação (CPF/CNPJ com máscara automática), contato, endereço e responsável técnico → salvar.
  - *Erros comuns:* CNPJ inválido ou já cadastrado; inscrição estadual fora do formato do estado.
- **Fazendas** (`/fazendas`) — propriedades vinculadas aos clientes; o detalhe (`/fazendas/:id`) traz talhões, cultura e histórico. Talhões têm página própria de histórico (`/talhoes/:id`) com a linha do tempo agronômica.

### Demandas e Vendas
- **Solicitações** (`/solicitacoes`) — caixa de entrada das demandas internas e das solicitações vindas do produtor. Fluxo: receber → triar → atribuir consultor → acompanhar até o atendimento.
- **Pedidos B2B** (`/comercial/pedidos-b2b`) — pedidos enviados por parceiros; conferência, aprovação e encaminhamento.
- **Solicitações B2B** (`/comercial/solicitacoes-b2b`) — pré-pedidos e demandas dos parceiros.
- **Campanhas** (`/comercial/campanhas`) — ações comerciais com período e escopo definidos.

### Produtos e Planejamento
- **Catálogo** (`/comercial/catalogo`) — portfólio comercial de produtos com fichas e condições.
- **Protocolos** (`/protocolos`) — receitas agronômicas padronizadas usadas nas recomendações.
- **Simulador** (`/comercial/simulador`) — monta simulação de proposta (volume, produto, condição de pagamento) para envio ao cliente ou parceiro.
- **Condições de Pagamento** (`/comercial/condicoes-pagamento`) — planos comerciais disponíveis.
- **Auditoria do Motor B2B** (`/comercial/auditoria-motor-b2b`) — rastreia como o motor calculou preços e condições.

---

## 8. Campo e Assistência Técnica

- **Agenda Técnica** (`/agenda-tecnica`) — calendário de visitas e compromissos da equipe. Permite ver a carga por consultor e reagendar.
- **Visita Técnica** (`/visita-tecnica`) — lista das visitas; `/visita-tecnica/nova` abre o formulário completo.
  - Passo a passo: selecionar cliente e fazenda → escolher talhões → registrar objetivo da visita → observações e fotos → gerar recomendações → salvar/finalizar.
  - Da visita finalizada é possível **converter recomendação em Ordem de Serviço**.
  - O PDF da visita pode ser enviado por e-mail ao cliente.
- **Aplicações** (`/aplicacoes`) — registros de aplicação em campo, com data, produto, dose e talhão. Serve de comprovação de uso e alimenta o histórico agronômico.
- **Equipe Técnica** (`/consultor-tecnico`) — consultores, carteira atribuída e produtividade.
- **Fluxo Técnico** (`/fluxo-tecnico`) — visão do processo técnico, etapa por etapa, para identificar onde cada atendimento parou.
- **Monitoramento** (`/monitoramento-alertas`) — acompanhamento de prazos e SLA de retorno; sinaliza monitoramentos vencidos.
- **Previsão Climática** (`/previsao-agronomica`) — condições meteorológicas por região para apoiar a decisão de aplicação.

---

## 9. Produção On-Farm

### Acompanhamento
- **Dashboard Produção** (`/operacao/dashboard-producao`) — indicadores do laboratório: volume produzido, aderência ao plano, filas por etapa.

### Central Operacional
- **Cockpit Laboratório** (`/cockpit-laboratorio`) — tela de trabalho do operador; reúne o que precisa ser iniciado, analisado, envasado e expedido no dia.

### Fluxo de Produção
1. **Planejamento Produção** (`/operacao/planejamento`) — PCP: define datas de produção das OS; o detalhe (`/operacao/planejamento/:id`) permite ajustar a programação.
2. **Ordens de Serviço** (`/ordens-servico`) — criação manual ou por conversão de visita; acompanha o status na esteira.
3. **Lotes** (`/lotes`) — abertura e acompanhamento das bateladas.
4. **Controle de Qualidade** (`/controle-qualidade`) — registro das análises e decisão aprovar/reprovar segundo os parâmetros configurados.
5. **Envase** (`/envase`) — embalagem, identificação e geração de etiquetas (`/etiquetas/:id/imprimir`).
6. **Estoque** (`/estoque`) — produto acabado; aba dedicada para **Embalagens** (`/estoque/embalagens`).
7. **Entregas** (`/entregas`) — expedição, romaneio e confirmação de recebimento; `/entregas/:id/formulario` gera o formulário para impressão.

**Ciclo de vida da OS:** Aberta → Programada → Em Produção → Aguardando CQ → CQ Aprovado/Reprovado → Envase → Pronto Entrega → Entrega Pendente → Entregue → Finalizada.

> A finalização exige a marcação `pode_finalizar`. A **ausência de registro de aplicação em campo não bloqueia** a finalização — é tratada como pendência informativa. Bloqueios reais são: CQ reprovado, atraso de PCP e falta de insumo.

---

## 10. Financeiro

### Visão Geral
- **Financeiro** (`/financeiro`) — painel com saldos, vencimentos do período e inadimplência.
- **Fluxo de Caixa** (`/financeiro/fluxo-caixa`) — entradas, saídas e saldo projetado.
- **DRE Gerencial** (`/financeiro/dre`) — resultado por período, por categoria e centro de custo.
- **Relatórios Financeiros** (`/financeiro/relatorios`) — hub com: Mensal, Contas a Receber, Contas a Pagar, Inadimplência, NF-e Pendente, Entregas x Faturamento, Por Cliente e Prestação de Contas. Todos permitem filtro por período e exportação.

### Movimentações
- **Contas a Receber** (`/financeiro/receber`) — títulos, parcelas, baixa e estorno.
- **Contas a Pagar** (`/financeiro/pagar`) — obrigações e programação de pagamento.
- **Notas Fiscais** (`/financeiro/notas-fiscais`) — controle das notas vinculadas ao faturamento.
- **Entregas não faturadas** (`/financeiro/entregas-nao-faturadas`) — entregas confirmadas ainda sem faturamento; é a lista de trabalho para fechar receita.
- **Recibos** (`/financeiro/recibos`) — emissão de comprovantes de recebimento.
- **Recorrências** (`/financeiro/recorrencias`) — lançamentos repetitivos automatizados.

### Cadastros Financeiros
Categorias (plano de contas), Centros de Custo, Contas Bancárias e Formas de Pagamento. Configure-os **antes** de começar a lançar movimentações — eles são pré-requisito para DRE e rateio corretos.

---

## 11. Financeiro B2B

### Visão e Desempenho
Visão Geral B2B (`/financeiro/b2b`), Dashboard B2B, **Aging** (vencidos por faixa), **Previsão de Receita**, **Rentabilidade** por parceiro e **Alertas Financeiros**.

### Governança
- **Governança** e **Central de Governança** — pendências que exigem aprovação (crédito, condição especial, limite).
- **Regras de Governança** — políticas que o motor aplica automaticamente.
- **Dashboard Sócios** (`/executivo/socios-b2b`) — visão societária consolidada.

---

## 12. Inteligência e Controle

- **BI Agronômico** (`/bi-agronomico`) — desempenho agronômico: produtos, alvos, respostas em campo.
- **BI Operacional** (`/bi-operacional`) — esteira, conversão de visita em OS, volumes e gargalos. As views respeitam RLS: consultores veem apenas seus clientes; perfis não autorizados são bloqueados.
  - **Exportação CSV:** o botão de exportação valida sua permissão para a seção antes de liberar o download, e sanitiza os valores contra injeção de fórmula em planilhas.
  - Atenção à leitura: "Volume Solicitado" é demanda, não estoque físico.
- **Relatórios Gerenciais** (`/relatorios`) — relatórios operacionais e gerenciais com filtro e exportação.
- **Alertas** (`/alertas-operacionais`) — central de alertas, com contador dinâmico no menu e sino no cabeçalho.
- **Auditorias** (`/auditoria`) — abas de auditoria geral, sincronização (`?tab=sync`) e financeira (`?tab=financeiro`).

---

## 13. Administração e Configurações

### Configurações — `/configuracoes`
Abas disponíveis:

| Aba | Para que serve |
|---|---|
| **Perfil** | Seus dados pessoais e preferências |
| **Aparência** | Tema e apresentação |
| **Usuários** | Criar usuários, atribuir papéis, redefinir senha, desativar acesso |
| **Catálogos** | Catálogos auxiliares, incluindo catálogo assistido por IA |
| **SLA B2B** | Prazos e regras de atendimento a parceiros |
| **Financeiro** | Parâmetros financeiros gerais |
| **Comunicação** | Provedores de e-mail e WhatsApp (ver seção 15) |

Páginas complementares: **Objetivos de Visita** (`/configuracoes/objetivos-visita`), **Catálogo IA** (`/configuracoes/catalogo-ia`) e **Parâmetros de CQ** (`/configuracoes/parametros-cq`).

#### Criar um usuário (passo a passo)
1. Configurações → Usuários → Novo usuário.
2. Informe nome, e-mail e senha inicial.
3. Selecione o papel — este passo é obrigatório; sem papel o usuário cai em `/acesso-pendente`.
4. Salve. O usuário já pode entrar em `/auth`.

---

## 14. Módulo Fiscal

> **Estado atual: preparação e homologação. A emissão de documentos fiscais está desligada por trava de segurança.** Tudo abaixo funciona em modo de configuração e rascunho.

- **Configuração Fiscal — Empresa** (`/configuracoes/fiscal/empresa`) — dados do emitente, regime tributário, certificado digital e ambiente.
- **Perfis Fiscais — Produtos** (`/configuracoes/fiscal/produtos`) — NCM, CEST, CFOP e tributação por produto; inclui os microrganismos associados.
- **Perfis Fiscais — Serviços** (`/configuracoes/fiscal/servicos`) — item de serviço, alíquota e código municipal.
- **Perfis Fiscais — Clientes** (`/configuracoes/fiscal/clientes`) — indicador de IE, contribuinte, regime e particularidades por destinatário.
- **Rascunhos NF-e e NFS-e** (`/fiscal/documentos`) — assistente que monta o documento passo a passo e valida as regras vigentes (incluindo CNPJ alfanumérico e regras SINIEF) sem transmitir nada.
- **Visão Geral Fiscal / Prontidão** (`/fiscal/prontidao`) — painel somente leitura que mostra o que ainda falta para a empresa estar pronta para emitir: cadastros incompletos, certificado, conexões e parâmetros.

**Como usar na prática:** configure a empresa → complete os perfis de produtos, serviços e clientes → acompanhe a Prontidão até que todos os itens estejam verdes → crie rascunhos para validar o preenchimento. A emissão real só será possível após liberação explícita.

---

## 15. Módulo de Comunicação e Notificações

> Módulo controlado por feature flag. Quando habilitado, aparece em **Administração → Comunicação** (`/comunicacao`) para administradores e gestores.

### 15.1 O que o módulo faz
Centraliza o envio de comunicações do sistema (e-mail, WhatsApp e notificação no app) disparadas por eventos de negócio — por exemplo, produto pronto para entrega ou nova solicitação do produtor.

### 15.2 Painel administrativo `/comunicacao`
- **Eventos e regras** — quais eventos existem e quais regras estão ativas (canal, destinatário, template).
- **Templates** — conteúdo por canal, com versionamento e **pré-visualização em tempo real** usando dados de exemplo.
- **Destinatários** — estratégias: por usuário, por cliente ou por papel (o envio por papel é restrito a administrador).
- **Fila e DLQ** — mensagens em processamento, falhas e **reprocessamento (replay)** limitado por taxa, com trilha de auditoria.
- **Observabilidade** — cartões com saúde da fila, throughput dos últimos 7 dias, status dos provedores e do worker.
- **Consentimento WhatsApp** — registro e revogação de consentimento por destinatário, com auditoria.

### 15.3 Configurar os provedores (Configurações → Comunicação)
1. **SMTP:** informe host, porta, usuário, senha e remetente. As credenciais são guardadas de forma cifrada; a senha nunca é exibida de volta.
2. **Enviar e-mail de teste** (somente administrador, aparece após haver senha configurada): digite o destinatário — o campo valida o formato antes de liberar o botão — e clique em *Enviar teste*. Em caso de falha, o aviso mostra a **categoria do erro** (timeout, certificado TLS inválido, hostname do certificado divergente, autenticação recusada, conexão recusada, DNS etc.), uma dica do que verificar, o detalhe bruto do servidor, host/porta e o tempo decorrido. O console do navegador registra o diagnóstico completo.
3. **WhatsApp Cloud API:** informe as credenciais do aplicativo Meta e associe os templates aprovados.
4. **Chaves de segurança:** as entregas reais só ocorrem com as respectivas chaves ligadas. Em ambiente de homologação elas permanecem **desligadas** e o **modo de teste** fica ativo, restringindo destinatários a uma lista permitida.

### 15.4 Central de Notificações
- Sino no cabeçalho abre o resumo rápido; `/notificacoes` abre a **Central de Notificações** completa.
- As notificações chegam em tempo real, são deduplicadas (o mesmo evento não aparece repetido) e possuem link direto para a tela de origem, validado contra uma lista de destinos permitidos.
- No app móvel do produtor a aba **Alertas** cumpre o mesmo papel.

---

## 16. Portal do Produtor

Área do cliente final, em `/portal`:

| Tela | Uso |
|---|---|
| `/portal` | Painel com o resumo da operação da fazenda |
| `/portal/fazendas` e `/portal/fazendas/:id` | Propriedades e talhões do produtor |
| `/portal/talhoes/:id` | Histórico do talhão |
| `/portal/agenda` | Visitas agendadas |
| `/portal/registros` e `/portal/registros/:id` | Registros de campo |
| `/portal/recomendacoes` | Recomendações técnicas recebidas |
| `/portal/fila-aprovacao` | Itens aguardando o aval do produtor |
| `/portal/acompanhamento` | Abas de Ordens de Serviço, Produção e Entregas |
| `/portal/aplicacoes` | Aplicações registradas na propriedade |
| `/portal/solicitar` | Abrir uma nova solicitação para a AR Bio |
| `/portal/financeiro` | Situação financeira do produtor |
| `/portal/perfil` | Dados de acesso e preferências |

**Fluxo típico do produtor:** abrir solicitação → acompanhar o atendimento → aprovar a recomendação → acompanhar produção e entrega em `/portal/acompanhamento` → confirmar recebimento → registrar/consultar aplicações.

---

## 17. Portal do Parceiro B2B

Área em `/portal-parceiro`, com dois perfis (comercial e técnico):

| Tela | Uso |
|---|---|
| `dashboard` | Indicadores do parceiro |
| `pedidos` | Meus pedidos e status |
| `solicitacoes` | Solicitações em aberto |
| `novo` / `catalogo` / `simulador` | Montar pedido a partir do catálogo, com simulação de condições |
| `historico` e `meu-historico` | Histórico de pedidos da revenda e do usuário |
| `favoritos` | Itens marcados para acesso rápido |
| `financeiro` | Situação financeira, com aba de histórico |
| `fichas` | Fichas técnicas dos produtos |
| `simulacoes` e `simulacoes-equipe` | Simulações próprias e da equipe |
| `meus-produtores` e `meus-produtores/:clienteId` | Carteira de produtores do técnico do parceiro |
| `tecnicos-produtores` | Vínculo entre técnicos e produtores |
| `usuarios-clientes` | Gestão dos usuários do parceiro |

**Fluxo típico:** catálogo → simulação → envio do pedido → acompanhamento em *Meus Pedidos* → conferência financeira.

---

## 18. Aplicativo móvel (`/app`)

Interface otimizada para uso em campo, com login próprio em `/app/login`, navegação por abas e **funcionamento offline**.

### Consultor / Técnico
Abas: **Início**, **Demandas**, **Fazendas**, **Catálogo**, **Perfil**. Botão flutuante `+` abre o registro rápido de ocorrência.

Telas: `/app/solicitacoes`, `/app/checkin/:solicitacaoId`, `/app/visita/novo` e `/app/visita/:id`, `/app/registrar`, `/app/registros`, `/app/ordens`, `/app/fazendas`, `/app/talhao/:id`, `/app/catalogo`.

**Trabalhar offline:** ao perder conexão aparece uma faixa indicando o estado e a quantidade de registros pendentes. Continue registrando normalmente — ao voltar a rede, use *Sincronizar* na faixa para enviar tudo, acompanhando a barra de progresso. Não feche o app durante a sincronização.

### Produtor
Abas: **Início**, **Recom.**, **Entregas**, **Alertas**, **Perfil** — com `/app/aplicacoes`, `/app/aplicacoes/lista` e `/app/solicitar` para registrar uso e pedir atendimento.

---

## 19. Páginas públicas

Não exigem login, funcionam por link/QR code:

- **Validar entrega** — `/validar-entrega/:token`: quem recebe confirma o recebimento em campo.
- **Rastrear produto** — `/rastrear-produto/:token`: consulta a origem e o histórico do lote pela etiqueta.

---

## 20. Processos ponta a ponta

### 20.1 Da visita à finalização da OS
1. Consultor agenda a visita em **Agenda Técnica** (ou recebe uma demanda em **Solicitações**).
2. Executa a visita no app ou em **Visita Técnica**, registrando talhões, observações e fotos.
3. Gera **recomendação** a partir de um **protocolo**.
4. Recomendação aprovada vira **Ordem de Serviço**.
5. **Planejamento Produção** programa a data; a OS passa a *Programada*.
6. Laboratório abre o **lote**; OS vai a *Em Produção*.
7. **Controle de Qualidade** aprova ou reprova. Reprovado bloqueia o avanço.
8. **Envase** embala e etiqueta; produto entra no **Estoque**.
9. **Entregas** expede; o recebedor confirma no campo (inclusive pela página pública de validação).
10. OS marcada como `pode_finalizar` é **Finalizada** administrativamente.
11. **Financeiro** captura a entrega em *Entregas não faturadas* e conclui o faturamento.

### 20.2 Solicitação do produtor
Produtor abre em `/portal/solicitar` → chega em **Solicitações** → equipe tria e atribui consultor → consultor faz check-in pelo app → atendimento vira visita/recomendação → produtor acompanha o andamento no portal. Cada mudança relevante gera notificação para produtor e consultor responsável.

### 20.3 Pedido B2B
Parceiro monta pedido no catálogo → simula condições → envia → aparece em **Pedidos B2B** → passa pelas **Regras de Governança** (crédito/condição) → reserva de estoque → produção/expedição → faturamento e acompanhamento em **Financeiro B2B**.

### 20.4 Ciclo fiscal (preparatório)
Configurar empresa → perfis de produto/serviço/cliente → acompanhar **Prontidão** → montar **rascunhos** e validar → aguardar liberação da emissão.

### 20.5 Comunicação
Evento de negócio ocorre → regra ativa identifica destinatários → template é renderizado → mensagem entra na fila → worker entrega pelo canal → status é atualizado (enviado/entregue/lido/falhou) → falhas definitivas vão para a **DLQ**, onde podem ser reprocessadas.

---

## 21. Perguntas frequentes e erros comuns

| Situação | O que fazer |
|---|---|
| "Não vejo um menu que meu colega vê" | Papéis diferentes. Peça ao administrador para revisar seu papel em Configurações → Usuários. |
| Caí em `/acesso-pendente` | Seu usuário ainda não tem papel atribuído. |
| Caí em `/sem-permissao` | A rota não pertence ao seu perfil; volte à sua página inicial. |
| Tela de escolher portal aparecendo | Você tem mais de um contexto. Escolha um; administradores não veem essa tela. |
| Registros do app não aparecem no sistema | Estão pendentes de sincronização — reconecte e use *Sincronizar*. |
| Não consigo finalizar uma OS | Verifique bloqueios reais: CQ reprovado, atraso de PCP ou falta de insumo. Falta de registro de aplicação **não** bloqueia. |
| Volume do BI diferente do estoque | "Volume Solicitado" é demanda, não estoque físico. |
| E-mail de teste falhando | Leia a categoria do erro no aviso: certificado/hostname, autenticação, timeout ou DNS indicam problemas no servidor SMTP, não no sistema. |
| Nenhuma comunicação está saindo | Em homologação as chaves de entrega ficam desligadas e o modo de teste ativo, por segurança. |
| Notificação repetida | A Central deduplica eventos equivalentes; se persistir, verifique se há duas regras ativas para o mesmo evento. |

---

*Este manual descreve o comportamento vigente da aplicação. Documentos de fases anteriores permanecem em `docs/` como histórico de decisões e não substituem este manual.*
