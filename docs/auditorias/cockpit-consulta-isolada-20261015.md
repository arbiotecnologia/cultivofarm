# Cockpit — consulta isolada preparada, sem liberação remota

HEAD inicial real: `46583eefdc95e83bfee202fa699c3fcaada49cbc`. Escopo autorizado18:32: app existente somente consulta da RPC de lista. Não publicado; nenhum DDL/grant/dado/Auth ou operação de laboratório executado.

## Evidências e limites
- **Externa Renato/revisor:** candidato465, 61 assertions PGlite com corpos exatos/schema/Auth simulados PASS. Migration183119 aplicada com fullpreflight/pós-condições e ACL fechadas. Helper/RPC AdminAR2, FSF0, ConsultorAR0, FinanceiroAR0 via claims de contas reais sob executor privilegiado: NÃO prova RLS/Auth/JWT reais. Admin logado vê erro contido na página antiga. BI global FSF contava2OS AR, agora contido.
- **Própria read-only:** binding canônico `swzpzcwiasxmjutrmvkm` comprovado pelo catálogo da integração antes das consultas. Ledger exato e hashes atuais recuperados, sem leitura de linhas operacionais: helper definition `bad38b5200629cc887767e62b7a46e40`, RPC `c51739eb0d9f91470fa6700d1c19763d`, conversor `b112888e28d8a5727df713e0ae7bcd1b` intacto; authenticated helper EXECUTE/view SELECT/list RPC EXECUTE false.
- **Local:** 71/71 Vitest em5arquivos, incluindo18novos da consulta e18cache. QueryClient e página efetivos; Auth/transporte simulados. Não é prova JWT/RLS/browser autenticado. Lint hook/componente/2testes PASS0. Typecheck/build são automáticos do ambiente; resultados observados registrados ao fechar a rodada. Lint global legado FAIL3294/126 da fase anterior não reexecutado, sem alegar lint global PASS.

## Arquivos applied — históricos, NÃO REAPLICAR
Serialização literal do ledger, sem inserir comentários ou wrappers; MD5 desconsiderando somente LF terminal nos dois arquivos de contenção:
- `scripts/rbac-audit/applied-20261015182119_h_cockpit_contain_bi_integrity_definer_readers.sql`: `f2f668d113977d9ca14a7b7f57540766`.
- `scripts/rbac-audit/applied-20261015182209_h_cockpit_contain_global_alert_generation.sql`: `a53219694ca5ba953a543548d4ea90e2`.
- `scripts/rbac-audit/applied-20261015183119_h_cockpit_live_source_tenant_chain_closed.sql`: bytes17450/MD5 `24d91d2a1f69e9905a49c4ae6a271186`, incluindo LF final do ledger. Comentário inicial antigo "NÃO APLICADO" preservado literalmente; estado real JÁ APLICADO EXTERNAMENTE.

## Implementação
- Página/rota existente monta somente `CockpitConsulta`, nunca `CockpitWorkspace`. Workspace antigo preservado como código inacessível; nenhum hook de operações, métricas, perfis, históricos, alertas, resumo/pendências ou diálogo operacional montado.
- Gate separado `COCKPIT_LIST_QUERY_AVAILABLE=true` aceita apenas prefixo `cockpit-laboratorio`, identificador da RPC e opt-in `reader=listRPC`; `COCKPIT_READ_AVAILABLE=false` intacto. Gates frontend NÃO autorizam banco. Nenhuma fonte MV/BI alternativa; request canônico com AbortSignal.
- Lista, rótulos de estágios/filtros server-side, busca/origem/prioridade e LIMIT50/OFFSET. Total é da RPC, nunca agregado global ou fallback. Volume NULL "Não informado", sem dose/volume inferidos.
- Scope/fence existente user+profile+tenant+roles+readiness, cancelamento/eviction e remount da consulta ao trocar contexto. Filtros/página resetados; erro de RPC não expõe detalhe privado nem dados de cache como atuais. Refetch manual só da lista pronta; disabled/readiness impede transporte.
- Testes assertivos carga/refresh/filtro/página somente RPC de lista, nenhum `.from` nem mount operacional, A→B tardia abortada/invisível, troca identidade limpa filtros/cache, logout/loading/inativo/tenant/roles, opt-in com chave errada e refetch fechado, erro42501 sem fallback.

## Gates, dependências e rollback
GO somente preparação local. Publicação e grant mínimo de leitura aguardam revisão de Renato; ACL de todas superfícies permanece fechada. A RPC preparada atualmente deve mostrar erro seguro42501, não lista vazia como sucesso. Provas de schema afetado/grants preservadas: nenhum SQL foi executado, apenas arquivado.

Fonte atual e tenant/descendentes foram corrigidos externamente; isto não certifica outros leitores MV, cache de outros módulos, performance/EXPLAIN, paginação concorrente ou contratos técnicos. Micro somente isolado, nenhuma OS micro real; programação/cliente sem organização preservados e excluídos pelo helper. Fabricação/volume, programar/lote/publish, ownership e diagnóstico seguem NO-GO/OFF. Não usar executor privilegiado como prova de autorização.

Rollback local: fechar `COCKPIT_LIST_QUERY_AVAILABLE` e manter consulta indisponível; nunca remontar workspace operacional, abrir grants ou reaplicar arquivos applied. Sem rollback remoto nesta rodada. Arquivos frontend: useCockpitQuery.ts, CockpitLaboratorio.tsx, CockpitConsulta.tsx, cacheScope.test.tsx, consultaOnly.test.tsx; AGENTS/documentos/manifesto/roadmap atualizados. Commits geridos pela plataforma, sem commit Git manual.