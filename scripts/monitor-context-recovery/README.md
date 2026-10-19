# Consulta técnica incerta não é negativa — revisão frontend

Base fixa: `2f95d5be6dd27834e69bfc9155540a04b0a6e914`. Apenas frontend/testes; nenhum SQL, grant, cliente paralelo, monitor, assinatura, receivables ou lote alterado.

## Correção
- AppPortalGuard, MobileLayout e guardas técnicas filhas ocultam conteúdo em consulta pendente/refetch/erro. Só resposta canônica explícita `has_technical_access=false` nega. Não há navegação para gestor por latência.
- Estado indisponível reutiliza `revalidateAuthz` do botão canônico: releitura fresca, single-flight, epoch, descarte de cache/Blobs e probe do provider publicado. Fora do monitor, a query existente é reconsultada; nenhuma autorização por papel/cache.
- `requireFresh` só nos leitores técnicos; outros portais preservam o contrato de exposição de dados durante refetch. Mesmas query keys por identidade/perfil/tenant/papéis/epoch, sem cache global novo.
- Payload ausente/malformado vira indisponibilidade, não negativa. Deadline de transporte 15 s por tentativa + retry já existente de 1; abort, fence de geração/epoch e check monotônico antes da adoção. Deadline da query não estende lease do monitor.
- Guardas técnicas e MobileLayout propagam uma política de frescor somente aos descendentes, via `src/lib/portalContextFreshness.ts`. Assim leitores default de MobilePerfil, useSwitchPortal e menus aninhados não iniciam refetch ao remontar. Não contém grants, payload, tenant ou autoridade; foco/invalidação/refetch explícito permanecem. Fora dessa árvore o default `refetchOnMount=true` permanece.

## Revisão bloqueante 22:02 — substitui o aceite anterior
- A revisão independente de 5ebeca apontou ciclo não coberto pelos sete testes anteriores, cujos filhos eram spans. Reproduzido localmente com leitor default real e MobilePerfil real: **11 consultas em 12 s / transporte 500 ms**, dois novos testes falhando antes da correção. A evidência 302/302 anterior não cobria esse caso e não autoriza publicação.
- Auditoria de consumidores: MobilePerfil chama useAvailableContexts e useSwitchPortal (que também chama o hook default); PortalTopBar/UserMenu e guardas técnicas filhas também herdam a política quando aninhados. B2BRouteGuard, PortalParceiroLayout, SelecionarPortal, AcessoPendente, SemPermissao e UserMenu fora da árvore técnica mantêm defaults. Nenhuma página/rota/permissão nova, monitor ou lease alterado.
- Integração usa AuthProvider/query/AppPortalGuard/MobileLayout reais e **MobilePerfil + useSwitchPortal reais**, além de filho default real; apenas transporte, eventos e widgets periféricos são fake (push permanece indisponível). Verifica menos de cinco chamadas por janela de 12 s na carga, no foco e na mudança de epoch; conteúdo oculto durante pendência, retorno estável no mesmo endereço. Negativa explícita, erro, timeout e revogação seguem os testes anteriores.
- Typechecks app/node independentes ainda sem recibo deste delta; não confundir build automático com typecheck. Homologação autenticada real não executada. Banco, monitor, lease e publicação intocados.

## Evidências locais
- Reproduzidos na baseline: erro após invalidação redireciona indevidamente; erro inicial redireciona; contexts sem resposta impede Retry operativo. Nenhum diagnóstico de causa de banco/rede.
- 302/302 Vitest, 12 arquivos: AuthProvider/monitor/probe/guardas/query reais com transporte fake, timeout/renovação, contexts pending→valid/erro→valid/negativo, ambos os subsets, late epoch, zero/malformed payload, deadline sem rerender, isolamento de tenant/identidade nos testes de escopo existentes.
- São testes sintéticos, não homologação JWT/RLS real. Fonte de monitor/probe/gates inalterada em relação à base.
- Build automático registrado OK. Typechecks app/node não executados manualmente neste ambiente (harness automático); revisão independente deve executar `tsgo -p tsconfig.app.json --noEmit` e `tsgo -p tsconfig.node.json --noEmit` e registrar recibos.
- O harness detectou inferência literal `true` no novo mock; assinatura explícita `boolean` corrigida, build subsequente OK e 21/21 testes focais reexecutados. Não confundir build OK com recibos separados app/node.
- Smoke público Playwright: `/app` permaneceu em tela vazia após 2,5 s, sem pageerror; não confirmou login nem fluxo autenticado. Não apresentado como validação funcional real.

## Revisão e rollback
1. `python3 scripts/monitor-context-recovery/rollback.py` verifica todos os hashes, sem alterar arquivos.
2. Revisar `frontend.patch`, `manifest.json`, testes e delta contra base fixa. Publicação exclusiva após revisão do proprietário; nenhum passo publica automaticamente.
3. Rollback local explícito: `python3 scripts/monitor-context-recovery/rollback.py --apply`. Valida TODOS os arquivos antes de escrever; restaura bytes fixos e remove só arquivos novos deste pacote. Reverter documentação/roadmap separadamente se desejado. Não reaplicar nenhum SQL.

## Limites e infraestrutura
Evidência independente informada: gateway v2 448 calls/52 >3 s/p95 7151 ms/max39453; v1 977/0 >3 s/p95 429/max2779; upstream v2 max484 ms. Correção de UI NÃO resolve latência externa, não força versões/headers e não infere causa. Lease15s, piso7.5s, bounded loader20s e orçamento automático publicado intactos. Sessões suspensas/rede lenta continuam podendo pausar corretamente; respostas vencidas não são aceitas.
Homologação real sem reload requer sessões A/B e publicação independente. Neste ambiente `external_unmanaged` impede restauração gerenciada; não há prova autenticada real desta candidata. Contratos/novos portais/anexos novos permanecem bloqueados.
