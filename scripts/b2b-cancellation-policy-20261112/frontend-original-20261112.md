# Frontend original — 12/11/2026 02:54 UTC

## Resultado

O banco original recebeu diagnóstico econômico, sequência e cancelamento fechado com POST OK **conforme relato do proprietário**, sem conferência remota pelo agente.

O painel econômico já estava em `/comercial/solicitacoes-b2b` (extra do DetalhePedidoDrawer) e em SellerFinanceOrderReview. **Faltava em `/comercial/pedidos-b2b`**, a carteira canônica; agora é montado no diálogo do pedido contábil pendente, com duas aprovações independentes e previsão única confirmada pelo servidor.

## Arquivos

- `src/pages/comercial/PedidosB2B.tsx`: montagem no detalhe da carteira original.
- `src/components/pedidos-b2b/C2PilotEconomicApproval.tsx`: duas decisões no mesmo painel, actions somente com can_approve_* server-side, forecast só com duas aprovações distintas e mesma evidência; mantém endpoint existente, gate e autoridade server-side.
- `src/hooks/useC2PilotEconomicApproval.ts`: parser recusa previsão com aprovação faltante/duplicada/evidência trocada; invalida releitura econômica após decisão, sem retry automático.
- `src/hooks/useOrderEconomicDiagnosis.ts`: uma leitura do overload instalado `fn_fiscal_invoice_eligibility(_source_type=PARTNER_ORDER,_source_id=pedido)`, cliente canônico, abort/scope fences, sem fallback; exige orderId exato.
- `src/lib/fiscal/orderEconomicStatus.ts`: conclusão exige available=true e duas aprovações explícitas; mensagem de pendência exige também eligible=false e operational_blocked=true. Não modifica eligible/reasons.
- `src/components/pedidos/AccountingPendingNotice.tsx` e `src/components/pedidos-b2b/SellerFinanceOrderReview.tsx`: se aplicável, texto “Aprovações comercial e de crédito concluídas. Liberação operacional para faturamento pendente.” substitui mensagem enganosa; ausência/negação não inventa aprovação nem pendência econômica.

Rotas não alteradas: `/comercial/pedidos-b2b`, `/comercial/solicitacoes-b2b`; Financeiro mantém revisão financeira e `/financeiro/contas-receber`. Cancelamento candidato de revisão **não foi promovido/montado** no runtime; instalação fechada não autoriza seu writer. Nenhum gate, ACL, papel, SQL, emissão, envio ou cobrança foi habilitado.

## Testes novos desta rodada

**92/92 em dez arquivos Vitest**, transporte/identidade sintéticos sem chamadas hospedadas:

- abertura da carteira real renderiza componente real, dois autores/papéis e previsão R$20; somente dois leitores existentes;
- Financeiro despacha apenas crédito, concessão Comercial apenas comercial, outros sem ação; negativa de pedido/tenant e diagnóstico indisponível falham fechados;
- previsão exige duas aprovações distintas e mesma evidência; duplicatas e previsão com apenas uma aprovação negadas;
- combinações 00/01/10/11 mantêm eligible/reasons e bloqueio operacional independentes;
- revisão Financeiro, motivo obrigatório, CAS/conflito sem retry, termos congelados, consulta e tenant fences da reconciliação;
- parcial sintética R$1 em título R$20 deixa saldo R$19; não cancela nem estorna por inferência;
- confirmação fiscal genérica não promete cancelamento final; financeiro com pagamento exige reconciliação; fiscal indisponível não reemite cobrança.

Playwright em desktop e mobile: componentes reais renderizados em harness de **transporte integralmente simulado**, sem requests externos. Confirmou dois eixos, previsão única e zero botões sem concessão. Não valida rota autenticada, CSS final do app nem JWT/RLS/Storage. Teste Vitest usa a página PedidosB2B real para confirmar montagem da carteira.

Build/typecheck automático mais recente: **build OK** após correção de tipagem do overload. Não executados manualmente conforme regra do ambiente.

## Limites e evidência histórica

PB-001042 **não foi lido nem alterado**: sessão autenticada indisponível neste Supabase externo (`external_unmanaged`). Não solicitar credenciais nem tomar mocks como sessão real. A confirmação atual do pedido, concessões e economicDiagnosis LIVE permanece **NÃO VERIFICADA**.

Tentativa de repetir a bateria PostgreSQL não executou testes: `/tmp/r12`, `/tmp/felig` e `/tmp/c2neg` foram removidos na pausa do sandbox. Evidências locais anteriores permanecem em `final-production/evidence/`: 37 integração, 49 determinísticos, 18 roundtrip e 17 controles; pagamento R$1 por RPC/callback/reconciliação documentado em `original-harness/attempt-001/checks.json`. **Históricas, não novas execuções nem prova de PB-001042**. Arquivos/pins anteriores não foram regenerados nesta tarefa.

O frontend público requer **publicação posterior** para receber estes ajustes; não foi publicada nesta rodada. POST SQL por si só não atualiza o bundle público.