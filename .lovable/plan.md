# D51.5 — Remediação horizontal multi-tenant

## Objetivo
Eliminar os bloqueios P0/P1 cross-tenant já encontrados, preservando dados e fazendo todo escopo operacional derivar a organização exclusivamente da identidade autenticada no servidor.

## Fases
1. **Financeiro e documentos:** corrigir relatórios, recibos, RPCs, tabelas e buckets privados; validar IDs e caminhos contra a organização do chamador.
2. **Catálogo:** classificar o catálogo como global ou por empresa; restringir ações globais destrutivas exclusivamente ao Superadmin de Plataforma, com confirmação e auditoria.
3. **Portal:** validar o cliente e seus usuários contra a organização do ator antes de qualquer consulta privilegiada.
4. **Produção:** substituir políticas permissivas por papel + vínculo tenant, com proteção simétrica de leitura e escrita; bloquear fontes sem ownership determinístico.
5. **Fiscal:** escopar configurações, documentos, eventos, funções e arquivos fiscais pelo tenant derivado do JWT.
6. **RBAC sistêmico:** corrigir superfícies operacionais alcançáveis que usam apenas papel sem predicado tenant; registrar dívida fora do alcance atual.
7. **Configuração legada:** manter apenas parâmetros comprovadamente globais no singleton; bloquear dados tenant sem associação segura.

## Validação e entrega
- Aplicar migrations versionadas e reversíveis quando possível, sem backfill ou exclusão de dados sem vínculo comprovado.
- Executar matriz A/B transacional cobrindo financeiro, Storage, catálogo, portal, produção, fiscal, IDs forjados, Superadmin sem tenant e usuários inativos/sem organização.
- Validar estado vivo de policies/funções, índices e planos, testes Edge e React, suíte global, typecheck, build, linter/advisors e scanner.
- Implantar somente funções alteradas, publicar o frontend se houver mudança nele e realizar smoke seguro sem ação destrutiva.
- Atualizar auditoria, matriz, rollback/forward-fix, roadmap e emitir PASS/FAIL-CLOSED/NO-GO por módulo e decisão final.

## Segurança
Nenhuma organização enviada pelo navegador autoriza acesso. Superadmin de Plataforma não recebe dados tenant implicitamente. Onde ownership não for determinístico, o acesso será fail-closed.
