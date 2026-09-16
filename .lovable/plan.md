# Cultivo Farm: nova marca e personalização por cliente

Trocar "AR Bio / On-Farm Manager" por "Cultivo Farm" em todas as telas e documentos, remover o termo "On-Farm" também dos menus e nomes de processo, e permitir que cada cliente e parceiro tenha nome e logomarca próprios nos seus portais.

## Etapa 1 — Renomear a marca (sem tocar no banco)

- Nome padrão do sistema passa a ser "Cultivo Farm" (hoje "AR Bio" aparece fixo no código quando a configuração não responde).
- Cabeçalhos dos portais: interno, produtor, parceiro e aplicativo de campo passam a mostrar o nome configurado, com "Cultivo Farm" como padrão; a segunda linha "On-Farm Manager"/"On-Farm" sai.
- Telas de entrada (login web e login do aplicativo), tela de erro e rodapés de relatórios passam a usar o mesmo nome.
- Documentos em PDF (comprovantes, catálogos, fichas, pedidos, simulações, relatórios financeiros e executivos) passam a usar nome e logomarca da configuração, com "Cultivo Farm" como padrão, em vez do texto fixo "A.R Biotecnologia".
- Título e descrição da aba do navegador, nome do atalho no celular e textos de compartilhamento atualizados.
- Logomarca padrão: o símbolo atual continua como imagem de reserva até você enviar a nova. Se já tiver a arte do Cultivo Farm, envie que eu troco nesta etapa.

Onde o termo "On-Farm" descreve processo, a substituição fica assim:
- "Produção On-Farm" (seção do menu) → "Produção"
- "OS On-Farm" → "OS de Produção"
- "Dashboard Produção", "Cockpit Laboratório" e demais itens permanecem.

Textos internos de código (nomes técnicos de arquivos, filas e canais) não mudam nesta etapa: não aparecem para o usuário e mexer neles traria risco desnecessário.

## Etapa 2 — Marca por cliente e por parceiro

Hoje existe uma única configuração de aparência (nome, logo e cores) para toda a instalação. Para cada cliente/parceiro ter a sua:

1. Guardar nome de exibição, logomarca e cores em cada cliente e em cada parceiro.
2. Nova tela/aba "Identidade visual" dentro do cadastro do cliente e do parceiro, onde o próprio gestor envia a logomarca e define o nome exibido.
3. Nos portais do produtor e do parceiro, o cabeçalho, o login por convite e os documentos gerados passam a usar a marca do cliente/parceiro daquele contexto; sem marca própria, cai para a marca geral ("Cultivo Farm").
4. Portal interno e aplicativo de campo continuam com a marca geral.

Essa etapa exige alteração no banco autorizado (novas colunas nas tabelas de clientes e parceiros, permissões de leitura para o portal e pasta de arquivos para as logomarcas). Pelas regras atuais do projeto eu não executo mudanças de banco sem sua autorização explícita — então ela só começa quando você liberar, e a Etapa 1 pode ser feita antes, sozinha.

## Detalhes técnicos

- Fonte única de marca: estender `useSystemConfig` (defaults `nome_empresa: "Cultivo Farm"`) e criar `useBranding()` que resolve, nesta ordem, marca do contexto ativo (cliente/parceiro) → configuração do sistema → padrão.
- Substituir literais em `AppLayout.tsx`, `AppSidebar.tsx`, `MobileLayout.tsx`, `PortalLayout`/`PortalParceiroLayout`, `Auth.tsx`, `MobileLogin.tsx`, `ErrorRecovery.tsx`, `ReportShell.tsx`, `ExecutivoRelatorioDetalheDrawer.tsx`, `index.html`.
- PDFs: `src/lib/pdf/arBioHeader.ts` (renomear para `brandHeader`) recebe nome/logo por parâmetro; ajustar os chamadores em `src/lib/pdf/*` e `comprovanteEntregaPdf.ts`.
- Menus: ajustar rótulos de seção em `src/config/navigation.ts` e os testes de navegação que fixam os nomes atuais.
- Etapa 2: colunas `marca_nome`, `marca_logo_url`, `marca_cor_primaria` em `clientes` e `partners`, bucket de logos com RLS, leitura liberada ao usuário vinculado; provider de marca por contexto ativo.
- Validação: vitest dos testes afetados (navegação, entregas, PDFs), typecheck e build. Sem publicar, sem GitHub, sem Cloud; banco somente após sua autorização.
