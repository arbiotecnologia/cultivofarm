# Decisão de 08/11/2026 — motor único de recebíveis após confirmação fiscal

**Estado: INATIVO / BLOQUEADO / NÃO APROVADO.** Este diretório documenta a decisão e mede a base existente. Não é um instalador, não autoriza operação fiscal/contábil e não cria um financeiro paralelo. Nenhuma consulta ou escrita hospedada foi feita nesta preparação.

## Decisão registrada

- ARBio gera título e parcelas somente após NF-e autorizada ou NFS-e emitida confirmada.
- Pedido aprovado é previsão/reserva de crédito. Entrega não gera outro título.
- O motor é único sobre as estruturas atuais; exceções manuais exigem autoridade, justificativa, origem e trilha.
- Criar título não emite boleto/Pix, não envia mensagem e não registra pagamento.
- Condições e snapshots aprovados são preservados; não foram adotados automaticamente 40%, 1,8%/2% ou 12 meses.
- Cinco títulos MANUAL de teste4 e todo o histórico ficam preservados, sem backfill ou reconciliação informal.

## Estruturas reutilizadas

O inventário completo, com MD5/ACL das capturas e hashes das fontes, está em `inventory.json`.

| Finalidade | Estruturas existentes |
|---|---|
| Origem fiscal | `fiscal_invoices`, `fiscal_invoice_items`, `fiscal_events`, `fiscal_idempotency_keys`, `fiscal_sefaz_transmissions`, `company_fiscal_settings` |
| Pedido e snapshots B3 | `partner_orders`, `partner_order_items`, `partner_order_payment_schedule`, `partner_order_financial_links` |
| Título e parcelas | `accounts_receivable`, `accounts_receivable_installments`, `fn_generate_receivable_installments` |
| Recebimentos e trilha | `receivable_payments`, `financial_receipts`, `financial_audit_log` |
| Base B4 candidata | `b2b_authorized_documents`, `b2b_document_allocations`, `b2b_allocation_reversals`, `b2b_title_permits`, `b2b_cancellation_attestations`, `accounts_receivable.b2b_document_id` |
| Alocação e crédito | `b2b_allocate_document`, `b2b_order_residual`, `b2b_credit_balances`, `fn_b2b_credit_exposure` e os guards privados já candidatos |

O candidato B4 reutiliza o gerador de parcelas por permissão transacional de título. A inserção do título mantém categoria ativa `RECEITA`, método ativo, tenant do ator, snapshot B3 e calendário selado. Não há um segundo gerador de parcelas.

## Writers e caminhos atuais

1. **`generate_b2b_receivable_secure` → `_impl` e `tg_auto_b2b_receivable`**: o caminho atual pode gerar por configuração em aprovação/produção/entrega. O candidato B4 já substitui o gatilho por no-op e o writer por `B2B_AUTHORIZED_FISCAL_DOCUMENT_REQUIRED`, sem apagar o histórico.
2. **`fn_generate_receivable_from_entrega`**: caminho A2 inativo. Não é reaberto; `delivery_no_downstream_20261030` e os dez gatilhos/ACL permanecem baseline imutável.
3. **`rpc_create_financial_title`**: writer manual genérico. Reutilizável apenas depois de um contrato de exceção com justificativa/origem/antiduplicidade. Não foi globalmente bloqueado nesta preparação porque também atende outros fluxos.
4. **`fn_generate_recurring_title`**: recorrência genérica, não evento B2B/NF. Precisa de delimitação de escopo antes de qualquer mudança global.
5. **`rpc_upsert_fiscal_invoice_manual`**: liga uma NF a um `receivable_id` já existente, direção oposta à regra principal. Não foi tratado como ponte pronta.
6. **`rpc_fiscal_invoice_apply_authorization_v1`**: fecha a NF autorizada e grava trilha, mas não chama o alocador nem cria recebível.
7. **`rpc_fiscal_sefaz_transmit_record_v1`**: preserva o retorno e registra `FISCAL_AUTHORIZATION_CLOSE_PENDING` quando o fechamento falha. Essa pendência é o ponto de recuperação a integrar, sem descartar a autorização.
8. **Cancelamentos**: `rpc_cancel_accounts_receivable` e `rpc_cancel_financial_installment` já exigem motivo e impedem cancelamento com recebimento ativo; a integração B4 mantém alocações/reversões append-only. `cancel_b2b_receivable_secure` permanece fechado.

## Matriz e evidência local

`matrix.json` tem doze requisitos. `test-decision.py` exige que cada item marcado como coberto aponte para um check realmente executado e mantém as lacunas como bloqueio.

A bateria B4 existente foi ampliada **sem alterar o SQL do candidato** com:

- duas sessões alocando exatamente o mesmo documento;
- falha sintética `AFTER INSERT` do título, rollback completo e retry;
- replay após recuperação;
- pedido aprovado sem dívida antes da alocação fiscal;
- ausência de boleto/Pix/pagamento ao criar o título.

Resultado em PostgreSQL 17 descartável: **128/128 checks**, exit 0. Inclui parcialidade, corrida de saldo, crédito sem dupla contagem, cancelamento pago, histórico, dez gatilhos/ACL, fence de entrega e rollback deny-only. O manifesto do candidato regenerado com a baseline real passou **61/61**.

Esses resultados são **prova de componente com atestações fiscais sintéticas**. Não são somados a execuções históricas e não certificam a ponte fiscal real.

A suíte geral `bun run test` também foi iniciada, mas excedeu o limite de dez minutos do ambiente e não produziu resumo final; o log parcial está preservado em `evidence/vitest.txt` e não é contado como PASS. Os oito arquivos que falharam nessa execução foram repetidos com um worker e passaram **8 arquivos/150 testes, exit 0** (`evidence/vitest-focused.*`); `envasePageReadOnly` também passou isolado 2/2. Isso caracteriza problema de execução concorrente/recursos, sem declarar a suíte geral aprovada. O build automático da prévia permaneceu `build OK`.

## Ponte fiscal mínima preparada

`service-bridge/` contém agora um candidato separado, inativo e não aprovado, gerado das fontes B4/H12 pinadas. A execução final no PostgreSQL descartável passou **149/149**, incluindo regressão B4 e 21 checks da ponte na mesma rodada: pendente/rejeitado sem título, autorização, falha pós-título/retry, replay concorrente, parcialidade, tenant estrangeiro, origem service-only sem ator inventado e rollback deny-only. Candidato SHA256 `b43550403d368b68e897de11778a142b09a4f142ba0d6646fb9a35d0ed6ae4c9`. Detalhes e tentativas estão no README/evidências do subdiretório.

## Lacunas que continuam bloqueando

- **G1/G2 — ponte candidata, não instalada:** a autorização `fiscal_invoices`→B4 e o permit service-only foram exercitados localmente; não há integração real nem autorização de instalação.
- **G3 — estados/recuperação reais:** pendente, rejeitado, autorizado e retry foram simulados; `FISCAL_AUTHORIZATION_CLOSE_PENDING`/H13, NFS-e e provedor real permanecem NOT_RUN.
- **G4 — exceção manual:** faltam justificativa e origem explícitas e antiduplicidade por operação faturada.
- **G5 — direção manual:** o writer fiscal atual parte do título, não da confirmação fiscal.
- **G6 — homologação:** JWT/RLS/Storage/browser, callback concorrente e sessões reais ARBio/FSF permanecem `NOT_RUN`.

O SQL da ponte é somente candidato de revisão, não instalável sem autorização específica. O callback service-only, o alocador e seus guards foram preservados; testes sintéticos não concedem autoridade fiscal nem liberam exceção manual.

## Ordem de liberação

1. Corrigir e revisar independentemente o isolamento dos planos comerciais.
2. Revisar a logística e a composição financeiro/física.
3. Revisar uma ponte fiscal mínima e os contratos de exceção manual.
4. Só depois de instalação manual autorizada, executar homologação real separada. Nenhum provedor fiscal/bancário, envio ou cobrança é liberado por estes testes.
