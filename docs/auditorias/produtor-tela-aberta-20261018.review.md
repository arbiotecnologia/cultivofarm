# Produtor — revogação em tela aberta, candidata limitada

## Delta vigente 18/10 23:37 — preferência corrigida, produtor ativado na prévia

As seções abaixo são histórico da candidata ea575bac, não o estado vigente do gate. Autorização expressa do usuário: após corrigir seleção e validar fontes/regressões, **PRODUCER_CONTEXT_MONITOR_ENABLED=true**; financeiro **false**, B2B true/scope b2b-context, global/v6/Blob/contratos fechados. Sem publicação/DDL. Auditor ainda fará live preflight e revisão antes de publicar; não declarar homologação real concluída.

Defeito reproduzido antes da correção: **2/2 casos novos FAIL** em `/app` e `/portal`: seleção explícita B já resolvida voltou ao principal A no primeiro poll idêntico. Causa dupla: chave local incorporava readiness/epoch e limpeza de contexto apagava as preferências em AuthProvider/useAvailableContexts.

Correção mínima: chave de preferência JSON `[UID, tenant, roles ordenadas]`, separada do scope de autorização (que **continua** contendo readiness/epoch). Toda preferência em memória/localStorage só é exposta após nova lista canônica/RLS e fence temporal válidos. Seleção revogada é substituída/removida do storage. Confirmações produtor preservam apenas preferência cliente na limpeza visual; caches, geração, query cancellation/clear, remount e RPCs novas continuam inalterados. Logout/expire/limpeza explícita mantêm comportamento de descarte. Nenhum dado/autorização de epoch anterior é reutilizado; storage forjado não concede vínculo.

**Resultados:** 10 arquivos / **146 testes PASS**, incluindo B sobrevivendo >=2 polls idênticos em ambos os portais, contagem h15 e incremento de epoch comprovados; revogar B com A restante escolhe A e sobrescreve preferência; UID/tenant/roles distintos com mesmos IDs elegíveis não herdam B; storage forjado descartado. Regressores de B2B, financeiro, timeout/offline/stale e anexos passam. **2/2 staging PASS**, bytes/hashes e source drift sem saída parcial. Build/typecheck automático OK, último observado `23:42:10Z`; diff check PASS. Sessões/RPC simuladas nos testes React, não JWT/RLS/login real.

**Artefatos atuais:** `scripts/authz-cache/producer-preference-release/manifest.json`, `1..5.candidate.review`, `1..5.rollback.review`, `producer-gate.on.review`, `producer-gate.off.review`, `stage.py`, `test_stage.py`. Baseline delta `9d074f78f956294e07ffacbb70cad44f169afb5e`, PRE/POST SHA256 fixos no manifest; receipt da autorização no mesmo manifest. Rollback do gate exige POST exatamente igual a `producer-gate.on.review` antes de substituir pelos bytes off; rollback completo exige os cinco POST antes de restaurar os cinco PRE. Não sobrescrever drift/alterações posteriores. Artefatos originais produtor/financeiro são históricos imutáveis; staging antigo deve rejeitar drift, não reaplicar por cima.

**Preflight de fonte:** engine monitor, probe produtor, probe B2B, useStorageAccessScope, Blob gate e preflight SQL produtor byte-idênticos ao baseline; hashes de proteção fixos no novo manifest. Assinaturas/guards SQL/RLS não alterados nem executados live aqui. Correção anexos a905: auditor informou **5/5 + 4 hashes + stage2/2 PASS**; preservada, sem nova alegação de homologação Storage/URLs/bytes. Limites de observação 10s/15s navegador ativo, ABA transitório/snapshot não atômico, suspensão e URLs já emitidas continuam vigentes.

## Evidência independente e escopo

Relato do auditor recebido em 18/10/2026 23:24 UTC: sessão real do produtor
`suporte@refilinformatica.com.br`, UID `d83b4a1c-e665-4d40-ba39-9674ba657c0a`,
org A `007bb519-cba0-4704-be2c-cb93ad010048`, em `/app`. Vínculo
`7c6614c1-fc53-473a-af16-dc7b6ec31752` revogado às `23:17:14.70556Z`;
captura às `23:17:41.383Z` ainda mostrou 2 talhões/2 recomendações sem reload.
Banco negou cliente/anexo sob authenticated+claims, prova SQL distinta de login.
Vínculo já restaurado via CAS: is_active=true, revoked_at/revoked_by=NULL.
Nenhuma manipulação desse vínculo pelo agente nesta rodada.

Baseline de trabalho: `a905ae694f119e5f42a90f530b697da0c729ae32`.
Candidata preserva B2B publicado e mantém `b2b-context`, foundation true,
Blob false; novo `PRODUCER_CONTEXT_MONITOR_ENABLED=false` até liberação externa.
Monitor engine, B2BRouteGuard, probe B2B e App.tsx/rotas byte-idênticos à baseline.
Não é ativação global/v6, não muda RLS, contratos, Edges, permissões ou dependências.

## Defeito concreto e correção mínima

- O monitor não observava produtor no escopo b2b-context. Portanto revogar
  vínculo não alterava authzReady/epoch e os dados locais permaneciam montados.
- AppPortalGuard liberava produtor sem boundary. Agora pausa antecede leitores
  dependentes de authzReady e envolve a árvore existente. Desktop já possui
  PortalGuard→AuthzEpochBoundary→PortalLayout; preservado e exercitado realmente.
- MobileDashboardProdutor tinha seis useQuery sem fence de ator/epoch nem
  abortSignal. Usa o useScopedPortalQuery já existente, sem leitor paralelo.
- usePortalCliente agora recheca fence temporal no término das três leituras
  e ao expor seleção, além da geração/tenant/epoch já existentes.
- AuthProvider impunha erro de cliente único `profile.cliente_id` ao produtor
  exclusivo. Somente com a candidata habilitada, a ausência desse campo deixa
  de substituir o resolver multi-cliente; pending/negação vem do monitor.
  Gate false preserva a barreira antiga. Profile.cliente_id nunca vira fallback.

## Autoridade existente, não getter genérico

O único monitor do AuthProvider recebe um ramo produtor, somente para uma role
real exclusiva `cliente_produtor` já carregada pelo Auth. A lista local escolhe
o recorte de observação, NÃO concede acesso. Internos/multipapel ficam fora.
`producerContextProbe.ts` valida respostas desconhecidas, não resolve permissões:

1. `h15_actor_organization()` self: tenant deve coincidir com o perfil atual.
   Core exige perfil/organização ativos e platform_actor_access_ready, incluindo
   barreira de convite/iat; erro/null/tenant divergente falham fechado.
2. `get_cliente_ids_for_user({_user_id: user.id})` existente: vínculos ativos,
   não revogados e vigentes. Campo presente inválido/erro não vira fallback.
   **Sozinha essa RPC não é autoridade suficiente**: fn_authz_uid_scope_ok possui
   permissões administrativas e não aplica tenant; não foi alterada.
3. Leitura de clientes por IDs e organization_id/status ativo no cliente canônico.
   RLS live: `Clients read access`→can_user_access_cliente(id), mais policy
   RESTRICTIVE tenant_isolation_d51_5→platform_private.h15_actor_organization().
   Retorno inesperado/tenant alheio/ID fora do conjunto é rejeitado.
4. Reconsulta h15 ao final. Todos os clientes elegíveis entram no conjunto
   deduplicado/ordenado, sem cardinalidade=1, sem depender do selecionado.

Fingerprint é **tupla observada**, não revisão monotônica; não inventa orçamento
server-side. Mesmo conjunto confirmado refaz cache via refreshOnConfirmation
existente. Poll 10s/lease 15s desde início da consulta em navegador ativo; timeout,
offline, pending/expired, geração e descarte de respostas do monitor preservados.
Leituras separadas não formam snapshot atômico; mudança após leitura continua
sob RLS em cada recurso e próxima observação. Não alegar ABA universal/instantâneo.

## Capturas somente leitura no canônico

Conector informado como `swzpzcwiasxmjutrmvkm`; config/client conferidos antes das
leituras. Capturas reais de corpos/ACL/owner/search_path, não testes de login:

| Função | MD5 pg_get_functiondef |
|---|---|
| public.get_cliente_ids_for_user(uuid) | c80d5900692d960f649d0a9f7850fe2c |
| public.fn_authz_uid_scope_ok(uuid) | 00a9a4d4a075d756d312d69778493b39 |
| public.h15_actor_organization() | 55edafec08bcc84a00f1526c14334a2c |
| platform_private.h15_actor_organization() | 64e10608403238a41a9baf92857ca881 |
| public.can_user_access_cliente(uuid) | 4c2eaf7ab10e204e7ad57d41cb418554 |
| platform_private.platform_actor_access_ready(uuid) | 048249c0c2106c3761e26eacb8d0de84 |

Checksum policies clientes capturado: `ad69f41e27cba39ec819b209517dd28f`, algoritmo
exato no preflight. Preflight integral READ ONLY com guards de hash/ACL/owner/
config/volatilidade/RLS e timeouts preparado para auditor; **não executado
integralmente pelo agente**. Capturas individuais não substituem seu postflight.

## Candidatos e rollback

`scripts/authz-cache/producer-open-session/manifest.json`: SHA256 PRE/POST fixos
de seis arquivos runtime. `.candidate.review` preserva gate false; `.rollback.review`
restaura bytes da baseline. Novo probe não tinha PRE: rollback instrui remoção
somente desse arquivo, após validar POST; não apagar arquivo divergente.

`producer-gate.activation.review` é artefato separado true, nunca aplicado aqui;
`producer-gate.deactivation.review` volta a false preservando foundation/B2B.
SHA256 gate false `82aaff16a4c1394f67b42c6f1dca4852bb15855a13ce7e657d041364a6a6ee49`;
true `680b083e509d3a493535e7c136d1eb52863da1f9523d5c3d7c79dd169080d75a`.

`stage.py candidate|rollback|activation <diretório externo>` gera somente cópias
para revisão, recusa drift de TODOS fontes/artefatos antes de output. Não instala.
Operador deve comparar destino com PRE/POST do manifest antes de aplicar/restaurar;
stage não autoriza nem implementa escrita transacional no checkout de destino.

## Testes e limites

- `src/test/config/producerOpenSession.integration.test.tsx`: **23/23 PASS**.
  AuthProvider/monitor/Router/PortalGuard/AppPortalGuard, MobileLayout/PortalLayout,
  dashboards, usePortalCliente e QueryClient reais. RPC/Auth/transporte simulados;
  mocks só de apresentação/branding/offline-sync/entitlements e respostas de serviços.
  Não roles mock como autoridade server-side; não prova JWT/RLS/login real.
- **143/143 PASS, 10 arquivos** na regressão direcionada: inclui suíte acima,
  b2bOpenSession, authzFoundation, b2bPreviewRelease (gate produtor real false),
  portalCliente.session, producerWorkspace.session, portalGuard.authorization,
  multiportal.guards, multiportal.featureGuards e attachmentLeaseDeadline.
- Prova `/app` e `/portal`: pending inicial antes de dados, contagem 2, poll revoke
  remove conteúdo/cache, retry revogado mantém pausa, restore recupera mesma URL;
  dois clientes legítimos/troca B/revogação parcial mantém B; timeout/resposta velha;
  offline/restore com contagem tardia 999 não regressa; tenant A/B/A observado;
  login interno/multipapel não inicia monitor produtor; gate false não inicia.
- Helpers de resposta: tipos inválidos, h15 erro/tenant incorreto, linha alheia,
  conjunto multi-cliente deduplicado. Fixtures não desligam triggers nem produzem
  claims reais; nenhuma escrita hosted.
- `test_stage.py`: **2/2 PASS**, bytes/SHA256 candidato/rollback/ativação e drift
  sem output parcial. Goldens apurados explicitamente, não regenerados por teste.
- Build/typecheck automáticos: `build OK` observado às 23:30:04Z; não executados
  manualmente. Diff-check PASS. Sem ciclo completo de milhares de testes.
- Warning React observado de update em render em useAvailableContexts/
  clearActivePortalContext no fluxo de troca; callback legado já existe, não
  reformulado nesta fase. Não declarar console limpo ou risco nulo.

## Pendências para liberar

1. Auditor executar preflight integral canônico e revisar os seis deltas + artefato
   de ativação. Gate produtor atual permanece false, B2B funcional.
2. Auditor ativar/implantar somente após revisão e testar login real mobile/desktop:
   revogar/restaurar por CAS, sem reload/interações intermediárias; múltiplos
   clientes/troca de tenant e internos. Agente não homologou essas sessões.
3. Navegador suspenso/ABA intermediário/URLs já emitidas/bytes baixados permanecem
   limites. Não há drenagem de signedURLs nem abertura Blob/global/v6.

Sem DDL/DML hosted, deploy Edge ou publicação pelo agente. Preparação concluída,
ativação/homologação real pendentes de liberação independente; auditoria global
e contratos amplos continuam fechados.