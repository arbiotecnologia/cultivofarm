# Monitor — recuperação automática LIMITADA de timeout transitório

Status: candidato local revisável contra `89151cac`. Sem SQL, grants, publicação ou mutação de dados.

## Comportamento
- Só `expire` com motivo `timeout`, só nos escopos ambientais já homologados (par gestor+consultor, residual,
  administrador, financeiro). Sem rollout global.
- Agenda a MESMA rotina `revalidateAuthz` do botão (leitura fresca perfil/papéis + probe canônica). Sem provedor paralelo.
- Máx. 2 tentativas automáticas (backoff 1,5 s e 4 s). O orçamento NÃO renova a cada timeout: só volta após 60 s
  de visão válida contínua, ou nova identidade/logout. Depois disso: pausa + "Tentar novamente" manual.
- `ineligible`, `error`, `offline` encerram o orçamento (não há autorrecuperação de revogação, perfil inativo/provisório,
  tenant divergente ou erro desconhecido).
- Timer cancelado em: clique manual (single-flight preservado), recriação/parada do monitor, troca de escopo/identidade,
  unmount e signOut. No disparo revalida montagem, identidade, escopo, mesma instância do monitor, estado `expired` e
  ausência de Retry em voo.
- Inalterados: fence de geração no expire, lease 15 s, folga 7,5 s, loader 20 s, limpeza de cache/portal/rascunhos/Blobs.
  Dados ficam ocultos durante o backoff; só uma nova verificação completa válida reabre.
- Diagnóstico local `auto_retry` (allowlist numérica, sem identidade).

## Testes (AuthProvider/monitor/probe/boundary reais, transporte e relógio fake — não JWT/RLS)
`autoTimeoutRecovery.integration.test.tsx` (10): spike>lease→saudável recupera com probe nova; timeouts repetidos param
(contagem congelada) e Retry manual funciona; recuperação curta não renova orçamento; revogação e perfil inativo durante
backoff negados; ineligible nunca autorrecupera; Retry manual concorrente single-flight; transporte sem resposta termina
pausado; TOKEN_REFRESHED durante backoff com revogação negado; unmount cancela timer.
`transientTimeoutRecovery.test.ts` (6): política pura.
Contrato revisado em financial/companyAdminOpenSession: probe pendurada única agora recupera sozinha, rascunho descartado.
Suíte src/test/config + src/test/lib: 1358/1362 antes do ajuste (2 contratos acima, atualizados) + 2 falhas preexistentes
de guarda de tipos legados. tsgo app/node OK.

## Limites
Latência real ≥ 15 s continua expirando; a autorrecuperação só ajuda se a rede normalizar em seguida.
Homologação real pendente. Reversão: `rollback.sh` (byte-exato verificado em cópia temporária).
