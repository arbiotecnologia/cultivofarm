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