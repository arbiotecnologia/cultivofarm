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
- `create_partner_order_secure`: o único acréscimo, logo após o replay de idempotência e sob o mesmo lock, é
  `IF EXISTS(fechamento) THEN RAISE 'idempotency_key_closed'`. O resto do corpo é byte-exato ao LIVE.
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
  - create `006d20ee80e4ab94a7d266d7ede57c67`;
  - core `ba556b900ec5cd8060c25d79028a5727`;
  - wrapper `3f48dbe69577bb77428a6abe4a30671f`;
  - função de imutabilidade `3375615fd81e3671cc581297c75e9600`.

## Prova automática (sintética)
Comando: `python3 test-local.py`. Saída em `results-local.txt`: **51 PASS deste pacote**, mais 24 do harness base.
- O harness parte da cadeia capturada `accounting-pending-request-20261024`, com o create idêntico ao LIVE
  (prosrc e ACL), e reproduz exatamente os pins de `has_role`, `get_user_partner_id`, colunas e policies.
- Correção de fidelidade, reportada na saída: a réplica reduzida não tem índices, então os dois índices LIVE
  capturados (pkey e único `partner_id`+chave) são recriados antes do preflight.
- Cenários de concorrência, com conexões reais e um "holder" segurando o lock:
  - ordem A: create enfileirado antes do fechamento → `committed`, um pedido, nenhum fechamento;
  - ordem B: fechamento enfileirado antes do K1 tardio → `closed` e `idempotency_key_closed`, sem pedido;
    em seguida K2 cria uma vez e K1 continua recusado;
  - timeout: o lock é mantido além de 5 s → `in_progress`, sem gravação.
- Negativas com mensagens exatas: B, técnico isolado e produtor recebem `forbidden_partner` ou
  `forbidden_financial_terms`; vínculo revogado, `forbidden_partner`; perfil inativo, `inactive_scope`;
  parceiro inativo, `partner_not_found`; chave vazia ou longa é rejeitada; anon não tem EXECUTE; não há acesso
  direto à tabela; o owner não consegue UPDATE, DELETE nem TRUNCATE.
- Pacote: preflight falha com divergência; falha injetada no PRE ou no POST não deixa nada aplicado; rollback
  total só com zero fechamentos; rollback por contenção mantém as chaves fechadas recusadas e o create/replay normal.

## Limites e pendências
- Auth sintética via `request.jwt.claims`; não há prova de JWT nem de RLS hospedados.
- A prova real em sessões A/B e entre abas ou domínios fica com o auditor.
- O frontend fica preparado e desativado: `src/lib/authz/attemptClosureContract.ts`, flag `false`, sem consumidores.
  Plugar a RPC na tela fica para uma etapa posterior, após instalação revisada.
- O gate contábil A continua DRAFT. Nenhum dado novo foi criado e nenhum SQL hospedado foi aplicado.
- O grant amplo para `anon`/`authenticated` na tabela de idempotência foi apenas registrado, não alterado.
