# Ação de assinatura pendente — correção focal

## Causa raiz e limites da evidência

Defeito comprovado no cliente: `useAlterarAssinatura` aguardava indefinidamente `db.rpc` sem deadline, criava correlação nova a cada tentativa e retornava a promessa de invalidação global em `onSettled`. Assim tanto RPC/autenticação/rede pendentes quanto um refetch pendente podiam manter React Query em pending e o botão em “Aplicando…”. Não há telemetria suficiente para atribuir o último clique a lock específico, rede ou sessão. A informação do proprietário de ausência de nova linha de histórico foi preservada; nenhuma ação real foi repetida.

Revisão read-only das migrations locais confirmou retorno UUID, idempotência por `correlation_id`, `last_correlation_id`, histórico transacional e wrapper/core existentes. Nenhuma consulta ou alteração remota nesta correção; não se trata de nova certificação remota do contrato.

## Implementação

- Mesmo hook e RPC, cliente canônico; nenhum fluxo paralelo ou mudança de autorização/RLS.
- Deadline RPC 15 s, abort do transporte e Promise.race; abort **não** prova rollback. Resultado ambíguo inicia “Verificando resultado…”.
- Até três verificações read-only, cada uma limitada a 4 s, por organização + correlação no histórico, depois assinatura. Erro/ausência de leitura não é falha definitiva. Prazo lógico máximo inicial 27 s; retry manual com pré-verificação até 39 s. Timers dependem da execução do navegador, podendo atrasar em aba suspensa.
- Coordenador compartilha promessa no duplo clique e chave por conteúdo normalizado durante pendência/ambiguidade, inclusive remount no mesmo documento. Retry exclusivamente manual primeiro consulta commit tardio; quando necessário reutiliza correlação na mesma RPC. Sem retry mutante automático.
- Sucesso UUID válido ou commit correlacionado é idempotente; formulário limpa motivo/versão. Empresas/ação permanecem como contexto. Invalida somente subscriptions, history, entitlements e entitlement-context, sem aguardar refetch.
- `finally` libera estado de reconciliação; `networkMode: always` impede pausa offline indefinida. Trava síncrona protege clique duplo; `aria-live` anuncia estados e erro seguro com correlação.
- Erros PostgreSQL explícitos usam mensagens já sanitizadas; falha de transporte/sessão/resposta malformada reconcilia e informa incerteza sem revelar detalhes internos.

## Arquivos

`src/lib/saas/subscriptionTransition.ts`, `src/hooks/usePlataformaSaaS.ts`, `src/pages/plataforma/PlataformaGestao.tsx`; testes `subscription-transition-timeout.test.ts`, `useAlterarAssinatura.test.tsx`, `assinatura-legada-regularizacao.test.ts`; `AGENTS.md`, `roadmap.md` e este relatório.

## Evidências

| Verificação | Resultado |
|---|---|
| Sucesso, RPC negada, timeout sem/com commit, duplo clique, chave estável, leituras pendentes, erro rede/sessão/malformed e commit tardio | PASS: 8 testes do coordenador |
| Hook: liberação mesmo com invalidation pendente, erro/finally, desmontagem e quatro caches exatos | PASS: 3 testes renderizados |
| Suíte pertinente SaaS | PASS: 445/445, 44 arquivos, 18:05 UTC |
| Lint de todos os arquivos TS/TSX alterados | PASS |
| Scanners segredos/integração fiscal existentes | PASS focal |
| Typecheck/build automáticos | PASS: `build OK` 18:04:53 UTC; erro inicial de tipagem no teste corrigido |
| Auth/RPC real e UI autenticada | BLOCKED / NÃO EXECUTADO; não modificar dados reais |

SHA observado após correções e antes deste fechamento documental: `7b92798e88dd8f542832f4aa9acbb8435dc28b73`. Commits são geridos automaticamente; nenhum commit manual criado e este SHA não inclui necessariamente a documentação posterior.

## Risco residual e gate manual

Uma requisição abortada pode ter commit tardio. Ausência no prazo limitado é **resultado não confirmado**, nunca garantia de falha. Chaves são preservadas no documento atual, não após reload/novo browser; antes de novo envio nesse caso conferir histórico pelo código registrado. A idempotência backend permanece essencial; nenhuma correção de locks/idempotência server-side foi feita.

GO focal para os contratos frontend testados; **NO-GO para certificação funcional em produção**, sem sessão real e sem executar transições reais. Gate: proprietário observar o estado atualizado em sessão autorizada, consultar histórico/correlação do clique anterior e validar uma operação somente em cenário de teste especificamente autorizado. Não repetir o último clique automaticamente.

Sem migration, Edge, alteração de assinatura/preço/plano/Auth/SMTP/RLS, publicação/deploy ou ativação de cobrança/NF-e/CT-e.

## Correção focal: plano não é reativação — 18:27 UTC

### Evidência fornecida pelo proprietário

REFIL INFORMATICA LTDA (organização `4e537fd6-4632-4c70-a782-386dba3e8f9f`, assinatura `e5bccb8f-0d66-42ce-9934-0740e0ee42ba`): Plano Base v1 `713b1a31-ed4c-48b6-b6e7-22ebd3ee1092` aplicado em 18:19:13Z, snapshot **59,90 BRL**, permaneceu **SUSPENDED**. Reaplicação em 18:24:22Z produziu histórico redundante SUSPENDED→SUSPENDED. Evidência do proprietário, não reconfirmada remotamente nesta rodada. Revisão independente das migrations locais confirma change_plan preservando situação e reactivate_manual SUSPENDED→ACTIVE.

**Causa UX:** ausência de resumo atual, ações indiferentes ao estado, rótulo sem distinguir plano de reativação e ausência de bloqueio da mesma versão. Backend preserva corretamente situação e não foi alterado.

### Implementação exclusivamente frontend

- Hooks existentes de assinatura/histórico aceitam filtro opcional organization_id, mantendo famílias de cache; Card usa consultas focais e assinatura corrente (exclui CANCELLED/EXPIRED). Resumo nome/versão/situação, loading/erro/sem assinatura/legada explícitos.
- Suspensa: reativar/cancelar/alterar plano; ativa: alterar plano/atraso/suspender/cancelar; atraso: alterar plano/suspender/cancelar; trial: alterar plano/cancelar/expirar somente vencido. Legada oferece só regularizar plano. Iniciar trial preservado apenas sem assinatura corrente nem trial prévio conhecido, com bloqueio conservador se leitura atingir 200 linhas. Backend soberano.
- Rótulos e aviso aprovados; reativar não tem seletor, envia versão null, exige motivo mínimo 5 caracteres. Mesma versão bloqueada no botão e handler sem RPC. Toast de plano suspenso orienta selecionar reativação, nunca encadeia duas RPCs.
- Após sucesso duas releituras precedem o novo resumo, prazo adicional 8s. Resumo antigo oculto e controles bloqueados durante leitura. Falha libera pendência, bloqueia nova escrita e oferece Atualizar consulta somente read-only. Timeout/reconciliação/chaves existentes preservados.
- Texto longo quebra no mobile; aria-live mantido e seletores bloqueados durante operação/refresh.

### Arquivos

`src/pages/plataforma/PlataformaGestao.tsx`, `src/hooks/usePlataformaSaaS.ts`, `src/lib/saas/subscriptionTransition.ts`, novo `src/test/saas/assinatura-card-status.test.tsx`, `AGENTS.md`, roadmap e relatório.

### Validação

| Contrato | Resultado |
|---|---|
| Base v1/Suspensa e mesma versão sem RPC | PASS Card renderizado com I/O fictício |
| Mudança suspensa/orientação/duas leituras antes do novo resumo | PASS unitário; não é prova RPC real |
| Reativar sem versão/motivo e matriz de seis situações | PASS |
| Trial vigente/sem prazo e barreira legada | PASS |
| Duplo clique e erro/reconsulta sem escrita extra | PASS |
| Novos testes Card/matriz | 13/13 PASS |
| Suíte SaaS incluindo timeout/correlação/hook | 458/458 PASS, 45 arquivos, 18:31 UTC |
| Lint focal, scanners segredos/fiscal, diff-check | PASS |
| Typecheck/build automáticos | PASS: build OK 18:31:03 UTC |
| UI/Auth reais desktop/mobile | NÃO EXECUTADO/BLOCKED; sessão externa real indisponível |

SHA observado após implementação/testes, antes de documentação: `3a28792218bd7651767442542960699ebdc66c1d`; commits automáticos.

**GO focal frontend testado; NO-GO homologação autenticada.** Gate manual: proprietário conferir resumo/ações/mesma versão bloqueada em sessão Platform Superadmin, sem envio. Não reativar ou reaplicar plano nesta rodada. Mudança concorrente entre leitura/clique ainda depende do backend. Limite 200 preservado por empresa, evitando truncagem global do resumo.

Sem consulta remota, alteração de dados reais, migration/Edge, RPC/RLS/preço/plano/versão, reativação automática, publicação/deploy ou ativação de cobrança/fiscal.
