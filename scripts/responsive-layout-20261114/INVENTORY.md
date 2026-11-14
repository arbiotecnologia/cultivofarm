# Inventário atual de rotas e controles

Inspeção estática não prova layout, sessão ou permissões. Rotas repetidas e aliases são preservados. O grafo pode incluir imports não montados (limite superior de consumidores).

| Rota | Tela/guard declarado | Controles transitivos | Evidência |
|---|---|---:|---|
| /auth |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /reset-password |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /selecionar-portal |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /acesso-pendente |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /sem-permissao |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /diagnostico/elegibilidade-fiscal |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /plataforma |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /configuracoes/catalogo-ia |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /validar-entrega/:token |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /rastrear-produto/:token |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/login |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/perfil |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/notificacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/fazendas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/registrar |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/atendimentos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/registros |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/solicitacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/ordens |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/checkin/:solicitacaoId |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/checkin |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/visita/novo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/visita/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/talhao/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/catalogo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/recomendacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/entregas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/aplicacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/aplicacoes/lista |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /app/solicitar |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/fazendas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/fazendas/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/talhoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/talhoes/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/agenda |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/registros |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/registros/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/recomendacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/fila-aprovacao |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/acompanhamento |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/ordens-servico |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/producao |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/entregas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/aplicacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/solicitar |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/perfil |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/financeiro |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal/meus-pedidos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal-parceiro |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| perfil |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| dashboard |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| pedidos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| solicitacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| novo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| catalogo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| simulador |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| historico |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| meu-historico |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| favoritos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| financeiro |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| historico-financeiro |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| meu-historico-financeiro |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| fichas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| simulacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| simulacoes-equipe |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| meus-produtores |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| meus-produtores/:clienteId |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| tecnicos-produtores |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| usuarios-clientes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /visita-tecnica |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /visita-tecnica/nova |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /visita-tecnica/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| / |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /clientes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /clientes/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /parceiros/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /fazendas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /fazendas/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /talhoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /talhoes/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /auditoria |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /auditoria-sync |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /base-tecnica |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /protocolos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /ordens-servico |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /lotes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /controle-qualidade |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /envase |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /estoque |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /estoque/embalagens |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /entregas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /entregas/:id/formulario |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /etiquetas/:id/imprimir |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /aplicacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /relatorios |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /consultor-tecnico |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /fluxo-tecnico |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /bi-agronomico |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /bi-operacional |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /alertas-operacionais |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /previsao-agronomica |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /solicitacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /monitoramento-alertas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /agenda-tecnica |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /dashboard |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /dashboard/geral |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /dashboard/executivo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /dashboard/operacional |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /painel-operacional |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /cockpit-laboratorio |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/receber |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/pagar |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/categorias |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/centros-custo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/contas-bancarias |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/formas-pagamento |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/recorrencias |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/fluxo-caixa |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/dre |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/notas-fiscais |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/entregas-nao-faturadas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/auditoria |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/configuracoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/relatorios |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/relatorios/mensal |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/relatorios/contas-receber |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/relatorios/contas-pagar |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/relatorios/inadimplencia |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/relatorios/nfe-pendente |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/relatorios/entregas-faturamento |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/relatorios/por-cliente |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/relatorios/prestacao-contas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/recibos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /executivo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /portal-executivo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/parceiros |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/pedidos-b2b |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/pedidos-b2b/novo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/solicitacoes-b2b |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/dashboard-b2b |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/campanhas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/minha-carteira/pedido |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/minha-carteira |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/simulador |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/catalogo |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/indicadores |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/alertas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/dashboard-consolidado |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/condicoes-pagamento |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comercial/auditoria-motor-b2b |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /operacao/planejamento |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /operacao/planejamento/:id |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /operacao/dashboard-producao |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/b2b |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/b2b/dashboard |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/b2b/governanca |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/b2b/aging |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/b2b/previsao |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/b2b/rentabilidade |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/b2b/alertas |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/b2b/central-governanca |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /financeiro/b2b/regras |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /executivo/socios-b2b |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /configuracoes |  | 0 | BROWSER_SYNTHETIC_PAGE_ONLY |
| /configuracoes/objetivos-visita |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /configuracoes/parametros-cq |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /configuracoes/fiscal/empresa |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /configuracoes/produtos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /configuracoes/fiscal/produtos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /configuracoes/fiscal/servicos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /configuracoes/fiscal/clientes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /fiscal/perfis/produtos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /fiscal/perfis/servicos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /fiscal/perfis/clientes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /fiscal/documentos |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /fiscal/reconciliacao |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /fiscal/prontidao |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /comunicacao |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| /notificacoes |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |
| * |  | 0 | STATIC_ONLY_NOT_VISUALLY_CERTIFIED |

## Candidatos restantes (não reproduzidos)

P1: diálogo com tamanho fixo e abas com grade rígida; P2: seletores de largura fixa/ações nowrap; tabelas largas devem manter rolagem local, não ser tratadas automaticamente como erro. Nenhuma prioridade representa autorização para alterar funções.

| Prioridade | Arquivo:linha | Controle | Classe suspeita |
|---|---|---|---|
| P1 | src/components/aplicacao/AplicacaoFormDialog.tsx:316 | DialogContent | "max-w-3xl max-h-[92vh] overflow-y-auto" |
| P1 | src/components/bi/modal/BIDrillDownModal.tsx:97 | DialogContent | "max-w-5xl max-h-[85vh] overflow-hidden flex flex-col" |
| P2 | src/components/catalogo/AddToCartDialog.tsx:390 | SelectTrigger | "h-8 text-xs w-full min-w-0" |
| P2 | src/components/clientes/ClienteFormTabs.tsx:279 | Input | "font-mono-data font-semibold max-w-[200px] bg-muted/40" |
| P2 | src/components/clientes/ClienteFormTabs.tsx:554 | SelectTrigger | "w-[100px]" |
| P1 | src/components/clientes/ClienteHistoricoDialog.tsx:29 | DialogContent | "max-w-4xl max-h-[80vh] overflow-y-auto" |
| P1 | src/components/cockpit/GerarLoteDialog.tsx:106 | DialogContent | "max-w-lg max-h-[90vh] overflow-y-auto" |
| P1 | src/components/cockpit/RegistrarCQDialog.tsx:114 | DialogContent | "max-w-lg max-h-[90vh] overflow-y-auto" |
| P1 | src/components/cockpit/RegistrarEnvaseDialog.tsx:258 | DialogContent | "max-w-lg max-h-[90vh] overflow-y-auto" |
| P1 | src/components/cockpit/ReservarEstoqueDialog.tsx:185 | DialogContent | "max-h-[90vh] overflow-y-auto" |
| P1 | src/components/comercial/MatrizPrecosTab.tsx:236 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/components/comercial/ParceiroB2BFormDialog.tsx:399 | DialogContent | "max-w-4xl max-h-[90vh] overflow-y-auto" |
| P1 | src/components/comercial/ResponderCotacaoDialog.tsx:90 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/components/configuracoes/AuditSenhaDialog.tsx:76 | DialogContent | "max-w-3xl max-h-[80vh] flex flex-col" |
| P1 | src/components/entregas/PreviewDocumentoEntrega.tsx:79 | DialogContent | "max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden" |
| P1 | src/components/entregas/RegistrarEntregaDialog.tsx:417 | DialogContent | "max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden mx-2 sm:mx-auto" |
| P1 | src/components/entregas/RegistrarEntregaDialog.tsx:927 | AlertDialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/components/estoque/ReservaDialog.tsx:410 | DialogContent | "max-h-[90vh] overflow-y-auto" |
| P1 | src/components/faturamento/BaseFaturamentoDialog.tsx:129 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/components/fazendas/TalhoesFazendaTab.tsx:195 | DialogContent | "max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto" |
| P1 | src/components/financeiro/BaixaDialog.tsx:454 | DialogContent | "max-w-lg max-h-[90vh] overflow-y-auto" |
| P1 | src/components/financeiro/ConfirmarEntregaFinanceiroDialog.tsx:27 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/components/financeiro/NovaContaDialog.tsx:250 | DialogContent | "max-w-3xl max-h-[90vh] overflow-y-auto" |
| P2 | src/components/fiscal/FiscalCatalogCombobox.tsx:123 | Button | {cn("w-full min-w-0 justify-between font-normal", multiline && "h-auto min-h-10 whitespace-normal py-3", addAction && "w-auto justify-center")} |
| P2 | src/components/fiscal/NatureOperationCombobox.tsx:109 | Button | "h-auto min-h-10 w-full min-w-0 justify-between whitespace-normal py-2 font-normal" |
| P1 | src/components/fiscal/ProductDossierManagement.tsx:21 | DialogContent | "max-w-5xl max-h-[90vh] overflow-y-auto" |
| P1 | src/components/ordens-servico/OSDetalhesDialog.tsx:177 | DialogContent | "max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 sm:p-0" |
| P1 | src/components/plataforma/AdminGestaoAcoes.tsx:107 | DialogContent | "max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto [&_button:not([role=checkbox])]:min-h-11" |
| P1 | src/components/plataforma/AdminGestaoAcoes.tsx:113 | TabsList | "grid h-auto w-full grid-cols-3 gap-1" |
| P1 | src/components/plataforma/PlatformCatalogB2BDialog.tsx:78 | DialogContent | "max-h-[90vh] max-w-md overflow-y-auto" |
| P1 | src/components/plataforma/PlatformCatalogCompositionDialog.tsx:142 | DialogContent | "max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto" |
| P1 | src/components/plataforma/PlatformCatalogEntityPanel.tsx:136 | DialogContent | "max-h-[90dvh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto" |
| P1 | src/components/plataforma/PlatformCatalogFamilyDialog.tsx:84 | DialogContent | "max-h-[90vh] max-w-md overflow-y-auto" |
| P1 | src/components/plataforma/PlatformCatalogLifecycleDialogs.tsx:93 | DialogContent | "max-h-[90vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto" |
| P1 | src/components/plataforma/PlatformCatalogLifecycleDialogs.tsx:151 | DialogContent | "max-h-[90vh] max-w-md overflow-y-auto" |
| P1 | src/components/plataforma/PlatformCatalogVolumesDialog.tsx:35 | DialogContent | "max-h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto" |
| P1 | src/components/protocolos/CatalogoVolumesDialog.tsx:202 | DialogContent | "max-w-5xl w-[96vw] max-h-[92vh] overflow-y-auto overflow-x-hidden" |
| P1 | src/components/protocolos/MicroorganismTechnicalProfileDialog.tsx:221 | DialogContent | "max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden [&_button]:min-h-11 [&_input]:min-h-11" |
| P2 | src/components/protocolos/MicrorganismosTab.tsx:362 | SelectTrigger | "w-[140px]" |
| P1 | src/components/protocolos/MicrorganismosTab.tsx:414 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/components/protocolos/OwnedCatalogItemDialog.tsx:181 | DialogContent | "max-w-3xl max-h-[92vh] overflow-y-auto" |
| P1 | src/components/protocolos/ProductTechnicalProfileDialog.tsx:201 | DialogContent | "max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto overflow-x-hidden [&_button]:min-h-11 [&_input]:min-h-11" |
| P2 | src/components/protocolos/ProdutosTab.tsx:713 | SelectTrigger | "w-[140px]" |
| P1 | src/components/protocolos/ProdutosTab.tsx:747 | DialogContent | "max-w-3xl max-h-[95vh] overflow-y-auto flex flex-col" |
| P1 | src/components/protocolos/ProdutosTab.tsx:768 | TabsList | "flex w-full h-auto flex-wrap mb-4 [&_button]:flex-1 [&_button]:whitespace-normal [&_button]:min-w-20" |
| P1 | src/components/protocolos/TenantProblemPanel.tsx:16 | DialogContent | "max-h-[90dvh] overflow-y-auto [&_input]:min-h-11 [&_button]:min-h-11" |
| P1 | src/components/protocolos/TenantReferencePanel.tsx:54 | DialogContent | "max-h-[90dvh] overflow-y-auto [&_input]:min-h-11 [&_button]:min-h-11" |
| P1 | src/components/protocolos/catalog/BulkAlvosDialog.tsx:136 | TabsList | "grid grid-cols-3 w-full" |
| P1 | src/components/protocolos/catalog/SourceFormDialog.tsx:109 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/components/talhoes/SafrasTalhaoDialog.tsx:156 | DialogContent | "max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto" |
| P1 | src/components/visita/CameraDialog.tsx:152 | DialogContent | "sm:max-w-md p-0 overflow-hidden bg-black border-none h-[85vh] flex flex-col gap-0" |
| P1 | src/components/visita/EvidenciasTabs.tsx:458 | TabsList | "grid grid-cols-4 w-full" |
| P1 | src/components/visita/PdfPreviewDialog.tsx:76 | DialogContent | "max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden" |
| P1 | src/components/visita/PlanoMonitoramentoEditor.tsx:241 | DialogContent | "sm:max-w-[425px]" |
| P2 | src/components/visita/UploadQueuePanel.tsx:187 | Button | "h-7 text-[10px] flex-1 border-destructive/30 hover:bg-destructive/10 text-destructive whitespace-nowrap" |
| P2 | src/components/visita/UploadQueuePanel.tsx:199 | Button | "h-7 text-[10px] flex-1 border-muted-foreground/30 hover:bg-muted whitespace-nowrap" |
| P1 | src/pages/Aplicacoes.tsx:144 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/BIAgronomico.tsx:24 | TabsList | "w-max sm:w-auto flex min-w-full" |
| P2 | src/pages/ClienteDetalhe.tsx:246 | SelectTrigger | "h-8 w-[200px] text-xs" |
| P2 | src/pages/ClienteDetalhe.tsx:258 | SelectTrigger | "h-8 w-[220px] text-xs" |
| P2 | src/pages/CockpitLaboratorio.tsx:663 | SelectTrigger | "h-9 min-w-0 flex-1 basis-[145px] sm:flex-none sm:w-[150px]" |
| P2 | src/pages/CockpitLaboratorio.tsx:667 | SelectTrigger | "h-9 min-w-0 flex-1 basis-[145px] text-xs sm:flex-none sm:w-[170px]" |
| P2 | src/pages/CockpitLaboratorio.tsx:671 | SelectTrigger | "h-9 min-w-0 flex-1 basis-[145px] text-xs sm:flex-none sm:w-[180px]" |
| P2 | src/pages/CockpitLaboratorio.tsx:675 | SelectTrigger | "h-9 min-w-0 flex-1 basis-[145px] text-xs truncate sm:flex-none sm:w-[150px]" |
| P2 | src/pages/CockpitLaboratorio.tsx:682 | SelectTrigger | "h-9 min-w-0 flex-1 basis-[145px] text-xs truncate sm:flex-none sm:w-[150px]" |
| P2 | src/pages/CockpitLaboratorio.tsx:689 | SelectTrigger | "h-9 min-w-0 flex-1 basis-[145px] text-xs truncate sm:flex-none sm:w-[150px]" |
| P1 | src/pages/CockpitLaboratorio.tsx:747 | TabsList | "grid h-auto w-full grid-cols-2 gap-1 bg-muted/50 p-1 mb-4 sm:grid-cols-3" |
| P1 | src/pages/Configuracoes.tsx:839 | DialogContent | "max-w-md flex flex-col max-h-[calc(100dvh-2rem)] gap-0 overflow-clip p-0 sm:p-0" |
| P2 | src/pages/Configuracoes.tsx:852 | Button | {`h-auto min-h-16 min-w-0 w-full flex-col items-start justify-start gap-1 whitespace-normal rounded-md border p-3 text-left transition-colors disabled:opacity-50 ${registrationKind === opcao.kind ? "border-primary bg-primary/10" : "border-border hover:bg-accent"}`} |
| P2 | src/pages/Configuracoes.tsx:954 | SelectTrigger | "w-full sm:w-[180px]" |
| P2 | src/pages/Configuracoes.tsx:961 | SelectTrigger | "w-full sm:w-[140px]" |
| P2 | src/pages/Configuracoes.tsx:1036 | Table | "min-w-[700px]" |
| P1 | src/pages/ConsultorTecnico.tsx:945 | DialogContent | "max-w-4xl p-0 overflow-visible bg-transparent border-none shadow-none flex flex-col items-center justify-center h-[90vh] outline-none" |
| P1 | src/pages/ControleQualidade.tsx:256 | DialogContent | "max-h-[85vh] max-w-2xl overflow-y-auto" |
| P1 | src/pages/Entregas.tsx:1175 | DialogContent | "max-w-3xl max-h-[90vh] overflow-y-auto" |
| P2 | src/pages/EnvasePage.tsx:269 | Table | "min-w-[750px]" |
| P1 | src/pages/Estoque.tsx:312 | DialogContent | "max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto" |
| P2 | src/pages/Estoque.tsx:332 | SelectTrigger | "w-full sm:w-[220px] h-9" |
| P1 | src/pages/Estoque.tsx:425 | DialogContent | "max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/Fazendas.tsx:269 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto" |
| P2 | src/pages/FluxoTecnico.tsx:284 | SelectTrigger | "w-[180px]" |
| P1 | src/pages/MonitoramentoAlertas.tsx:419 | DialogContent | "sm:max-w-md max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/OrdensServico.tsx:413 | DialogContent | "max-w-lg max-h-[90vh] overflow-y-auto" |
| P2 | src/pages/Relatorios.tsx:825 | Input | "pl-8 h-9 text-sm w-full sm:w-[180px]" |
| P2 | src/pages/Relatorios.tsx:837 | Input | "pl-8 h-9 text-sm w-full sm:w-[180px]" |
| P1 | src/pages/Talhoes.tsx:133 | DialogContent | "max-w-lg w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/app/MobileCatalogoTecnico.tsx:140 | TabsList | "grid grid-cols-3 w-full" |
| P2 | src/pages/app/MobileVisitaWizard.tsx:1089 | Button | "flex-1 max-w-[220px]" |
| P1 | src/pages/app/wizard/WizardRecomendacaoStep.tsx:407 | DialogContent | "max-w-md max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/app/wizard/WizardRevisaoStep.tsx:240 | AlertDialogContent | "max-w-[calc(100%-2rem)] sm:max-w-lg" |
| P2 | src/pages/auditoria/AgendaTab.tsx:32 | Table | "min-w-[720px]" |
| P2 | src/pages/auditoria/ClientesTab.tsx:58 | Table | "min-w-[720px]" |
| P2 | src/pages/auditoria/ComunicacaoTab.tsx:189 | Table | "min-w-[860px]" |
| P2 | src/pages/auditoria/SenhasTab.tsx:69 | Table | "min-w-[560px]" |
| P2 | src/pages/auditoria/VisitasTab.tsx:67 | Table | "min-w-[640px]" |
| P2 | src/pages/clientes/ParceirosB2BTab.tsx:98 | SelectTrigger | "w-full sm:w-[160px]" |
| P1 | src/pages/clientes/ProdutoresTab.tsx:362 | DialogContent | "max-w-3xl max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/comercial/CampanhasComerciais.tsx:237 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/comercial/CommercialPaymentPlansPage.tsx:464 | DialogContent | "max-w-4xl max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/comercial/PedidosB2B.tsx:380 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P2 | src/pages/configuracoes/FiscalProdutos.tsx:496 | SelectTrigger | "max-w-[220px]" |
| P1 | src/pages/dashboard/DashboardUnificado.tsx:52 | TabsList | "w-max min-w-full sm:w-auto" |
| P1 | src/pages/financeiro/EntregasNaoFaturadas.tsx:180 | DialogContent | "max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/financeiro/FluxoCaixa.tsx:392 | DialogContent | "max-w-3xl max-h-[80vh] overflow-y-auto" |
| P1 | src/pages/financeiro/RecibosList.tsx:350 | DialogContent | "max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/financeiro/Recorrencias.tsx:289 | DialogContent | "max-w-2xl max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/plataforma/EmpresaDetalhe.tsx:281 | DialogContent | "max-h-[90dvh] overflow-y-auto sm:max-w-2xl" |
| P1 | src/pages/plataforma/PlataformaHome.tsx:154 | TabsList | "h-auto w-full justify-start gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap p-1 [scrollbar-width:thin] [&>button]:min-h-10 [&>button]:shrink-0 [&>button]:px-3 [&>button:focus-visible]:ring-2 [&>button:focus-visible]:ring-ring" |
| P2 | src/pages/portal/PortalAcompanhamento.tsx:154 | SelectTrigger | "sm:w-[160px]" |
| P2 | src/pages/portal/PortalAcompanhamento.tsx:164 | SelectTrigger | "sm:w-[180px]" |
| P1 | src/pages/portal/PortalFazendaDetalhe.tsx:296 | TabsList | "grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 h-auto" |
| P2 | src/pages/portal/PortalLayout.tsx:157 | Button | "max-w-[220px] gap-2" |
| P1 | src/pages/portal/PortalOrdensServico.tsx:200 | DialogContent | "max-w-2xl bg-slate-50 max-h-[90vh] overflow-y-auto" |
| P1 | src/pages/portal/PortalTalhaoDetalhe.tsx:159 | TabsList | "grid w-full grid-cols-2 sm:grid-cols-4 h-auto" |
| P1 | src/pages/portal-parceiro/FichasTecnicas.tsx:172 | DialogContent | "max-w-5xl w-[95vw]" |
| P2 | src/pages/portal-parceiro/PortalParceiroLayout.tsx:181 | SelectTrigger | "h-8 text-sm w-[200px]" |
