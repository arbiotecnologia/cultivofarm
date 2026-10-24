# Complemento create versus approve — 24/10 00:58

Achado independente informado: para fixture hospedada A, create=6409308924409657986, approve=1059961474, same_lock=false. Não repetimos consulta hospedada. Divergência das expressões foi confirmada também para o parceiro sintético local.

## Resultado e interpretação

Dois processos/conexões PostgreSQL reais, READ COMMITTED, corpos completos capturados, Auth sintética e schema reduzido. O job anterior foi preservado e recebeu oito checks novos: **158 checks** no total.

- Create mantém transação sem commit; approve concorrente espera advisory lock e conclui depois do commit, sem deadlock/nenhum título pré-entrega.
- Approve mantém transação sem commit; create concorrente espera advisory lock e conclui depois do commit, sem deadlock/nenhum título pré-entrega.
- O motivo é `tg_partner_orders_credit_guard`: no UPDATE de status para aprovado, adquire `hashtextextended('b2b_credit:' || NEW.partner_id::text,0)`, igual ao create. O `hashtext` explícito de approve continua diferente, mas não é o único lock efetivo.
- A hipótese inicial de approve concluir durante o hold de create **falhou**: diagnóstico mostrou create=PgSleep/approve=advisory. Não removemos trigger para fabricar uma falha. Nenhuma variante SQL corretiva foi produzida porque esta matriz não demonstrou quebra de serialização, duplicação, excesso de crédito ou exploit.

## Ordem examinada e pendências

Create: idempotência → partner credit → INSERT novo pedido → triggers/filhos. O guard dos filhos faz `FOR UPDATE` do seu próprio pedido novo. Não foi encontrado lock do create sobre o pedido preexistente que approve está aprovando; o calculador de crédito tem SELECTs sem FOR UPDATE. Approve: row do pedido preexistente → crédito hashtext → UPDATE → crédito hashtextextended no trigger. Nas duas ordens testadas, não surgiu o ciclo row/partner necessário para deadlock create-versus-approve.

Isso não certifica todas as ordens intermediárias: o hold ocorre após retorno da RPC, antes de commit. Branches de crédito formal já aprovado podem retornar cedo do trigger; não foram certificadas por esta matriz. A divergência explícita permanece pendência de composição, não vulnerabilidade demonstrada.

Risco separado para revisão: wrapper de geração usa receipt advisory antes do row; aprovação pode manter row antes da geração via trigger na_aprovacao. A matriz anterior confirma interleave pós-retorno sem duplicação, mas não prova ausência de ciclo na janela intermediária. **Hipótese de inversão, não deadlock reproduzido**; não corrigida especulativamente.

## Rollback / contenção

Todos os SQL/baselines/origin-rebase permanecem byte-exatos. Rollback histórico continua contenção guardada que fecha create e nega approve/generate externos, não reversão do código; não alterar seu hash esperado por uma correção inexistente. O caminho interno preservado pode manter a divergência explícita: contenção externa não equivale a resolver locks internos. Mantidos quiescência/drenagem antes da contenção e limite de não cancelar chamadas em voo.

Crédito LIVE `213ac31f3a30816ead75365b0d1fed18`, ACL fiscal/eligibility e gates preservados. Produção writer=false, contabilidade A DRAFT; nenhuma operação hospedada, sessão, pedido, título ou publicação. JWT/RLS/PostgREST hosted, pós-entrega na_entrega, branches não exercitadas e stress/interleavings intermediários continuam não certificados.

## Arquivos / execução

- `credit-lock-checks.py`: oito checks adicionais e duas ordens das transações.
- `test-concurrency.py`: extensão do job existente, sem alterar harness/baselines históricos.
- `src/test/saas/c2-order-concurrency-postgres.test.ts`: teste integrado do job completo.
- `credit-lock-review.md`: evidência e limites; manifestos local/pai conservam entradas existentes.
- Comando: `bun run test src/test/saas/c2-order-concurrency-postgres.test.ts`.