# Concorrência e negativas — revisão 24/10 00:47

Continuação solicitada de `dc990cd1751b7e3cf898b4999b279434ff03bb9a`. Auditor informa numeric LIVE e PRE estrutural origin-rebase hosted PASS; não foram repetidos pelo Lovable. Contabilidade A permanece DRAFT e writer false. Hash correto de crédito: `213ac31f3a30816ead75365b0d1fed18`.

## Execução local

`bun run test src/test/saas/c2-order-concurrency-postgres.test.ts`: **1/1 PASS, 150 checks completos, 77.99s** (última execução às00:56 UTC). Os 123 checks anteriores são reutilizados integralmente, acrescidos de 27 checks. PostgreSQL descartável, Auth sintética, schema reduzido e 44 triggers/corpos canônicos capturados; não é homologação JWT/PostgREST hosted.

Dois processos psql independentes e transações READ COMMITTED. A primeira chamada mantém sua transação sem commit; a segunda é observada em `pg_stat_activity` com espera `Lock` antes da liberação. Timeouts limitam bloqueios. Para duas gerações negadas pré-entrega, terceira conexão local mantém somente o advisory lock já usado pelo wrapper e comprova os dois geradores esperando. Não cria ticket nem altera regras/trigger. Isso prova sobreposição real de transações, não todas as ordens possíveis ou stress prolongado.

## Resultados concretos

- Create simultâneo mesma chave: resultados/ID idênticos, exatamente +1 pedido/+1 receipt; um item, um termo e três parcelas de cronograma.
- Mesma chave e observação diferente: segunda chamada `idempotency_conflict`, exatamente +1 pedido.
- Duas aprovações `na_entrega`: primeira aprova, segunda `already_processed`; aprovado/readyfalse/receivablefalse, nenhum título.
- Aprovação versus geração `na_entrega`: geração `C2_EXTERNAL_DELIVERY_REQUIRED`, nenhum título/link.
- Duas gerações pré-entrega: ambas `C2_EXTERNAL_DELIVERY_REQUIRED`, snapshot completo unchanged.
- Cenário SEPARADO suportado `na_aprovacao`, exclusivamente settings fictícios locais: aprovação versus geração cria exatamente um título/três installments/um link.
- Duas primeiras gerações `na_aprovacao`, após aprovação com auto=false e zero títulos comprovados: exatamente um título/três installments/um link. Não equivale a pós-entrega.
- Replay concorrente: nenhuma duplicação financeira; dois logs canônicos `financeiro_duplicidade_bloqueada` são esperados. O primeiro teste excessivamente estrito (zero logs) falhou por essa auditoria existente; não é falha do SQL e nenhum SQL foi alterado.
- Quatro creates cross-tenant A/B negados; oito aprovações/gerações por B/técnico/produtor negadas sem efeitos.
- Retirar técnico de cumulativo preserva create gestor; retirar gestor mantém role técnico mas nega create e replay do próprio receipt anterior; revogar vínculo bloqueia cumulativo. Isso não certifica funcionalidades do portal técnico residual.
- Crédito mantém hash LIVE; contenção final conserva snapshots e nega operações externas.

## Arquivos

Relativos a `scripts/owner-orders-20261023/credit-numeric-20261024/`:

- `concurrency-checks.py`: cenários e duas conexões.
- `test-concurrency.py`: extensão do harness completo sem editar baselines/harness históricos.
- `concurrency-review.md`: resultados/limites.
- `origin-rebase/{preflight.sql,candidate.sql.review,postflight.sql,rollback.sql.review}`: já preparados para o hash LIVE; comparação byte-exata permanece no harness. Nenhuma mudança SQL nesta revisão.
- Teste integrado: `src/test/saas/c2-order-concurrency-postgres.test.ts`.
- Manifestos local/pai atualizados somente para arquivos alterados/novos.

## Impedimentos / NO-GO mantido

1. Pré-requisito contábil humano A DRAFT/atestado ausente; não validar nem inventar configuração real.
2. `na_entrega` pós-entrega não suportado neste recorte: transições em_producao/entregue continuam `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED` no harness completo. Nenhum sucesso foi simulado nem trigger alterado.
3. JWT/RLS/PostgREST real da cadeia financeira, concorrência em produção e outras ordens de interleaving não certificados.
4. Revisão independente/quiescência antes de qualquer implantação/contenção. Writer permanece false; revisão não é autorização de reabertura.

Nenhuma falha funcional SQL demonstrada nesta matriz exigiu variante corretiva. Sem SQL hospedado, frontend/publicação, alteração de sessões/dados/papéis reais. Somente testes/relatórios locais; baseline aritmético antigo nunca reaplicado à produção.