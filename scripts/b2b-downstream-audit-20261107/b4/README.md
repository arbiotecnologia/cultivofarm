# Reconciliação B4 útil sobre o B3 atual — revisão 458b6012

**INATIVO, BLOQUEADO E NÃO APROVADO.** Nenhuma operação hospedada, NF/cobrança/aprovação contábil real, envio, publicação ou subagente. B3 e os 63 testes anteriores não foram reabertos nem promovidos a E2E.

## Baseline e manifesto fail-closed

`generate-b4-review.py` recompõe o candidato histórico e gera `b4-object-manifest.json`, PRE/install/POST/rollback, pinos e hashes. O manifesto cobre **54 alterações**: funções novas/substituídas, tabelas/view/coluna, FK, constraints, índices, gatilhos, owners e ACLs. Novos objetos exigem ausência; substituições exigem corpo/owner/ACL capturados.

As substituições compartilhadas agora pinadas incluem:

- `public.rpc_register_receivable_payment(uuid,jsonb)`;
- `public.fn_generate_receivable_installments()`;
- `public.rpc_receivable_money_projection_v1(uuid,integer,integer)`;
- `public.fn_b2b_credit_exposure(uuid,numeric,uuid)`;
- `public.generate_b2b_receivable_secure_impl(uuid)`;
- `public.tg_auto_b2b_receivable()`;
- `ux_ar_one_active_per_b2b_order` e toda a metadata compartilhada de `accounts_receivable`: 35 colunas, 16 constraints, 13 índices, 9 gatilhos, RLS/owner/ACL;
- o gatilho dependente `zz_auto_generate_b2b_receivable`.

**Bloqueio atual:** não existe captura LIVE identificada de `rpc_receivable_money_projection_v1(uuid,integer,integer)`. Os corpos homônimos em `financial-price-generator-20261029` são candidatos antigos e não foram tratados como baseline. O PRE contém `B4_BASELINE_CAPTURE_REQUIRED`; portanto a instalação não pode sobrescrever essa função desconhecida. O auditor precisa capturar corpo, owner, ACL e assinatura LIVE antes de nova revisão.

O histórico tinha três definições de `platform_private.b2b_shared_receivable_credit_guard()`. O gerador usa a definição final efetiva e registra a duplicidade no manifesto; isso não foi ocultado.

## Instalação separada de operação

`02-install.sql.review` contém PRE + corpo + POST em uma transação, sem `GRANT`. Ele **não** substitui `platform_private.b2b_integration_dependencies` por stub. O corpo candidato real dessa dependência permanece sempre deny com `B2B_FISCAL_ATTESTATION_ACCOUNTING_UNPROVEN`.

Na bateria descartável, PRE e instalação falharam fechados e nenhum objeto B4 foi criado. Somente depois disso `b4-candidate.sql.review` foi executado isoladamente como **componente de laboratório**. O stub operacional foi aplicado exclusivamente no harness, após provar a negação real. Isso não é instalação, PRE/POST aprovado ou evidência de produção.

POST e rollback exigem a metadata íntegra. No schema reduzido do harness, o rollback falhou fechado sem revogação parcial e preservou títulos, alocações e snapshots.

## Evidências independentes — não somar

1. **42/42, exit 0 — manifesto estático:** `review-458b6012/evidence-manifest-tests.json` e `test-manifest.*`. Cobre inventário, pinos, owners/ACLs, schema, gatilhos, blocos DO, ausência de GRANT/stub, deny-only e determinismo.
2. **73/73, exit 0 — componente PostgreSQL descartável:** `review-458b6012/evidence-b4-shared-impact.json` e `test-shared.*`. Inclui o comportamento B4 e os novos impactos compartilhados; não é E2E.
3. **63/63 históricos:** preservados byte a byte em `review-458b6012/historical-63/`; não somados nem reclassificados.

## Impactos compartilhados medidos

- Título `MANUAL` não B2B sem devedor parceiro foi criado e gerou uma parcela pelo caminho existente.
- Título `MANUAL` não B2B com cliente vinculado a parceiro e crédito configurado também foi criado e recebeu `partner_id` pelo gatilho capturado.
- **Efeito fail-closed relevante:** esse título manual de parceiro, sem origem monetária B4 comprovada, fez `fn_b2b_credit_exposure` falhar com `MONEY_ORIGIN_UNPROVEN`. As duas fixtures manuais foram canceladas somente no banco descartável depois da medição. Não se deve liberar o pacote sem reconciliar projeção/origem de títulos manuais e o impacto operacional dessa negação.
- A projeção de um título legado sem origem conhecida permaneceu `MONEY_ORIGIN_UNPROVEN`, sem backfill.
- Pedido interno sintético foi negado pelo alocador com `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED` e pelo writer integral anterior, sem título/alocação. Gatilhos foram pausados apenas para montar a fixture e religados antes das chamadas.
- Cotação/pedido B3, parciais, replay, residual, baixa, substituição de centavos, concorrência, calendário e histórico passaram no componente. Isso não prova fluxo real.

## Pendências para o auditor

1. Capturar a baseline LIVE da projeção e reconferir todos os demais corpos/owners/ACLs, tabela/índices/gatilhos antes de instalação.
2. Revisar o efeito `MONEY_ORIGIN_UNPROVEN` sobre recebíveis manuais de parceiros e decidir uma reconciliação sem inventar origem/backfill ou abrir writers.
3. Revisar a duplicidade histórica do guard compartilhado e a mudança do índice único em dados reais, com preflight de duplicidades.
4. Manter instalação e ativação separadas; operação fiscal/contábil/recebível continua fechada.
5. JWT/RLS/Storage/PostgREST/browser, NF/cobrança reais e homologação continuam NOT_RUN.

Auth/GUC, schema reduzido, NF/contabilidade e adaptadores são sintéticos. Nenhum PASS local autoriza implantação.
