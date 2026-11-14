# Financeiro / Serviços — investigação e correção

## Causa comprovada
**Expectativa de teste obsoleta**, não falha de permissão nem de sidebar. O teste antigo excluía Serviços do catálogo Financeiro apesar da autorização própria vigente. Correção apenas de testes, sem alterar configurações, perfis, guards, sidebar, rotas, recursos operacionais ou banco.

### Provas independentes da expectativa corrigida
1. `src/lib/services/serviceBilling.ts:4–12`: cadastro/prestações para administrador, gestor e financeiro; faturamento/perfil fiscal para administrador e financeiro. Não depende do filtro de navegação.
2. `src/components/catalogo/servicos/ServicosTab.tsx:32–67`: a página real usa essa matriz para Novo/Editar/Registrar; leitura mantém Ver e oculta cadastro/prestações para administrativo. Teste de navegador com dados sintéticos confirma.
3. `src/test/services/serviceBilling.test.ts:6–23`, preexistente: exige explicitamente Financeiro RW em Serviços, R em Produtos e nenhum acesso a Microrganismos. Executado sem alterar suas asserções: 9/9 PASS.
4. `src/lib/permissions.ts:364–390`: exceção de Serviços precede o recorte Financeiro de Produtos. Query exata única; ambíguas e demais abas técnicas negadas.
5. `src/pages/Protocolos.tsx:483–537`: allowedTabs e barreira antes da montagem consultam `canAccess` por query; somente a aba selecionada monta seu leitor.
6. `src/components/AppSidebar.tsx:39–60` e `src/lib/navigation/search.ts:28–36`: filtro por papel/query mantém Serviços autorizados; feature/plano continuam restringindo. `src/config/navigation.ts:128`: deep link canônico único `/base-tecnica?tab=servicos`.
7. `src/App.tsx:226–253,564`: RoleGuard mantém papel/contexto e entitlement da página; Protocolos faz o recorte da query. Não foi declarado que RoleGuard sozinho interpreta query (usa pathname). `src/lib/saas/featureRouteMap.ts:17`: catalogo_precos obrigatório.
8. Documentação de módulo: `src/components/catalogo/servicos/AGENTS.md` e `scripts/service-nfse-dps-profile-20261113/REPORT.md`: cadastro/prestação/faturamento canônicos por empresa, perfil DPS e gates de emissão separados. Captura SQL local `scripts/service-catalog-nfse-20261113/remote-20261113150414_scope_service_fiscal_profiles_to_issuer.sql:7–11` preserva tenant e admin/financeiro fiscal; não executada e não apresentada como prova de estado hosted atual.

## Alterações
- `src/test/catalogo/unifiedProducts.realClient.test.tsx`: mantém todas as negativas de CRUD de produto, escritores, tenant e abas técnicas; agora exige **lista exata Produtos + Serviços** na tela e **protocolos + protocolos-produtos + protocolos-servicos** no menu. Acrescenta R de Produtos e RW de Serviços. Título/comment corrigidos, sem `arrayContaining`, skip ou afrouxamento.
- `src/test/navigation/financeServices.test.tsx`: 17 casos cobrindo sidebar real (apresentação do PortalSidebar substituída para inspecionar grupos), ausência do plano, autorizados/restritos/read-only, navegação por aba e query ambígua. Página Protocolos real com filhos sintéticos: separa prova do guard de prova de conteúdo. Browser adicional usa filhos/página Serviços reais.
- `roadmap.md` e esta pasta: comandos, stdout, exit codes, fontes/hashes, capturas e limites.

## Execução antes/depois
- **ANTES isolado, antes de corrigir:** `before-command.txt`, `before-stdout.log`, `before-exit.txt`: exit 1; 1 falha / 34 não selecionados. Filtro foi usado somente na reprodução pedida; não na bateria completa.
- O antigo `expanded-regression.log` citado pelo pedido não está presente no checkout atual. REPORT original descreve 233 PASS/1 FAIL/16 arquivos. Comando reconstruído exatamente da execução anterior registrada na conversa, preservando os mesmos argumentos e maxWorkers=2 em `full-command.txt`; o teste de quatro negativas de etiquetas acrescentado depois daquela execução explica **238** em vez de **234** testes. Não há arquivos omitidos nem filtro/skip.
- **DEPOIS bateria completa:** `after-full-stdout.log`, exit **0**: **238/238 testes, 16/16 arquivos PASS**, zero skips. Mesmos sete arquivos de etiquetas, seis de envase, lotes e dois de produtos. A primeira execução completa também passou; preservada em after-full-first-stdout.log.
- **Navegação e prova independente de Serviços:** `navigation-command.txt`, `navigation-stdout.log`, exit **0**: **26/26 testes, 2/2 arquivos PASS**, zero skips. Não somar cenários como prova de autorização hosted.
- Compilação/typecheck automática verificada após correção dos seletores: consultar build-evidence.log. A primeira versão usou opção `exact` que Vitest aceitava mas TypeScript não; substituída por regex ancorada, mantendo precisão; ambas as baterias foram repetidas. Sem build/typecheck manual.

## Navegador
`check_navigation.py`, `browser-stdout.log`, `result.json` e quatro capturas: Chromium localhost 1280×1800, Auth/transporte sintéticos e toda rede externa bloqueada. Financeiro Serviços mostra Novo/Editar e exatamente Produtos/Serviços; clique em Produtos mostra consulta sem Novo produto. Administrativo mostra Ver, sem Novo serviço. Consultor em URL direta recebe Acesso bloqueado e zero leitores. Zero pageerrors. Não houve cadastro, faturamento, emissão ou escritor produtivo.

## Limites e reversão
Sem publicação, deploy, banco, binding ou dependências alterados. Teste sintético não certifica JWT/RLS/tenant/planos reais. Reversão local consiste em restaurar o teste antigo e remover o teste novo, mas isso restaura a expectativa obsoleta; não modificar a matriz de permissões para fazê-la passar. Logs anteriores e outcomes não foram apagados.
