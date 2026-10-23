# Correção local contexto catálogo —23/10/2026

## Causa reproduzida, não hipótese HMR
`App.tsx:510–519` intercala o `EntitlementOutlet` entre o Outlet do layout parceiro e NovoPedido. O layout fornece `{partner}`, mas o Outlet intermediário sem `context` substitui por undefined. NovoPedido destructura partner na linha110 e lança. Teste com MemoryRouter/Routes/Outlet/EntitlementOutlet reais e consumidor independente reproduziu exatamente a exceção antes (1 FAIL/2 PASS). Sem sessão, HMR ou banco.

Correção mínima `src/components/guards/EntitlementOutlet.tsx`: capturar e encaminhar o **mesmo objeto** do contexto pai somente depois do gate de plano existente. Sem fallback/fabricação de parceiro, sem montar leitores quando pendente/negado, sem alterar rota/roles/RPC/hooks de pedidos ou fiscal. Resolve também os demais consumidores desse Outlet intermediário sem criar provider paralelo.

## Evidência
- Complemento23:00: `partnerOutletContext.test.tsx` **5/5 PASS** com MemoryRouter/Routes/Outlet/EntitlementOutlet reais e QueryClient real. Consumidor independente destructura o contexto recebido; nenhum mock de NovoPedido/hooks de pedidos. Trocas parceiro e tenant encaminham o objeto atual, sem resultado anterior; negação na troca desmonta leitores antes de qualquer consulta nova. QueryFn local instrumentada: não é transporte/Supabase real nem prova de revogação servidor.
- Build monitor23:00:02 OK. Nenhum typecheck/build manual nesta rodada (harness automático); não declarar typecheck independente. O comando incluiu um caminho inexistente ownerOrderAccess.test.ts e executou somente o arquivo de contexto (5 testes), não uma regressão adicional.
- Patch isolado da correção e testes: `catalog-outlet-fix.patch`; integridade: `catalog-outlet-fix.sha256`. Sem reedição do gate já corrigido na rodada anterior.
- `src/test/catalogo/partnerOutletContext.test.tsx`:3/3 PASS; igualdade referencial contexto e zero mounts de leitores para plano negado/pendente.
- Com ownerOrderAccess:6/6 PASS22:58.
- Suíte ampliada:25 PASS/2 FAIL. Falhas filtro na troca role (rota sem-permissao sem retorno no teste) e mapeamento contas_receber repetidas com o gate anterior em alias isolado `/tmp/partner-outlet-baseline/`:19 PASS/2 FAIL. Não atribuir a este patch nem corrigir fora do escopo.
- Monitor de build22:57:44 OK; nenhum build/typecheck manual executado. Não afirmar homologação UI real ou recuperação da aba já capturada pelo ErrorBoundary.
- Logs runtime/console não disponíveis nesta rodada; sem clicar Retry, reload, navegar/restaurar sessão ou alterar autenticação do proprietário. Reprodução é de providers reais com transporte não usado, não JWT/RLS hosted.

## Implantação
Estado mais recente: contenção independente `c2_owner_orders_writer_containment` SUCCESS relatada23/10 22:58, create_allowed SELECT false e eligibility authenticated=false. Financeiro/approval preservados. Ver `applied/c2_owner_orders_writer_containment.md`. POST esperado do release anterior diverge intencionalmente; não reparar/reaplicar/reabrir. Retry setState sem reload repetiu erro antes rollback, conforme proprietário, sem tentativa pelo agente. Recuperação da aba real e publicação autorizada/revisão continuam pendentes.
`applied/c2_owner_orders_p1_composed.md` registra execução Codex relatada; snapshots/baseline e SQL antigo preservados. Frontend publicado f351 segundo proprietário, nenhuma publicação desta correção pelo agente. Após publicação autorizada futura, homologação pós em sessões reais e pendências anteriores continuam obrigatórias; nenhum pedido/título criado pelo agente.