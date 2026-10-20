# Releitura única após perda de papel — ativada localmente, NÃO publicada

## Revisão13a01 (vigente)
Fontes exatas b3a65696/b6d7f4 ativadas após candidato1135/1135 e types0; runtime1077+58 PASS, build automáticoOK. Política ativa, sem skip/todo/exclusão/neutralização. Seis testes receberam somente preparação de transporte controlado, com 179 linhas de asserts originais preservadas. Relatório, diff, originais, resultados e rollback em `active-policy-validation/REPORT.md`. Instabilidade admin também reproduzida no baseline; estabilidade real não certificada. CQ nullable e gates intactos; sem publicação/banco/sessões/recarga. Os resultados abaixo são históricos e não são a evidência liberadora atual.

## Mudança (frontend.patch)
- Novo `src/lib/authz/roleChangeReresolve.ts` (política pura) e 4 trechos em `useAuth.tsx`.
- Quando o probe do par gestor+consultor ou do residual responde `ineligible`, online, agenda UMA vez
  o mesmo `revalidateAuthz` do botão Tentar novamente (leitura fresca perfil+roles, loader cercado,
  novo monitor/probe do escopo residual). Conteúdo fica oculto (retryPending/estado expired) até a nova confirmação.
- Orçamento: 1 tentativa; rearma só após confirmação `valid`. Cancelado por signOut/unmount/troca de escopo.
- Não altera lease 15 s, monitor, probes, SQL, roles; não restaura papel; não adota tenant; não cria signOut.

## Agendamento RTT (análise; sem mudança)
Confirmação chega em t=R; lease vai até 15 s desde o início do request; renovação antecipada usa
margem max(7,5 s, 2R) e atraso mínimo 1 s. Próxima resposta chega em ≈ R + 1 + R.
- R=3 s: próximo request ~t=7, resposta ~t=10 < 15 → válido.
- R=8 s: próximo request ~t=9, resposta ~t=17 > 15 → expira (timeout). Limite estrutural: 2R+1 < 15 → R < ~7 s.
Corrigir exigiria ampliar lease ou aceitar resposta tardia — ambos proibidos. Mantido; auto_retry de timeout existente continua.

## Testes
- Novos (14) `roleChangeReresolve.test.tsx`: candidato 14/14; contra baseline 14/14 (no baseline o teste positivo
  comprova a necessidade do clique manual — reprodução da homologação real).
  Cobre: gestor/consultor residuais, papel não restaurado, revogação total, inativo, corrida, tenant, 401, 403,
  offline, logout com SIGNED_OUT, desmontagem com resposta antiga, RTT 8 s.
- Suíte original `src/test/config`: baseline 1077/1077; candidato 1041/1077.
  As 36 falhas (5 arquivos) param TODAS no passo de preparação que espera ver "Sessão de acesso pausada"/"Tentar novamente"
  após remover papel — a pausa passa a ser transitória. É mudança de CONTRATO (pausa manual → releitura automática),
  não asserção de segurança falhando. Asserts não foram alterados. Ativação exige decisão do revisor e
  atualização revisada desses testes; sem isso, NÃO ativar.
- Testes anteriores do monitor (loader 23 + regressões 18): 35/41; 6 falhas = residualScopeStability com a mesma causa.
- Typecheck app em cópia isolada com candidato: exit 0 (baseline também 0).
- Sintético: não é JWT/RLS hosted, nem certificação de estabilidade.

## Rollback
`python3 scripts/monitor-role-change-reresolve-20261020/rollback.py` (recusa drift; preserva CQ/SQL).
