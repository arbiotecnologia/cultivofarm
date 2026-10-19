# Diagnóstico local mínimo — admin empresa exclusivo

Candidata não publicada, nenhuma mudança de lease/gates/resolver/autoridade. AuthProvider existente passa observador **somente admin exclusivo** ao monitor único. Mantém ring de80 registros em memória; nada em localStorage/cookies, rede, servidor ou console automaticamente. Cleanup do monitor limpa o ring; nenhum perfil/role/tenant/id/query/fingerprint/URL/JWT/mensagem de erro é gravado.

Auditor, após revisão e implantação própria da candidata, em DevTools da sessão já aberta:

```js
window.cultivoAuthzDiagnostics()
```

Retorna cópias de `event`, `state`, `reason`, `visible`, `online`, `rttMs`, `leaseRemainingMs`, `requestRemainingMs`. Números monotônicos arredondados; não carrega dados identificadores nem relógio UTC. `rttMs` é delta desde o **request corrente/mais recente**, inclusive eventos stale; não atribuir esse delta a uma resposta antiga. Response corrente mede RTT real incluindo todo probe encadeado, não somente uma RPC.

Copiar ring **antes de Tentar novamente** se possível e registrar separadamente horário aproximado observado. Expire é capturado antes de zerar deadlines: timeout com deltas negativos e visible=false compatível com suspensão/timers; response com RTT elevado/lease vencida compatível com latência. reason error indica fetch/parser, sem texto de exceção; ineligible indica resposta inelegível, não prova por si só edição de perfil. Sem trace correlato não escolher causa.

Pausas admin B ~13:15/~13:19 informadas pelo auditor: recuperação por Tentar novamente sem reload, causa **desconhecida**. Não são chamadas indevidas demonstradas. Dados só aparecerão no bundle revisado futuro, não retroativamente no publicado atual. Captura não altera prazo15s/fail-closed, request em voo/timeout/erro permanece destrutivo. Suspensão real não é certificada por fake timers.

Rollback diagnóstico: restaurar somente dois arquivos base byte-exatos descritos no manifesto protegido; remover exclusivamente localDiagnostics.ts e authzDiagnostics.test.ts adicionados. Não restaurar gates/recibos/roles/RLS/SQL. Observador que lança exceção não muda autoridade; testes RTT3s90s, volta de aba suspensa/stale e limites/allowlist locais.