# Revisão intermediária — 24/10 01:10

Base solicitada: `31369baf243e60cae1d3e4755c903124316934e2`. **Candidato inativo, sem SQL hospedado/publicação.**

## Correção crítica de transação — revisão 01:38

O commit `cfa13fdeaaeee0177584a9037d03cbca2954bece` continha ROLLBACK embutido antes do DDL: o PASS anterior **não comprovava atomicidade da instalação**. Não usar aqueles comandos para implantação.

`assemble.py` remove somente linhas delimitadoras externas de transação ao normalizar a composição e envolve cada comando em um único BEGIN/COMMIT; mantém byte-exatos guards, DDL e corpos dollar-quoted. Pre/post usam BEGIN READ ONLY. Containment já tinha apenas um par e teve somente o posicionamento externo normalizado. Gerador idempotente, sem conexão de banco; baselines e origin-rebase não são alterados.

`receipt-atomicity-checks.py` executa cada **comando completo** no PostgreSQL descartável, inserindo falha deliberada depois dos POSTs reais e antes do COMMIT; não extrai função. Candidate falho preserva MD5 baseline `9c8c8a736bcd1d77ee2f237a8a59b4ce`; rollback falho preserva MD5 novo `31eeb54e4b69d97c311629a37e553faf`; containment falho preserva todos os corpos/owners/ACLs do catálogo public/platform_private. Controles positivos executam candidate, rollback e pre/post completos. Instrumentação de todos os DOs/DDL externos observa **um único txid por comando**, sem aviso de transação ausente/aninhada. Nenhuma instrumentação/falha entra nos SQL entregues.

Os seis novos checks passaram no harness (TOTAL183); resultado final da suíte abaixo. Pacote permanece inativo, writer false e fiscal/contabilidade pendentes.

## Falha reproduzida

PostgreSQL descartável, funções/triggers canônicos completos e Auth sintética. Uma terceira conexão segura o lock de crédito hashtext existente. Approve entra na RPC, adquire row do pedido e espera nesse lock. Generate entra na RPC, adquire receipt advisory e espera pelo row de approve (`transactionid`). Liberar a barreira produz ciclo row/receipt: **SQLSTATE 40P01**, capturado dentro de `generate_b2b_receivable_secure_impl` (ou envolvido pelo tratamento de erro da aprovação se ela for a vítima). Não foi usado mock, trigger de pausa nem alteração da lógica para provocar a falha. Controle da barreira cancela somente a conexão coordenadora local; timeouts limitam o teste.

## Correção mínima comprovada na mesma janela

Somente `public.generate_b2b_receivable_secure(uuid)`: acrescenta `PERFORM 1 FROM public.partner_orders WHERE id=p_partner_order_id FOR UPDATE;` **após checks existentes de autorização/argumento, antes do receipt advisory**. Todos os demais bytes, assinatura, owner postgres e ACL `{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}` preservados. Impl continua internal-only. Novo MD5 **31eeb54e4b69d97c311629a37e553faf**, anterior **9c8c8a736bcd1d77ee2f237a8a59b4ce**.

Na mesma barreira o generate passa a esperar pelo row **sem receipt adquirido**; approve termina e generate faz replay. Ambas transações commitam: exatamente um título, três parcelas e um vínculo no cenário separado suportado `na_aprovacao`. `na_entrega` continua sem título na aprovação e geração antecipada falha **42501/C2_EXTERNAL_DELIVERY_REQUIRED**, snapshot integral unchanged. Não significa homologação pós-entrega.

## Artefatos e implantação independente

- `baseline.sql`: cópia imutável do wrapper capturado, não comando de promoção.
- `function.sql.review`: única mudança acima.
- `preflight.sql`, `candidate.sql.review`, `postflight.sql`: guard integral da composição (funções/owner/ACL/trigger/RLS/policies), crédito LIVE **213ac31f3a30816ead75365b0d1fed18**/owner/ACL e helper writer **false**; candidato transacional tem PRE/POST. Nenhuma autorização de abrir writer.
- `containment.sql.review`: contenção deny-only original copiada com **somente** hash esperado do wrapper atualizado. Fecha create e nega approve/generate externos existentes; preserva wrapper corrigido/histórico e negações internas. Testada com corpo/ACL drift e pedidos reais somente locais.
- `rollback.sql.review`: **reversão de código**, guard integral exige wrapper novo e writer false; restaura wrapper antigo. Reintroduz janela 40P01 e não é rollback operacional recomendado. Preferir contenção deny-only sob quiescência/drenagem; nenhuma opção cancela operações em voo. Não confundir versões/reexecutar SQL antigo com hash divergente.

Produção continua writer false/contabilidade A DRAFT sem atestado. Preflight estrutural não valida contabilidade; o preflight contábil separado existente permanece indispensável para implantação da composição e não pode ser contornado.

## Crédito e negativas

Limite positivo sintético 999999999999.99: create termina dentro da janela em que approve segura row/espera hashtext, depois approve conclui e exposição permanece dentro do limite, nenhum título `na_entrega`. Repetido com campos de crédito formal já aprovado: branch real do approve/trigger exercitada. **Limite explícito:** corpo atual de `approve_b2b_credit` não está no snapshot; campos foram preparados como fixture local sob replica, não houve chamada substituta nem certificação da concessão formal. Não certifica fronteira exata de crédito/overdue concorrente ou todos os interleavings.

Negativos cross-tenant create exigem **42501/forbidden_partner**; técnico exige **42501/forbidden_financial_terms**; aprovação/geração estrangeiras exigem **42501/b2b_phase1_scope_denied**; retirada gestor/vínculo cumulativo exige **42501/forbidden_financial_terms**. Revogação singleton histórica exige **42501/forbidden_partner**. Controles: A/admin nas mesmas ordens financeiras, B cria no próprio parceiro Q, mesma identidade cria antes e após reativação do vínculo. Erro incidental não conta mais como isolamento; negativos históricos de autorização recebem overlay estrito sem editar os arquivos históricos. Negativos antigos de quantidade inválida ainda só comprovam falha/atomicidade, **não** autorização.

## Suíte e limites

`bun run test src/test/saas/c2-order-concurrency-postgres.test.ts src/test/saas/c2-credit-numeric-postgres.test.ts`: **2/2 PASS** final após guards integrais, concorrência177 checks/102.41s e crédito123 checks/59.53s; duração103.99s, 01:35 UTC. O check final de teardown é emitido após TOTAL e não incluído nos177.

Sem JWT/RLS/PostgREST hosted, contabilidade real, stress prolongado, concessão formal por RPC capturada, pós-entrega na_entrega ou sucesso operacional interno. O uso de dados sintéticos/replica restringe-se à montagem; chamadas testadas usam authenticated/origin. Baselines/origin-rebase aritmético preservados.