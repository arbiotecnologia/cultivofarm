# Correção local contexto catálogo —23/10/2026

## Causa reproduzida, não hipótese HMR
`App.tsx:510–519` intercala o `EntitlementOutlet` entre o Outlet do layout parceiro e NovoPedido. O layout fornece `{partner}`, mas o Outlet intermediário sem `context` substitui por undefined. NovoPedido destructura partner na linha110 e lança. Teste com MemoryRouter/Routes/Outlet/EntitlementOutlet reais e consumidor independente reproduziu exatamente a exceção antes (1 FAIL/2 PASS). Sem sessão, HMR ou banco.

Correção mínima `src/components/guards/EntitlementOutlet.tsx`: capturar e encaminhar o **mesmo objeto** do contexto pai somente depois do gate de plano existente. Sem fallback/fabricação de parceiro, sem montar leitores quando pendente/negado, sem alterar rota/roles/RPC/hooks de pedidos ou fiscal. Resolve também os demais consumidores desse Outlet intermediário sem criar provider paralelo.

## Evidência
- `src/test/catalogo/partnerOutletContext.test.tsx`:3/3 PASS; igualdade referencial contexto e zero mounts de leitores para plano negado/pendente.
- Com ownerOrderAccess:6/6 PASS22:58.
- Suíte ampliada:25 PASS/2 FAIL. Falhas filtro na troca role (rota sem-permissao sem retorno no teste) e mapeamento contas_receber repetidas com o gate anterior em alias isolado `/tmp/partner-outlet-baseline/`:19 PASS/2 FAIL. Não atribuir a este patch nem corrigir fora do escopo.
- Monitor de build22:57:44 OK; nenhum build/typecheck manual executado. Não afirmar homologação UI real ou recuperação da aba já capturada pelo ErrorBoundary.
- Logs runtime/console não disponíveis nesta rodada; sem clicar Retry, reload, navegar/restaurar sessão ou alterar autenticação do proprietário. Reprodução é de providers reais com transporte não usado, não JWT/RLS hosted.

## Implantação
`applied/c2_owner_orders_p1_composed.md` registra execução Codex relatada; snapshots/baseline e SQL antigo preservados. Frontend publicado f351 segundo proprietário, nenhuma publicação desta correção pelo agente. Após publicação autorizada futura, homologação pós em sessões reais e pendências anteriores continuam obrigatórias; nenhum pedido/título criado pelo agente.