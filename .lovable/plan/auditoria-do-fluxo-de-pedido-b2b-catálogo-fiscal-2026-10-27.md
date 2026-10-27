# Auditoria do fluxo de pedido B2B (catálogo → fiscal)

## Objetivo
Verificar, etapa por etapa, se as 13 etapas do diagrama funcionam na interface e no servidor, e entregar um relatório honesto: o que funciona, o que está bloqueado de propósito e o que está quebrado.

## Regras da auditoria
- Somente leitura no Supabase canônico `swzpzcwiasxmjutrmvkm` (ref conferido antes de qualquer consulta).
- Sem SQL que grave, sem publicar, sem criar/alterar fixtures, papéis, sessões ou dados reais.
- Testes de banco apenas em PostgreSQL descartável, com Auth sintética, sempre identificados como sintéticos (não equivalem a JWT/RLS real).
- Etapas contidas (gravação de pedido C2, contabilidade real, cobrança na entrega, NF real, envios) são verificadas como "fechadas corretamente", não forçadas a abrir.
- Contabilidade real e SU-518022 continuam pendentes.

## Etapas
1. **Inventário**: para cada etapa do diagrama, mapear telas, rotas, guards, hooks e RPCs/tabelas/policies reais usadas (leitura de código + catálogo LIVE: hashes, ACL, RLS, gatilhos).
2. **Frontend**: rodar as suítes vitest existentes de catálogo, simulador, carrinho, pedidos, comercial, financeiro, produção/lote/CQ/envase, entrega e fiscal; comparar falhas com a base para separar regressão de falha pré-existente.
3. **Navegação real local**: Playwright na prévia local com a sessão disponível, abrindo cada tela do fluxo (parceiro, comercial, financeiro, produção, entrega, fiscal) e registrando carregamento, bloqueios e erros de console/rede. Sem clicar em ações que gravem.
4. **Backend**: conferir por leitura que cada transição de status tem RPC canônica, CAS/idempotência, isolamento por empresa e ACL mínima; apontar escritas diretas ainda abertas.
5. **Continuidade entre etapas**: verificar se a saída de uma etapa é a entrada válida da seguinte (pedido aprovado → OS → lote → CQ → envase → entrega → título/fiscal) e se os snapshots de preço se mantêm.
6. **Relatório (PDF em Files)**: tabela por etapa com status Funciona / Contido por decisão / Falha / Não verificável, evidência e risco; lista de correções propostas, sem aplicá-las.

## Limites declarados no relatório
- Sem sessões reais A/B, não há homologação JWT/RLS real; o relatório dirá isso.
- Ações que gravam não serão executadas; para elas a prova será teste sintético ou revisão de código.

## Resultado
Relatório com o diagnóstico por etapa e um plano de correção priorizado para sua aprovação.
