# Acesso ao pedido canônico — revisão local 24/10/2026

## Causas confirmadas no código atual

- Parceiro: `PortalParceiroLayout` substitui o Outlet de `NovoPedido` por `OwnerCatalog` quando o cliente comercial tem leitura autorizada, mas não `orderCreate`. O catálogo de consulta não possui ação de carrinho. É uma contenção deliberada, não um botão de compra perdido. Não foi removida.
- No dashboard do cliente comercial, o menu e o acompanhamento não explicavam claramente onde se inicia a compra e por que ela podia estar indisponível.
- Comercial: `/comercial/pedidos-b2b` monta análise/aprovação; `/comercial/solicitacoes-b2b` monta consulta de pedidos/simulações. `/comercial/catalogo` é alias de `/base-tecnica?tab=catalogo-tecnico`. Nenhuma dessas telas oferece um formulário canônico de nova venda em nome do cliente. Não foi inventado esse formulário nem usada visualização interna de parceiro como autorização de compra.
- O sucesso de aprovação comercial prometia produção sem verificar prontidão. A mensagem agora confirma apenas aprovação comercial.

## Alterações locais

| Arquivo | Alteração |
| --- | --- |
| `src/pages/portal-parceiro/PortalParceiroLayout.tsx` | Entrada contextual em dashboard/catálogo para gestor externo; reutiliza as capacidades, vínculo e entitlements existentes, sem alterar gates. |
| `src/components/comercial/PartnerOrderEntry.tsx` | Compra própria; link canônico para catálogo, ação de novo pedido só com criação autorizada, consulta quando contido, detalhes sem inventar motivo contábil. Loading não oferece link. |
| `src/pages/portal-parceiro/NovoPedido.tsx` | Ação explícita “Adicionar ao pedido”, distinta da simulação; título e contexto de compra próprios. Carrinho, preço/hash, simulação e RPC de criação intactos. |
| `src/pages/comercial/PedidosB2B.tsx` | Distingue início de venda indisponível de análise; remove promessa automática de produção no sucesso de aprovação. |
| `src/components/comercial/CommercialOrderEntry.tsx` | Expõe pendência de fluxo comercial autorizado; não cria botão falso nem link para impersonação de comprador. |
| `src/components/comercial/OrderJourney.tsx` | Percurso condicionado pedido/aprovação/financeiro/fiscal/entrega, apenas informativo, sem novos leitores ou comandos. |
| `src/test/comercial/orderEntry.test.tsx` | Loading/negação, ausência de writer comercial inventado, contrato de catálogo insuficiente, técnico sem autoridade financeira. |
| `src/test/catalogo/partnerOutletNovoPedido.test.tsx` | Cadeia real de guard/layout/Outlet/NovoPedido com transporte sintético: criação false/revogada, links canônicos, troca A/B e projeção de tenant estrangeiro negada. |
| `src/test/catalogo/partnerCatalogMonitor.integration.test.tsx` | Atualiza seletor da ação explícita mantendo regressões reais do monitor/carrinho com SDK sintético. |
| `src/test/catalogo/ownerCatalogFilters.session.test.tsx` | Após revogação/redirecionamento, teste retorna explicitamente ao catálogo; reativação não navega automaticamente. |
| `AGENTS.md`, `roadmap.md` | Regra de arquitetura e pendências do recorte. |

## Evidência

Comando focal: `bun run test src/test/comercial/orderEntry.test.tsx src/test/comercial/ownerOrderAccess.test.ts src/test/catalogo/partnerOutletNovoPedido.test.tsx src/test/catalogo/ownerCatalogFilters.session.test.tsx src/test/catalogo/partnerCatalogMonitor.integration.test.tsx`.

**45/45 testes, cinco arquivos, PASS**. Inclui monitor/AuthProvider, guard, layout, query cache, rotas e carrinho reais em ambiente DOM local, com respostas e identidade sintéticas. As quatro verificações do componente de entrada são focais; não substituem integração autenticada da página comercial inteira. Avisos React Router v7 e rota negativa sem tela no fixture de filtros não são falhas de teste.

Build automático observado: `build OK` em 24/10/2026 14:10:10 UTC. Build/typecheck manuais não executados conforme regras do ambiente; não atribuir certificação de produção ou recibo independente de tipagem.

Candidate SQL preservado byte-exato em relação a `b5e4acbf51576db1a9a0e1489138f45c9b619f8e`: SHA256 `0d69b27b43066fc6f57526177f9338d820ea5ac4608faadce078c57dbfb057aa`.

## Limites e pendências

- Sem SQL hosted, migrations, publicação, sessões reais, pedidos, cobrança, emissão fiscal ou entrega. Sem mudanças de roles/RLS/RPC/capacidade/lease ou liberação do writer.
- `orderCreate=false` continua sem montar `NovoPedido`, planos de pagamento, assinaturas ou carrinho; a nova entrada não abre criação funcional.
- Motivo específico de bloqueio não vem no contrato atual. A tela não deduz contabilidade de uma capacidade false, não revela configurações de outra empresa nem consulta novos diagnósticos privilegiados.
- Validação contábil real de A continua pendente. O pacote composto permanece inativo; catálogo autorizado não dispensa esse gate.
- Início de venda pelo comercial exige um contrato/fluxo autorizado ainda ausente nas telas auditadas; deliberadamente não implementado como compra própria.
- Homologação autenticada visual desktop/mobile, JWT/RLS A/B e percurso completo aguardam revisão e autorização independente. Nenhuma sessão real ou prova hospedada foi simulada. Dívidas históricas não foram encerradas.