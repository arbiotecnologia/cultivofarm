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
