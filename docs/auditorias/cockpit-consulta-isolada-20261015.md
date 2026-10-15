# Cockpit — consulta Admin AR validada externamente; operações NO-GO

## Evidência externa adicional — 2026-10-15 18:51 UTC
Renato informa sessão real Admin FSF/Fagner: Cockpit0OS, buscaOS-2026-000004 da AR=0, limpar=0 e recarga de URL direta=0; nenhuma OS AR residual observada. Evidência de estado pós-troca, NÃO gravação da transição durante login. Testes locais de resposta atrasada são evidência separada/simulada, não substituem a transição real. Sete funções continuam auth/anon EXECUTE=false segundo relato externo: programar, lote, avançar, replanejar, refresh, alertas e resumoBI. Consulta AdminAR/FSF pós-troca PASS restrito externo; produção/mutações NO-GO. Auditoria autorizada subsequente SOMENTE candidata rpc_programar_os_v1, sem liberação ou fabricação.

## Atualização documental — 2026-10-15 18:47 UTC

HEAD conferido nesta rodada: `b1b6fb63a992132e0d8391ea9b673c2914be4dfe` (b1b). Somente documentação/arquivamento pelo agente: sem alteração de código, DDL, dados, permissões, testes operacionais ou publicação; nenhuma próxima fase implementada.

**Evidência externa fornecida por Renato, não reproduzida pelo agente:**
- Consulta b1b publicada e validada por Admin AR real: 2 OS, `OS-2026-000003` e `OS-2026-000004`; busca `000004` retorna 1, limpar retorna 2. Desktop e mobile `390×844` validados.
- 36 testes independentes, typecheck, lint focal e build PASS; scanner 3986/0 informado. Lint global legado permanece pendente; não declarar lint global PASS.
- SQL hospedado com `SET LOCAL ROLE authenticated`, claims existentes e `iat`: Admin AR 2, FSF 0, Consultor 0, Financeiro 0, SA com readiness=false 0; anon recebe `42501`. Primeira simulação sem `iat` retornou 0 por proteção esperada, não defeito. Evidência SQL por ROLE/claims não equivale a browser FSF nem prova de troca de identidade.
- Fonte atual `20261015183119` já aplicada; 61+10 assertions isolados PASS não equivalem a produção nem prova completa de Auth/RLS.

**Migration externa JÁ APLICADA — NÃO REAPLICAR:** `20261015184433_h_cockpit_enable_scoped_read_only`, arquivada literalmente do SQL fornecido na mensagem em `scripts/rbac-audit/applied-20261015184433_h_cockpit_enable_scoped_read_only.sql`, sem comentários/wrappers adicionais. Não consultado ledger remoto nesta rodada. Preflight preserva helper definition `bad38b5200629cc887767e62b7a46e40`, RPC definition `c51739eb0d9f91470fa6700d1c19763d`, exige migration183119 e ausência de USAGE authenticated no schema private.

Liberação externa restrita a três privilégios authenticated: EXECUTE helper, EXECUTE RPC de lista e SELECT view. PUBLIC/anon continuam sem leitores; MV/eventos/idempotência e seis mutações listadas no pós-teste seguem contidos. Não autoriza workspace, filhos operacionais, outras fontes ou ampliação de papéis.

**Gates atuais:** consulta Admin AR **PASS restrito**, segundo prova externa; FSF browser/troca de identidade **PENDENTES**, dependem de login e recorte autorizado. Produção/fabricação/mutações/programar/lote/publish **NO-GO**; volume NULL continua sem autorização de fabricação. Ownership OFF e diagnóstico separados. Não é auditoria integral.

**Rollback documental, NÃO EXECUTADO:** revogar somente os três privilégios liberados de authenticated, mantendo todas as contenções, corpos/guards e demais ACL:
```sql
REVOKE EXECUTE ON FUNCTION private.h7n_esteira_laboratorio() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_cockpit_listar_esteira_v1(text,text[],text[],text[],boolean,date,date,boolean,integer,integer) FROM authenticated;
REVOKE SELECT ON public.vw_esteira_laboratorio FROM authenticated;
```
Não conceder USAGE no schema private, não remontar workspace e não restaurar grants antigos. Rollback remoto exige autorização própria.

Arquivos desta rodada: arquivo SQL184433 acima, este relatório, `roadmap.md` e `scripts/rbac-audit/cockpit-read-candidate-manifest.json`; memória de restrições sincronizada. Commits automáticos da plataforma; nenhum commit Git manual.

## Histórico da preparação 18:32–18:37 (estado anterior, superado somente para consulta)

HEAD inicial real: `46583eefdc95e83bfee202fa699c3fcaada49cbc`. Escopo autorizado18:32: app existente somente consulta da RPC de lista. Não publicado; nenhum DDL/grant/dado/Auth ou operação de laboratório executado.

## Evidências e limites
- **Externa Renato/revisor:** candidato465, 61 assertions PGlite com corpos exatos/schema/Auth simulados PASS. Migration183119 aplicada com fullpreflight/pós-condições e ACL fechadas. Helper/RPC AdminAR2, FSF0, ConsultorAR0, FinanceiroAR0 via claims de contas reais sob executor privilegiado: NÃO prova RLS/Auth/JWT reais. Admin logado vê erro contido na página antiga. BI global FSF contava2OS AR, agora contido.
- **Própria read-only:** binding canônico `swzpzcwiasxmjutrmvkm` comprovado pelo catálogo da integração antes das consultas. Ledger exato e hashes atuais recuperados, sem leitura de linhas operacionais: helper definition `bad38b5200629cc887767e62b7a46e40`, RPC `c51739eb0d9f91470fa6700d1c19763d`, conversor `b112888e28d8a5727df713e0ae7bcd1b` intacto; authenticated helper EXECUTE/view SELECT/list RPC EXECUTE false.
- **Local:** 71/71 Vitest em5arquivos, incluindo18novos da consulta e18cache. QueryClient e página efetivos; Auth/transporte simulados. Não é prova JWT/RLS/browser autenticado. Lint hook/componente/2testes PASS0; página11erros/1warning antes e depois, nenhuma categoria nova (comparação com46583eef). Global legado FAIL3294/126 da fase anterior não reexecutado. Scanner focal5arquivos zero achados; diff-check PASS. Build automático OK18:37:34; typecheck automático tsgo exit0 observado nos logs do ambiente, nenhum build/typecheck manual. Sem alegar lint global PASS.

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
Estado histórico 18:37: GO somente preparação local; publicação/grant aguardavam revisão e RPC retornava42501. Atualização18:47 acima registra liberação externa somente da consulta; demais superfícies permanecem contidas. Nesta rodada documental nenhum SQL foi executado, apenas arquivado.

Fonte atual e tenant/descendentes foram corrigidos externamente; isto não certifica outros leitores MV, cache de outros módulos, performance/EXPLAIN, paginação concorrente ou contratos técnicos. Micro somente isolado, nenhuma OS micro real; programação/cliente sem organização preservados e excluídos pelo helper. Fabricação/volume, programar/lote/publish, ownership e diagnóstico seguem NO-GO/OFF. Não usar executor privilegiado como prova de autorização.

Rollback local: fechar `COCKPIT_LIST_QUERY_AVAILABLE` e manter consulta indisponível; nunca remontar workspace operacional, abrir grants ou reaplicar arquivos applied. Sem rollback remoto nesta rodada. Arquivos frontend: useCockpitQuery.ts, CockpitLaboratorio.tsx, CockpitConsulta.tsx, cacheScope.test.tsx, consultaOnly.test.tsx; AGENTS/documentos/manifesto/roadmap atualizados. Commits geridos pela plataforma, sem commit Git manual.

Commits observados: implementação `0f1c1487`, testes `a24485aa`; arquivamento/documentação `4a3aab10`, `59fc5e7a` e `74c8817e`. Atualização final documental gera sucessor automático. Sessão informada pelo ambiente `external_unmanaged`: não foi possível restaurar sessão real; nenhum fluxo autenticado próprio alegado. Consulta autenticada real permanece bloqueada por ACL e depende da próxima revisão/grant autorizado, não de credenciais do usuário.