# Monitor — "Tentar novamente" com re-resolução de identidade (gestor+consultor)

Status: candidato local revisável. NÃO publicado, NÃO aplicado. Sem SQL, sem grants, sem mutação de dados/papéis.

## Achado real (recibo do auditor)
Conta B gestor+consultor_tecnico em `/dashboard/geral` (bundle CZMhBo9B). Retirada só de consultor_tecnico pausou; Retry
continuou pausado; restauração da mesma linha + Retry recuperou. Causa: `internalContextProbe` exige conjunto exato e
`revalidateAuthz` apenas repetia a probe com papéis em cache; gestor sozinho não possui escopo monitorado.

## Correção (src/hooks/useAuth.tsx + 4 pontos de guarda)
- Retry (sessão que já teve escopo monitorado): cerca síncrona (geração++, rascunhos/recibo de renovação descartados,
  cancel+clear do cache, seleção de portal limpa, época++ → remonta conteúdo e revoga Blobs no unmount); single-flight.
- Leitura fresca de perfil/papéis decide só se é preciso re-resolver; nunca concede autoridade.
  - mesmo conjunto e mesma empresa, erro/offline, perfil inativo ou 0 papéis → repete a probe existente (nega; tela pausada; sem signOut no Retry).
  - conjunto divergente ativo na mesma empresa → re-resolve pelo carregador existente (`fetchProfileAndRole`, geração fenceada).
  - empresa divergente → Retry não adota (TOKEN_REFRESHED/novo login seguem o caminho publicado com probe própria).
- Trava de sessão monitorada: se a re-resolução cair em escopo não monitorado (gestor sozinho, superset, papel desconhecido,
  0 papéis), `authzReady=false`, `checkAuthzAccess=false`, estado exibido "expired" e boundary aplicado também em
  ProtectedRoutes/AppPortalGuard/SelecionarPortal. Mensagem: "Suas permissões foram alteradas. Saia e entre novamente".
  Limpa só em troca de identidade, SIGNED_OUT ou signOut. Não foi criado escopo "gestor sozinho" (não necessário para fechar o bypass).
- Probe, lease 15 s, folga 7,5 s, contratos e RLS inalterados.

## Testes
`src/test/config/monitorRetryReresolve.integration.test.tsx` (AuthProvider/monitor/boundary reais, transporte fake — não é JWT/RLS):
subset gestor-only (com prova de leitura fresca), consultor-only, superset, 0 papéis, papel desconhecido, restauração com
nova época, offline+recuperação, latência 3 s com duplo clique single-flight, corrida de retirada durante Retry, cross-tenant.
`src/test/config/` inteiro: 979/981 — 2 falhas preexistentes já reproduzidas em baseline limpa (imports de tipos legados).

## Reversão
`rollback.sh` restaura bytes exatos de `baseline/` (commit d767eb23, anterior a esta correção) e remove o teste novo;
verificado byte-exato em cópia temporária. Hashes: `SHA256SUMS.baseline`, `SHA256SUMS.candidate`; delta em `frontend.patch`.
Observação: d767eb23 não é o commit publicado; o delta contra o publicado inclui outros pacotes já documentados.

## Pendente (homologação real separada)
Retirada só de gestor e só de consultor em browser real; nada aqui é PASS real.

## Adendo 17:12 — estabilidade após renovação natural (FALHOU no real)
Correção do relato anterior: a renovação natural do admin B (auth_refresh 16:57:47.744Z → reconfirmed 16:57:50.976Z)
ocorreu, mas a ESTABILIDADE NÃO PASSOU: expire 17:00:07.518Z, reason timeout, rttMs 7740, leaseRemainingMs -10,
requestRemainingMs 7260, visible/online true, UI pausada (screenshot do auditor).

Causa: `internalContextProbe` fazia 4+N idas SEQUENCIAIS (h15, profiles, user_roles, has_role por papel, h15 final);
no par gestor+consultor são 6 — ~1,29 s/ida ≈ 7,74 s, acima da folga de 7,5 s.

Correção (sem subir lease 15 s, sem novo piso, sem RPC nova, sem fingerprint global, sem grants/RLS):
- Onda 1 paralela: h15 + profiles + user_roles. Decisão só após todas chegarem; nenhuma leitura concede autoridade.
- Onda 2 (só depois do conjunto exato): has_role por papel + releitura de user_roles + h15 final, em paralelo.
  A releitura mantém detectada a mudança de papel ocorrida durante a onda 1 (contrato do teste revisado preservado).
- 2 idas sequenciais no lugar de 6 (para financeiro/admin/consultor/operador: 2 no lugar de 5). Erro de transporte → indisponível (fail-closed).
- Não há atomicidade nova: leituras separadas continuam sem provar snapshot/ABA transitório (já documentado na probe).
  Um contrato atômico server-side exigiria SQL revisado; não foi criado.

Testes `internalProbeLatency.test.ts` (monitor e probe reais, transporte/relógio fake): baseline reproduz 7740 ms e expira
após transição RTT baixo→alto; atual = 2580 ms e estável por 10 min de ciclos, cadência limitada; 4 s/ida (8 s) ainda
expira sem resposta tardia reviver; has_role nunca antes do conjunto exato; remoção/ganho de papel durante a onda 1 nega;
erros em profiles/roles/has_role/h15 falham fechados. `baseline/.../authzEpochMonitor.ts` é shim de tipo do teste, fora do rollback.
Resultados: src/test/config + src/test/lib 1277/1279 (2 preexistentes), tsgo app/node sem erros, rollback byte-exato verificado.
Homologação real de estabilidade continua pendente.
