# Operador onfarm exclusivo — candidata OFF preservada e ativação limitada

## 19/10 01:34 — ativação autorizada após revisão independente

Proprietário informou revisão terminal `423afc908ef4c3cace548c5448e1a0ab850fe774`: diff runtime apropriado, **89 hashes exatos PASS**, staging **6/6 independente PASS**, probes independentes **45/45** (12 operador, 12 consultor, 12 administrador, 9 financeiro; fontes reais/transporte fake) e preflight integral executado em **`swzpzcwiasxmjutrmvkm` PASS**. Evidência externa fornecida, não execução hosted pelo agente nem login real dos probes. Perfil operador restaurado ativo às **`2026-10-19T01:25:21.070143Z`**; administrador B ativo. Nenhum perfil/dado/sessão foi alterado nesta rodada.

Ativado **APENAS `OPERATOR_CONTEXT_MONITOR_ENABLED=false→true`**, sem mudar sequer o comentário adjacente. Assertion real em `src/test/config/operatorGate.test.ts` agora exige true. Comparação binária de todas as fontes `src/` com a terminal revisada confirmou somente esses dois arquivos alterados; o gate é exatamente uma substituição. B2B/produtor/financeiro/admin/consultor true, Blob false, global v6 fechado; redirecionamento, cockpit e anexos byte-exatos.

Manifest OFF de hash `f3cd82b140b62de0d1adec2b632cf3d1b8b023e297d6d0efc0424579f8e28101` e seus **29 artefatos** intactos, sem rehash das provas candidatas; os 60 hashes fonte OFF permanecem históricos, não são reapresentados como estado ativo. `stage.py candidate` recusa o estado ativo com `source_drift`, sem saída parcial.

Novo staging isolado em `scripts/authz-cache/operator-open-session/stage-active.py`, `test_stage_active.py` e `SHA256SUMS-active`. Comando: `python3 scripts/authz-cache/operator-open-session/stage-active.py activation|deactivation|rollback <diretório externo vazio>`. Valida manifest fixo, todos os artefatos e fontes exatas; gate/assertion ativos derivados da prova OFF por substituições únicas. Falha antes de escrever em qualquer drift. `activation` emite apenas o gate true; **`deactivation` emite apenas o mesmo arquivo com a flag operador false**, preservando as outras flags e todos os outros bytes. `rollback` emite os bytes originais e a lista de remoção dos dois testes novos conforme manifest OFF, nunca autoinstala; é rollback completo original da candidata, distinto da desativação isolada. Hashes ativos são recibo separado, não atualização do manifest OFF.

Validações desta ativação:
- **397/397** testes pertinentes em 16 arquivos: 304 sessão/gates/seleção/guards e 93 monitor/cockpit/cache/comprovante de baixa/gates publicados. Sem falha nova; avisos React Router e rotas de negação sem fixture não são falhas. Transporte/Auth simulados, componentes reais: não homologação hosted.
- **5/5** staging ativo: ativação/desativação flag-only, rollback original, drift de gate/assertion/fonte/manifest/artefatos recusado atomicamente, destino e modo inválidos recusados.
- Build automático observado **`build OK` às `2026-10-19T01:35:15Z`**. Diretório de observabilidade disponível contém apenas README/build; **sem recibo independente typecheck, não certificado**. Não foi repetida suíte ampla nem inventado PASS; seis falhas históricas continuam registradas abaixo, não reexecutadas nesta rodada.

Publicação, conferência da HEAD e homologação **login/redirecionamento real do operador e cockpit somente consulta** ficam com o proprietário. Não foi feita publicação, ativação hosted, DDL/DML, Edge deploy, mudança de permissões/contratos ou uso de subagentes. Não afirmar snapshot/ABA, revogação de vínculos, HTTP signer ou idempotência global concorrente. As seções seguintes preservam a descrição e os resultados históricos da candidata OFF; a autorização acima substitui apenas sua pendência de revisão/preflight/ativação.

## Evidência fornecida e escopo

Base publicada `ff1366ec710ed209732743418470978a7a27e007`, bundle informado `avQj65a`. Proprietário informou consultor ativo homologado em login real (draft/poll/revoke/retry negado/restore); isso não homologa o operador.

Login real informado do operador A, UID `9e2046a0-cd7e-4a0f-b726-25e576a8b764`, organização `007bb519-cba0-4704-be2c-cb93ad010048`, roles exatas `[operador_onfarm]`, ativo/não provisório. Em `/cockpit-laboratorio`, inativação às `2026-10-19T01:24:32.726912Z`; às `01:25:01.217Z` tela/menu/Atualizar consulta permaneciam sem reload (>28s). Auditor já restaurou o perfil. Evidência demonstra retenção visual, **não autorização de novas requisições HTTP**. Outra evidência: `/app/login` terminava em `/acesso-pendente`, inclusive após Atualizar acesso, embora cockpit direto estivesse autorizado.

Nenhum dado/perfil/sessão foi modificado pelo agente. Sem banco, DDL/DML hosted, Edge, publicação, ativação ou subagentes nesta fase; contratos fora de escopo.

## Delta limitado

Sete arquivos runtime:

- `src/lib/authz/authzEpochGate.ts`: acrescenta somente `OPERATOR_CONTEXT_MONITOR_ENABLED=false`. Todos os gates publicados permanecem true, Blob false e scope `b2b-context` (global v6 fechado).
- `src/lib/authz/internalContextProbe.ts`: inclui papel tipado operador na implementação existente; h15 → perfil próprio ativo/não provisório → role única exata → has_role self → h15 final. Nenhum getter genérico ou RPC novo.
- `src/hooks/useAuth.tsx`: instala o mesmo monitor somente com operador exclusivo/org UUID, quando gate autorizado; confirmação idêntica não refresca identidade/remonta draft. B2B mantém refresh publicado.
- `src/App.tsx`: boundary do operador em ProtectedRoutes antes do AppLayout/menus/RoleGuard; export de RoleGuard somente para testar sua implementação real, sem mudar RBAC, rotas ou corpo do guard.
- `src/hooks/useAvailableContexts.ts`: para login exclusivo operador pronto, consulta pontual ao **mesmo probe**, cercada por UID/tenant/roles/epoch, sinal abortado, montagem e lease na conclusão. Retorna separadamente a home de `getHomeForRole`, sem fabricar available_contexts, has_technical_access, contexto admin/technical ou preferência. A query não é monitor paralelo; permanece desabilitada para os outros papéis.
- `src/pages/SelecionarPortal.tsx` e `src/pages/AcessoPendente.tsx`: usam somente essa home comprovada, sem redirecionar durante loading/refetch/erro; Atualizar acesso revalida a observação. Gates OFF desabilitam monitor, **não** a correção focal de redirecionamento, que continua exigindo probe server-side.

Inativação/role/tenant observados, erro/offline/timeout, foco/retry invalidam cache e desmontam shell/draft/modal; restauração retoma na mesma URL sem ressuscitar draft. Escopos mistos/plataforma/org NULL não são abrangidos por ativação operador. Probes negam roles mistos e organização inválida.

Cockpit real, seus readers/mutações e RBAC foram preservados byte-exatos. Mantém somente list RPC, consulta e aviso “Consulta disponível; operações do laboratório temporariamente indisponíveis.” Não libera OS/programação/lote/produção ou has_technical_access.

## Testes e limitações de validação

- **381/381**, 16 arquivos: operador **72** casos + **3** flags reais; monitor/consultor/admin/financeiro/produtor/B2B, seleção/guards/contextos, comprovante de baixa e fences Storage.
- **65/65**, 3 arquivos: authzEpochMonitor 29, Cockpit consultaOnly 18, cacheScope 18. Total das seleções disjuntas: **446/446**.
- **6/6** staging: candidato/rollback byte-exatos, drift fonte/artefato recusado antes de saída, destino externo vazio, modos de ativação/desativação proibidos e UTF-8/LF/CRLF.
- Testes usam AuthProvider/ProtectedRoutes/RoleGuard/AppLayout/MobileLogin/SelecionarPortal/AcessoPendente e QueryClient reais, sessão/transporte fake e página cockpit explícita stub. Testes separados exercitam a página Cockpit real com Auth/transporte simulados e comprovam somente list RPC/nenhuma operação montada. **Não são login/JWT/RLS/HTTP hosted nem homologação real.**
- Primeira regressão encontrou **8 falhas novas**, todas em `multiportal.contexts.session.test.tsx`: identity, tenant, roles, logout, inactive, mismatch, loading, provisional. Query desabilitada da home mantinha entrada antiga até coleta; corrigido cancelamento/remoção de todas as duas famílias por scope. Reruns finais sem falha nova.
- Não repetida suíte global. Seis falhas históricas conhecidas na base permanecem: notification-p1-scope (storage), canonicalTypesGuard, cultivofarm-runtime.static, e três etapasVisita (primeiro bloqueio, trava de clique, seletores dependentes). Não corrigidas nem chamadas de risco nulo.
- Build automático observado `build OK` em `2026-10-19T01:30:43Z`. Não há recibo independente typecheck nos logs disponíveis: **typecheck não certificado**; não inventar PASS. Lint indisponível.

## Artefatos fixos e rollback

`scripts/authz-cache/operator-open-session/`: `manifest.json`, `SHA256SUMS`, `preflight-readonly.sql.review`, `candidate/`, `rollback/`, `stage.py`, `test_stage.py`.

Manifest SHA256 **`f3cd82b140b62de0d1adec2b632cf3d1b8b023e297d6d0efc0424579f8e28101`**: 60 hashes fontes/protegidos, 29 artefatos, 15 entradas (7 runtime, 6 fixtures existentes com novo gate false explícito, 2 testes novos). Originais runtime conferidos contra a base publicada. Monitores/probes B2B/produtor, gates Blob, cliente canônico, permissões, cockpit e anexos protegidos e inalterados. Manifest fixado no script, não recalculado para aceitar drift; provas admin/consultor anteriores intocadas.

Preflight **não executado hosted pelo agente**: arquivo integral SELECT/read-only com marker canônico, timeouts, cinco MD5 **originais herdados da fase admin** e ACL/owner/search_path, policies profiles/user_roles, RLS/SELECT e inventário agregado operador sem IDs/emails. Não altera contratos. Conector deve provar ref exato `swzpzcwiasxmjutrmvkm` antes da execução; qualquer drift exige STOP/revisão, nunca rehash automático. As cinco funções e policies são o contrato reutilizado para a observação; RPC de seleção já existente não passa a autorizar operador por si só.

Staging `python3 stage.py candidate|rollback <diretório externo vazio>` apenas emite arquivos de revisão. Nunca instala/publica/ativa/executa SQL. Rollback exige fontes e artefatos candidatos exatos, restaura bytes originais dos 13 arquivos existentes e lista os 2 testes novos para remoção manual. Não toca flags/anexos/monitores de outros recortes. Evolução ou ativação posterior recusa staging: rollback não autoinstala nem remove gate de outro trabalho. Não emite ativação nesta fase.

## Gates independentes pendentes

Revisão independente do delta/hashes/staging, execução integral read-only canônica e eventual autorização de ativação pelo proprietário. Depois, homologação real operador draft/poll/revoke/retry negado/restore e login `/app/login`/Atualizar acesso no bundle publicado. Não repetir inativação nem criar dados para produzir evidência nesta fase.

Sem alegação de vínculo específico, entitlements/global v6, snapshot atômico, ABA/transientes entre polls, HTTP signer ou idempotência global concorrente de comprovantes. URL já emitida/bytes baixados não são revogados por esse boundary. Monitor observacional conserva lease/poll existentes, sem SLA medido; suspensão/timers e requests fora do boundary dependem de autoridade server-side.