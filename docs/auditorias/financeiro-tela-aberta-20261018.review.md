# Financeiro — inativação com tela aberta, candidata limitada

## Evidência externa prioritária
Relato independente do auditor: financeiro teste3@refilinformatica.com.br, UID `e19fb370-904b-4342-9d3f-f7983c85ed45`, tenant A, sessão real em `/financeiro`, R$100 fictícios. CAS `profiles.ativo=false` em `2026-10-18T23:22:59.598284Z`; às `23:23:25.163Z` valores e navegação ainda visíveis sem reload. Perfil RESTAURADO ativo em `23:23:45.155922Z`. Não repetir mutação nem confundir esse relato real com transportes simulados locais.

## Menor correção no fluxo existente
- Novo gate **FINANCIAL_CONTEXT_MONITOR_ENABLED=false**, exclusivamente role única `financeiro`. Não amplia para todos internos/multipapel, não substitui RBAC. Produtor false, B2B true/scope b2b-context preservados; Blob/global/v6/contratos fechados.
- Mesmo monitor do AuthProvider: h15 antes/depois, perfil self ativo/senha definitiva/tenant/UID, conjunto atual user_roles self exatamente financeiro e RPC canônica has_role estritamente true. Nenhum cliente paralelo/getter genérico usado como autoridade.
- Boundary existente envolve AppLayout antes de sidebar/RoleGuard somente no gate financeiro. Pending/expired oculta árvore e cancela/limpa QueryClient; retry restaura na mesma URL/sessão. Não alterar páginas financeiras, cálculo, autorização servidor, migrations ou Edge.
- Alteração/remoção/mistura de roles pausa: não adota role nova com identidade antiga; restore da role original permite retry, ou login novo resolve outro contexto. Perfis originalmente multipapel/administrador fora do recorte.
- Inativação/readiness/roles é distinta de revogação por cliente, pagamento, entidade ou entitlement. Esse recorte não certifica tais revogações.

## Contratos e revisão
Consulta SELECT read-only no conector canônico confirmou corpos/ACL/config de h15, readiness e has_role; hashes fixos no preflight. Policies self profiles/user_roles checksums respectivamente `a992e27bcd16e5a9c2b0f15e7d7a1288` e `58efe4cf56b157356aab320802a5219e`. **Arquivo preflight integral ainda exige execução independente pelo auditor**; captura individual não equivale a PASS integral nem prova JWT/login.

## Resultados locais
- 6 arquivos / **108 testes PASS**, incluindo **19 financeiros** com AuthProvider, monitor, ProtectedRoutes, AppLayout, dashboard financeiro e QueryClient reais; sessão/RPC transport fake, widgets periféricos fake. Pending inicial; R$100 antes de inativação; remoção de valores/sidebar; retry negado; restore mesma URL; 0 role/administrador/multipapel negados; timeout; offline/restore; resposta financeira antiga R$999 descartada; gate false/interno preservados; strict flags/has_role; tenant/UID divergentes.
- Regressões B2B, produtor `/app`/`/portal`, foundation, configuração sem mocks e rotas financeiras passaram. Nenhuma suíte global executada/reivindicada.
- **2/2 staging PASS**: bytes/hashes candidate/rollback/activation e source drift sem saída parcial. Manifest estático gerado explicitamente fora dos testes.
- Build/typecheck automático: último `build OK` observado às `23:35:49Z`; erros iniciais de tipos gerados desatualizados foram corrigidos sem gerar/editar tipos. `git diff --check` PASS.
- Warnings JSDOM de dimensões dos gráficos e warning legado produtor `Selection`/`AppPortalGuard` permanecem; não demonstram homologação visual/browser.

## Artefatos e rollback
Diretório `scripts/authz-cache/financial-open-session/`: `manifest.json`, `preflight-readonly.sql.review`, `1..4.candidate.review`, rollback dos três arquivos existentes, `financial-gate.activation.review` e `financial-gate.deactivation.review`, `stage.py`, `test_stage.py`.
Manifest registra baseline entregue do produtor e SHA256 PRE/POST; script apenas materializa fora do projeto e rejeita drift antes de escrever. Rollback primeiro desativa gate com comparação de bytes/hash, depois restaura exatamente os três PRE; arquivo novo só removido após conferir POST. Não aplicar rollback se outra mudança alterou os arquivos: revisar baseline novo. Artefatos históricos do produtor são imutáveis; por compartilharem useAuth/gate, seu staging antigo deve falhar por drift, não regenerar silenciosamente ou aplicar sobre a candidata financeira. Ativação financeira e produtor permanecem revisões independentes.

## Inventário financial-docs — negativo preservado
Pagamento `c18e061b-16ee-4e32-b031-cb043d0528d7` tem `organization_id NULL`, acesso negado conforme evidência externa. Não é positivo A; não backfill/inventar tenant, não abrir RLS ou fabricar fixture. Nova emissão de URL exige autorização atual/fence; URL previamente emitida/bytes baixados não são revogados por esta correção UI.

## Pendências e riscos
Auditor deve executar preflight integral, revisar delta/manifest e autorizar gate antes de login real financeiro/inativação/restore/roles sem reload. Sem DDL/DML hosted, Edge deployment ou publicação pelo agente. Observação poll10s/lease15s em navegador ativo; suspensão/offline/latência não são SLA. Leituras separadas não são snapshot transacional, não detectam ABA transitório universal; h15/has_role continuam mandando por operação no servidor. Entitlements/entidades/global-v6/anexos completos permanecem sem homologação; não afirmar auditoria global concluída.