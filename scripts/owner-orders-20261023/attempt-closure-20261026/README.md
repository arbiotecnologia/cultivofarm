# Fechamento durável de tentativa de pedido — C2_ORDER_ATTEMPT_CLOSURE_V1 (INATIVO)

Pacote para revisão independente. Nada foi aplicado em produção nem publicado; o frontend não chama a RPC.

## Problema
O plano c1583a15 (Web Locks + localStorage) foi REJEITADO: um envio K1 em trânsito antes do lock pode chegar
depois de uma consulta "ausente" e de um K2 novo, criando duplicata. Ausência nunca prova que K1 não chegará.

## Solução
- `platform_private.partner_order_idempotency_closures(partner_id, idempotency_key, closed_by, closed_org, closed_at)`.
  É imutável (triggers bloqueiam UPDATE, DELETE e TRUNCATE, inclusive para o owner) e tem RLS sem policies.
  Sem grants para PUBLIC, anon e authenticated; service_role tem somente SELECT.
- `public.close_partner_order_attempt_v1(uuid,text)` é um wrapper INVOKER que chama o core
  `platform_private.c2_close_partner_order_attempt_core`, SECURITY DEFINER, com `search_path=''` e `lock_timeout=5s`.
  1. Aplica a mesma autorização, na mesma ordem, do create canônico antes de revelar qualquer estado:
     `c2_order_actor_scope`, papéis, `forbidden_partner` e parceiro ativo.
  2. Obtém o MESMO lock do create: `pg_advisory_xact_lock(hashtextextended('b2b_idem:'||partner||':'||key,0))`.
  3. Se existe registro de idempotência, responde `committed` com o id e o número do pedido.
  4. Se não existe, grava o fechamento e responde `closed`.
  5. Se o lock não é obtido no prazo, responde `in_progress`, sem gravar nada (desconhecido).
- `create_partner_order_secure`: o único acréscimo fica logo APÓS o lock `b2b_idem` e antes do replay:
  revalidação da autorização (`c2_partner_order_attempt_authz`) e `IF EXISTS(fechamento) THEN RAISE
  'idempotency_key_closed'`. O resto do corpo é byte-exato ao LIVE.
- Barreira durável no caminho de ESCRITA (revisão 457951ca, cenário 1): trigger `c2_attempt_closure_guard`
  BEFORE INSERT/UPDATE OF chave em `public.partner_order_idempotency`, SECURITY DEFINER, obtém o MESMO lock
  `b2b_idem` (reentrante) e recusa chave fechada. `CREATE OR REPLACE` NÃO drena execuções em voo; um create com
  o corpo antigo que ainda não chegou ao lock é recusado na sua gravação final de idempotência, e a transação
  inteira (pedido, itens, termos, notificações, auditoria) é revertida. Não depende de drain.
- Revalidação após a espera (cenário 2): o fechamento e o create chamam a mesma autorização canônica antes
  E depois do lock. Revogação, perfil inativo ou parceiro inativo confirmados durante a espera abortam sem
  revelar `committed`/replay e sem gravar `closed`; a chave não fica atribuída a ninguém.
- Limite de linearização: em READ COMMITTED cada instrução lê snapshot novo; o ponto de linearização da
  autorização é a revalidação pós-lock. Uma revogação confirmada DEPOIS dessa instrução e antes do COMMIT não é
  observada por aquela chamada (vale também para o create LIVE). Sob REPEATABLE READ/SERIALIZABLE do chamador o
  snapshot seria o do início; PostgREST usa READ COMMITTED.
- Limite da barreira: escritores com `session_replication_role=replica` (só superusuário) não disparam triggers.
- A identidade da tentativa no servidor é `(partner_id, key)`, estável e independente da autorização atual.
  Revogar o vínculo, desativar o perfil, sair da conta ou trocar de papéis não reabre uma chave fechada.

## Arquivos
- `assemble.py` gera tudo a partir de `live/create_partner_order_secure.prosrc` (prosrc LIVE, MD5 `7a634235…`)
  e de `live-pins.json`, capturado READ ONLY em 26/10.
- `preflight.sql`: READ ONLY. Confere ausência do alvo; create com corpo, owner, secdef, search_path e ACL;
  `c2_order_actor_scope`; `has_role`; `get_user_partner_id`; colunas, policies e RLS da tabela de idempotência;
  índice único exato; USAGE do schema.
- `candidate.sql.review`: transação única. Os mesmos asserts vêm antes do DDL e os asserts POST antes do COMMIT.
- `postflight.sql`: READ ONLY. Confere MD5 reais, owner, secdef, proconfig, ACL (sem anon), ACL da tabela, RLS e triggers.
- `rollback.sql.review`: CONTENÇÃO, não reversão. Revoga EXECUTE de authenticated, mantém a tabela e o guard do
  create, e as chaves fechadas continuam recusadas.
- `rollback-full-if-empty.sql.review`: restaura o create LIVE e remove os objetos SOMENTE se não houver nenhum
  fechamento (LOCK ACCESS EXCLUSIVE). Caso contrário aborta com `C2AC_FULL_ROLLBACK_REFUSED`.
- MD5 (prosrc) do candidato, também em `expected.json`:
  - `public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)` `71d1f32e00c5c9857eae51999dc40ef0`;
  - `platform_private.c2_close_partner_order_attempt_core(uuid,text)` `dcb22362321fa041353242674db58057`;
  - `public.close_partner_order_attempt_v1(uuid,text)` `3f48dbe69577bb77428a6abe4a30671f`;
  - `platform_private.c2_attempt_closure_immutable()` `3375615fd81e3671cc581297c75e9600`;
  - `platform_private.c2_partner_order_attempt_authz(uuid,uuid)` `0c5ded5e797ded21cc08e28c2958175d`;
  - `platform_private.c2_attempt_closure_guard()` `140ceb10660fb226fda78fb94277d17e`;
- Candidate e ambos os rollbacks usam `SET LOCAL lock_timeout='5s'` e `statement_timeout='60s'`: sob contenção
  falham com `55P03` em tempo limitado e de forma atômica, nunca esperam indefinidamente.

## Prova automática (sintética)
Comando: `python3 test-local.py`. Saída em `results-local.txt`: **89 PASS deste pacote**, mais 24 do harness base.
- Rollout com create antigo em voo (cenário 1): instrumentação SOMENTE do harness pausa o create LIVE dentro de
  `assert_b2b_partner_scope` (antes do lock `b2b_idem`, apenas na sessão com `c2ac.test_stall=on`; md5 restaurado
  e verificado depois). Com a execução em voo: aplica-se o candidato, fecha-se K (`closed`) e libera-se a execução.
  - ANTES, pacote 457951ca (sha256 fixado): REPRODUZIDO — o corpo antigo ignorou o fechamento e criou pedido.
  - DEPOIS: `ERROR: P0001: idempotency_key_closed` vindo de `c2_attempt_closure_guard`; nenhum pedido nem
    linha de idempotência; fechamento mantido. O candidato foi aplicado sem bloquear (0,1 s).
- Revogação durante a espera (cenário 2), com chamada já autorizada parada no lock: fechamento de chave nova,
  fechamento de chave confirmada, perfil inativo, parceiro inativo, create novo e replay → `42501`
  (`forbidden_partner`/`inactive_scope`/`partner_not_found`), sem revelar e sem gravar; as chaves não ficaram
  atribuídas e foram fechadas depois por ator autorizado.
- Negativas agora exigem a linha exata `ERROR:  <SQLSTATE>: <mensagem>` e estado idêntico (pedidos, itens, termos,
  idempotência, fechamentos, notificações, auditoria). Técnico isolado e produtor são negados primeiro pelo guard
  canônico de escopo (`42501 forbidden_financial_terms` / `42501 forbidden_partner`), como no create LIVE.
- Timeouts: candidate com create autorizado segurando a tabela → `55P03` em 5,0 s, nada instalado; rollback total
  com fechamento autorizado em voo → `55P03` em 5,0 s, nada alterado; rollback de contenção conclui com chamada
  autorizada em voo, que termina `closed` e continua honrada.
- Mantidos: corridas nas duas ordens, `in_progress` em 5 s, imutabilidade, ACL, rollback total só com zero
  fechamentos, barreira contra INSERT direto do owner (chave normalizada por btrim).

## Limites e pendências
- Auth sintética via `request.jwt.claims`; não há prova de JWT nem de RLS hospedados.
- A prova real em sessões A/B e entre abas ou domínios fica com o auditor.
- O frontend fica preparado e desativado: `src/lib/authz/attemptClosureContract.ts`, flag `false`, sem consumidores.
  Plugar a RPC na tela fica para uma etapa posterior, após instalação revisada.
- O gate contábil A continua DRAFT. Nenhum dado novo foi criado e nenhum SQL hospedado foi aplicado.
- O grant amplo para `anon`/`authenticated` na tabela de idempotência foi apenas registrado, não alterado.
