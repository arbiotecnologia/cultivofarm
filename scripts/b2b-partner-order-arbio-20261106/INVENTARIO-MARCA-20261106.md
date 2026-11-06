# Inventário "Cultivo Farm" — marca do sistema × empresa operadora/fornecedora (2026-11-06)

Escopo: código de aplicação em `src/` e `supabase/functions/` (testes e tipos gerados excluídos; importações de `cultivofarm.types` são nomes técnicos). Sem banco, SQL, publicação, SMTP ou envios.

Fontes do nome:
- Portal B2B (comprador): vendedor autorizado do leitor escopado (`supplierName`, fallback "empresa fornecedora"). Nunca o tenant/parceiro comprador.
- Telas internas e portal do cliente: `useActiveTenantName` — RPC existente `org_onboarding_state` (organização derivada de `auth.uid()` no servidor), cache por usuário/tenant/época, adotado só se `organization_id` coincide com o perfil atual; carregando/troca/logout/erro → "empresa responsável".

## ALTERADAS (empresa operadora/fornecedora → nome dinâmico)
| Arquivo:linha | Antes | Depois |
|---|---|---|
| src/pages/portal/PortalSolicitacao.tsx:82 | "A equipe Cultivo Farm receberá…" | equipe da {tenant} |
| src/pages/portal/PortalPerfil.tsx:63 | equipe Cultivo Farm | equipe da {tenant} |
| src/pages/portal/PortalDashboard.tsx:84 | equipe Cultivo Farm | equipe da {tenant} |
| src/pages/portal/PortalOrdensServico.tsx:212 | fallback "Laboratório Central Cultivo Farm" | "Laboratório da empresa responsável" (neutro) |
| src/pages/financeiro/FinanceiroRelatorios.tsx:47 | "…financeiros da Cultivo Farm" | {tenant} |
| src/pages/financeiro/FinanceiroDashboard.tsx:181 | "Visão gerencial — Cultivo Farm" | {tenant} |
| src/pages/executivo/DashboardSociosB2B.tsx:21 | "operação B2B Cultivo Farm" | {tenant} |
| src/pages/comercial/IndicadoresComerciais.tsx:21 | "módulo B2B Cultivo Farm" | {tenant} |
| src/components/bi/BIHeader.tsx:21 | "BI Operacional Cultivo Farm" | "BI Operacional — {tenant}" |
| src/components/executivo/relatorios/ExecutivoRelatorioDetalheDrawer.tsx:124 | cabeçalho "Cultivo Farm — Portal Executivo" | {tenant} |
| src/components/comercial/ParceiroB2BFormDialog.tsx:734 | "CIF (frete por conta da Cultivo Farm)" | {tenant} |
| src/components/comercial/PaymentSimulationSummary.tsx (aviso sob consulta) | "equipe comercial da Cultivo Farm" | prop `responsavelNome`: vendedor em NovoPedido.tsx:1120, tenant em SimuladorComercial.tsx:94; fallback "empresa fornecedora" |
| src/components/catalogo/FichaProdutorDrawer.tsx:145 | "em validação pela Cultivo Farm" | "pela empresa responsável" (neutro; usado também no portal B2B sem nome de vendedor) |
| src/pages/Relatorios.tsx:56,331,344,365,382 | título PDF "Cultivo Farm — …" | {tenant} |
| src/pages/app/MobileCatalogoTecnico.tsx:103 | texto copiado "Cultivo Farm · …" | {tenant} |
| src/pages/VisitaTecnica.tsx:1017 | `config.nome_empresa` (branding GLOBAL) ou "Cultivo Farm" | {tenant} |
| src/components/entregas/EntregaComprovantePanel.tsx:757 | "Cliente e Cultivo Farm" | {tenant} |
| src/pages/entregas/FormularioEntregaPrint.tsx:14,161,184,204,355,388 | termo "recebi da Cultivo Farm…", 2ª via, cabeçalho, entregador | {tenant} |
| src/components/financeiro/relatorios/ReportShell.tsx:196,255 | cabeçalho/rodapé "Cultivo Farm" | {tenant} |
| src/components/etiquetas/EtiquetaProdutoPrint.tsx:36,62 | cabeçalho da etiqueta | {tenant} |
| src/components/etiquetas/EtiquetaProdutoActions.tsx:103,107 | placeholder "Padrão Cultivo Farm" | "Padrão da {tenant}" (só placeholder; valores e cancelamento intocados) |

## MANTIDAS — marca do SISTEMA / técnicas
- Login/marca: src/pages/Auth.tsx:12,21,30,91; src/components/LogoDisplay.tsx:2,49; src/config/brand.ts:7,8; src/hooks/useSystemConfig.ts:17; assets `*-cultivofarm.png.asset.json`.
- Aplicativo/atualização: src/pwa/PwaUpdateNotifier.tsx:34,52; src/pwa/PwaManualCheckButton.tsx:40; src/pwa/registerSW.ts:128 (nome de cache); src/components/ErrorRecovery.tsx:58.
- Títulos de aba do navegador: src/pages/MonitoramentoAlertas.tsx:66; src/pages/Protocolos.tsx:493; src/pages/entregas/FormularioEntregaPrint.tsx:30.
- "sistema Cultivo Farm" (validação do sistema): src/components/entregas/QRCodeComprovante.tsx:40; src/pages/entregas/FormularioEntregaPrint.tsx:398; páginas públicas sem tenant src/pages/public/ValidarEntrega.tsx:175,298 e src/pages/public/RastrearProduto.tsx:67.
- Plataforma/equipe da plataforma: src/pages/configuracoes/MeuPlanoTab.tsx:251; src/components/onboarding/OnboardingEmpresa.tsx:187,274,331,384,390 (revisão pela equipe da plataforma); src/pages/configuracoes/ComunicacaoConfigTab.tsx:1221 (webhook Meta → sistema); src/components/executivo/ExecutivoHeader.tsx:24 e ExecutivoRelatorioDetalheDrawer.tsx:323 (nome do portal/gerador).
- Técnicas: src/config/fiscalBinding.ts:44 (projeto); src/lib/calendarIcs.ts:25 (PRODID); URLs/CORS/redirect em supabase/functions/_shared/platform-invite-redirect.ts:1, _shared/fiscal/corsAllowlist.ts:21-24, _shared/comunicacao/cors.ts:11, download-*-document/index.ts, sync-calendar-event/index.ts:13; EHLO em _shared/comunicacao/native-smtp-client.ts:63 e smtp-provider-probe.ts:252,265.
- E-mails do sistema (acesso à plataforma; sem alterar SMTP/destinatários): platform-invite-org-admin/index.ts:380,385, access-handler.ts:46, platform-org-admin-email-change/index.ts:85, test-communication-email/index.ts:207, tenant-email-settings/f2f3/executor.ts:25, f4/sender-executor.ts:12.

## PENDENTES (não alterados nesta rodada — exigem decisão)
- src/lib/pdf/arBioHeader.ts:6,8 — cabeçalho/rodapé de vários PDFs (catálogo, fichas, pedido, simulação) com logo do sistema. Trocar exige passar o nome por ~8 geradores e decidir a logo por empresa.
- src/components/protocolos/MicrorganismosTab.tsx:139,266,292 e src/lib/protocolos/seedMicrorganismosARBio2026.ts:81 — `fornecedor: "Cultivo Farm"` é VALOR GRAVADO em cadastro, não mensagem; alterar mudaria dados persistidos.
- Acompanhamento de pedidos B2B continua neutro até haver projeção autorizada do vendedor.

## Testes
`src/test/comercial/activeTenantName.test.tsx` (6): AR Bio × FSF, carregamento/troca sem nome anterior, resposta de outro tenant recusada, erro/logout/sessão carregando neutros sem consulta, marca `APP_NAME` preservada, aviso de cotação com vendedor/fallback. Testes existentes que montam telas sem QueryClient receberam mock do hook (`reportShell.*`, `cancelamentoContido`) e o sandbox do PDF da visita recebeu `tenantLabel`; nenhuma asserção foi removida.
Limite: sem JWT/RLS real; não se comprovou em sessão hospedada que `org_onboarding_state` responde para todos os papéis — se recusar, a tela mostra o neutro.

## Revisão 607c0d3f — onde ainda resta rótulo neutro FIXO (não é nome dinâmico)
Estes pontos NÃO estão concluídos como nome dinâmico; falta projeção autorizada do nome no contexto:
- src/pages/portal/PortalOrdensServico.tsx:212 — fallback do laudo "Laboratório da empresa responsável" (quando o laudo não traz responsável).
- src/components/catalogo/FichaProdutorDrawer.tsx:145 — "em validação pela empresa responsável"; usado no portal B2B (CatalogoCardsGrid) e na recomendação ao produtor (TalhaoRecomendacaoCard) sem nome do vendedor/tenant nas props.
- Acompanhamento de pedidos B2B (TimelinePedidoDialog e lista) — fonte atual não traz o vendedor.
- Pedido B2B antes da instalação do SQL: o fallback legado retorna `sellerName=null` → "empresa fornecedora" até o leitor escopado existir.
Dinâmicos (nome real quando o contexto autorizado responde; neutro só em carregamento/troca/logout/erro): demais itens da tabela ALTERADAS.

## Revisão 90b26883 — fonte corrigida e estado real
- `org_onboarding_state` só devolve nome ao ADMIN (definição de produção). Fonte trocada para `tenant_display_name_v1` (pacote `scripts/tenant-display-name-20261106/`, NÃO aplicado). Até a instalação, TODAS as telas internas/portal do cliente listadas como "ALTERADAS" exibem o rótulo neutro para todos os perfis — inclusive admin. Não estão concluídas como nome dinâmico.
- B2B: nome do vendedor vem do leitor de volumes (NovoPedido) e do campo `seller` da projeção já autorizada (`useMyPartner`, sem consulta financeira nova): acompanhamento (MeusPedidos → linha do tempo e PDF do pedido), aviso do layout, clientes, fichas (texto e PDF), simulações (PDF), histórico/solicitações (PDF). Ambos dependem de SQL ainda NÃO aplicado → hoje neutro "empresa fornecedora".
- PDFs: cabeçalho recebe `empresaNome` obrigatório em todos os 7 geradores (catálogos, fichas, dossiê, pedido, simulação); logo e rodapé "Documento gerado pelo Cultivo Farm" preservados (sistema). Sem nome comprovado → "Empresa responsável".
- `ReportShell.tsx` revertido byte a byte (pin financeiro `0ec06253`): cabeçalho/rodapé dos relatórios financeiros voltam a "Cultivo Farm" — PENDENTE de revisão de diff da evidência financeira.
- Fornecedor gravado/seed de microrganismos: mantido (dado, não mensagem).
- Neutros fixos remanescentes (sem projeção): laudo `PortalOrdensServico.tsx:212`, `FichaProdutorDrawer.tsx:145`, `AccountingPendingNotice.tsx`, aviso de usuário sem vínculo `PortalParceiroLayout.tsx` (sem parceiro não há vendedor).
