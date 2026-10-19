# Monitor — latência da probe + revogação parcial gestor/consultor (pacote único contra PUBLICADO 1c2f29e)

Status: candidato revisável. NÃO publicado, sem SQL, sem grants/RLS, sem mutação de dados/papéis.
Substitui para publicação os pacotes `monitor-retry-reresolve/` (histórico, baseline d767eb23).

## O que muda
1. Probe `internalContextProbe`: 2 idas sequenciais (antes 4+N). Onda 1 paralela h15+profiles+user_roles; onda 2 só após
   conjunto exato: has_role por papel + releitura de user_roles + h15 final. Lease 15 s e folga 7,5 s inalterados.
   Papel único aceito só como string (array de 1 elemento falha); "gestor" entrou na lista apenas para o escopo residual.
2. Retry (sessão que já foi monitorada): `retryPending` fecha `authzReady`/`checkAuthzAccess` de forma síncrona antes de
   qualquer await; geração++, cache/rascunhos/seleção limpos, época++ (remonta e revoga Blobs); single-flight; leitura fresca
   de perfil/papéis decide se re-resolve pelo carregador existente. Erro/offline/inativo/0 papéis → probe nega, tela pausada.
   Empresa divergente nunca é adotada pelo Retry.
3. Escopo residual monitorado: na MESMA sessão/identidade que foi monitorada como par gestor+consultor, se a re-resolução
   der exatamente `['gestor']` ou `['consultor_tecnico']` com org UUID, o mesmo provider cria monitor com a mesma probe
   (h15/perfil ativo/senha definitiva/conjunto exato/has_role vivo/h15 final) para o papel restante; boundaries em
   ProtectedRoutes/AppPortalGuard/SelecionarPortal. Rotas seguem o RoleGuard com os papéis novos (só do papel restante).
   Login novo de gestor sozinho mantém o comportamento publicado (sem monitor). Superset/0/desconhecido/papel não revisado
   continuam bloqueados com mensagem de permissões alteradas.

## Testes (transporte/relógio fake; não é JWT/RLS real)
- `monitorRetryReresolve.integration.test.tsx` 15: dupla→gestor (has_role só de gestor, rotas /dashboard/geral e
  /financeiro/receber, sem /app/registrar), dupla→consultor (só /app/registrar), residual perdendo papel pausa de novo,
  residual inativo negado, superset/0/desconhecido/financeiro negados, readiness fechada antes do await, restauração do par
  via nova pausa+Retry, offline, latência 3 s com single-flight, corrida, cross-tenant.
- `internalProbeLatency.test.ts` 12: publicado 1c2f29e reproduz 7740 ms e expira; atual 2580 ms estável 10 min; 8 s ainda expira.
- `managerConsultantOpenSession` atualizado em 2 pontos (manager/consultant_loss e environmental gestor/consultor):
  contrato antigo "continua pausado" trocado por "recupera papel restante sem reviver rascunho/modal", por decisão do proprietário 19/10 17:20.
- Suíte config+lib+multiportal+portalGuard: 1390/1392; 2 falhas preexistentes (imports de tipos legados em 5 arquivos).
- tsgo app/node sem erros.

## Reversão
`rollback.sh` restaura bytes exatos de 1c2f29e para os 7 arquivos e remove os 2 testes novos; verificado em cópia temporária.

## Fora deste pacote / avisos
- Delta de runtime vs 1c2f29e também contém `supabase/functions/generate-financial-report/index.ts` = Edge v90 já LIVE
  (sincronizado antes). Não reverter: voltaria a assinatura v89. Receivables e lote seguem só em `scripts/` (.review), fora do runtime.
- 8 testes do relatório financeiro ainda esperam v89.
- Homologação real pendente: retirada só consultor (deve recuperar gestor), só gestor (deve recuperar consultor), estabilidade pós-renovação.

## Adendo 17:26 — estabilidade do papel restante (achado independente)
Risco confirmado por teste: sem renovação antecipada, o papel restante com probe de 3 s e poll de 10 s leva ~16 s por ciclo
e vence o lease de 15 s. O pacote já inclui `residualContextOnly` em `environmentalContextOnly` (renovação antecipada já
revisada, pollWhenHidden, revalidação ambiental) para gestor E consultor restantes, só no escopo residual exato. Lease 15 s,
folga 7,5 s, gates, grants e demais escopos inalterados; consultor de login novo (gate CONSULTANT) e operador não foram tocados.

`residualScopeStability.integration.test.tsx` (AuthProvider/monitor/probe reais; transporte fake por chamada; relógio fake
incluindo performance): par→gestor e par→consultor, rápido→lento 1,5 s/chamada (3 s/probe) por 10 min, lento desde o
início, 4 s/chamada (8 s/probe) ainda pausa; controle sem renovação antecipada expira para os dois papéis.
Prova de que o teste discrimina: retirando `residualContextOnly` de `environmentalContextOnly`, 4/8 falham (arquivo restaurado byte-igual).
Suíte config+lib+multiportal+portalGuard: 1398/1400 (2 preexistentes). tsgo app/node sem erros. Rollback 1c2f29e byte-exato.
