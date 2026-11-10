# Leitor tenant de previsão de receita B2B — candidato REVIEW_ONLY_INACTIVE_NOT_APPROVED

Ordem: `01-pre.sql.readonly` → `02-install.sql.review` → `03-post.sql.readonly`; rollback `04-rollback-deny.sql.review`.
Gerados por `build_and_test.py` a partir de `reader.sql`; pins de dependências copiados do estágio 14 (projeção instalada).
Evidência: `evidence/disposable-pg-run.json` (24/24, PostgreSQL descartável, stubs sintéticos).

## Contrato `B2B_REVENUE_FORECAST_TENANT_V1`
- Autorização: `auth.uid()`, `h15_actor_organization()`, `is_financial_staff` (admin/gestor/financeiro canônico), features `contas_receber` e `pedidos_b2b`; filtro de parceiro só da própria empresa.
- `forecast_residual`: soma de `residual_amount` da previsão privada da empresa em estados vivos; `enforceable=false`.
- `confirmed_titles`: parcelas abertas de títulos `B2B_ORDER` não cancelados, por faixa de vencimento.
- `legacy_unproven_orders`: contagem, nunca valor.
- Legado `rpc_b2b_revenue_forecast` intocado (sem regrant).

## Inventário: lacunas para teste real de entregas parciais (referência sintética)
Estado observado pelo proprietário: `/entregas` com operação indisponível e única entrega teste cancelada. Nada foi desbloqueado.
1. Contrato atômico de confirmação de entrega parcial ainda sem prova hospedada; contenção zero-dispatch permanece (sem primeira mutação).
2. Referência sintética dedicada ARBio (pedido/lote/reserva) inexistente: a única entrega teste está cancelada e não pode ser reaproveitada; fixtures proibidas (`d7edc250…`, lote `5fa6d35b…`, OS `c909c862…`) não podem ser usadas.
3. Capacidades separadas exigidas e ainda fechadas: grupo/cancelamento, envase, comprovantes (formulário/assinatura/anexo) e cancelamento de etiquetas.
4. Reserva com divisão (UUID dividido) e falhas parciais multi-requisição: só provadas localmente; sem prova JWT/RLS/Storage real.
5. Ligação entrega → NF parcial → título: depende do fiscal (pendente); `delivery_no_downstream` impede efeitos financeiros — previsão residual só cai por NF autorizada, nunca pela entrega.
6. Contabilidade, produção, cobrança e comunicação permanecem fechadas; nenhum teste real deve abri-las.
7. Necessário para o teste real: concessão exata curta ARBio da capacidade de entrega, sessão real A/B, roteiro de leitura PRE e prova de que nenhum título/NF é criado pela entrega.
