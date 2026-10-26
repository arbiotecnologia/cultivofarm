# Reconciliação de envio de pedido após recarregar a página ou entre abas (base 9a4b4e7)

Esta etapa é somente o desenho. Nada é aplicado em SQL, nada é publicado e nenhum dado é criado.

## O que a leitura LIVE confirmou (READ ONLY, ref swzpzcwiasxmjutrmvkm)

- Função `create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)`:
  - MD5 `7a63423519d7d9a54ced52d6d9e9e057`, SECURITY DEFINER.
  - EXECUTE concedido a authenticated e service_role.
- Ordem interna da função:
  1. Calcula o `req_fp` com entrega, primeiro vencimento, parcelas, observação e itens canônicos.
  2. Aplica os guards de papel e parceiro (`forbidden_partner`, técnico, produtor) e confirma que o parceiro está ativo.
  3. Trava `pg_advisory_xact_lock('b2b_idem:'||partner||':'||key)`.
  4. Lê `partner_order_idempotency`. Se a linha existe, aplica três regras:
     - sem fingerprint: `idempotency_legacy_unverifiable`;
     - `cart_hash` diferente do enviado: `idempotency_conflict`;
     - fingerprint diferente: `idempotency_conflict`;
     - caso contrário, devolve `result_snapshot`.
  5. Só depois disso vêm plano, crédito, preço (`price_changed`) e criação.
- Tabela `partner_order_idempotency`:
  - Tem índice único `(partner_id, idempotency_key)`.
  - Policies: `b2b_phase1_tenant_guard` (ALL, `b2b_phase1_partner_visible(partner_id,false)`) e `poi_select_scoped` (internos, ou `parceiro_b2b` do próprio parceiro).
  - Achado à parte: a tabela tem grants completos para `anon` e `authenticated`. A RLS mitiga, mas o achado fica registrado e não é alterado nesta etapa.
- Não existe RPC de tentativa ou reconciliação.

## O que isso significa

- Reenviar a mesma chave com o mesmo pedido é a forma canônica de reconciliar. O servidor espera na trava da chave, então nunca duplica. Isso exige o mesmo `cart_hash`: se o preço mudou, a resposta é `idempotency_conflict`, e esse erro prova que já existe registro para a chave.
- Uma ausência num SELECT simples não é conclusiva, porque a transação de outro envio pode estar em andamento e ainda não ter commitado.
- Depois de recarregar a página, o carrinho não existe mais, pois nunca é guardado. Sem uma leitura que espere a trava, um pedido alterado continua bloqueado para sempre.

## Decisão técnica (proposta)

Duas partes. A Parte 1 é só frontend e pode seguir sozinha. A Parte 2 adiciona uma leitura SQL mínima e só seria aplicada após revisão.

### Parte 1: chave que sobrevive ao recarregamento e é coordenada entre abas (frontend)

1. **O que é guardado:** `localStorage`, numa versão `v1`. Cada registro tem:
   - `slotDigest`: resumo de usuário, empresa, papéis ordenados e parceiro;
   - `key`: UUID opaco;
   - `fpDigest`: resumo dos mesmos campos que o servidor usa no `req_fp`, sem `cart_hash`;
   - `state`: `pending`, `uncertain` ou `committed`;
   - `numero`: apenas quando confirmado;
   - `expiresAt`: 24 h.
   - Nunca são guardados JWT, preço, `cart_hash`, itens, observação ou data em texto legível.
2. **Coordenação entre abas:**
   - Web Locks `navigator.locks.request("b2b-order-attempt:"+slotDigest)` envolve a preparação e o envio, numa ordem fixa: travar, ler o registro, gravar `pending`, enviar, gravar o desfecho, liberar.
   - Os desfechos fora de ordem usam a mesma contagem atual: rejeição só descarta com nada em voo e sem incerteza.
   - O evento `storage` atualiza as outras abas.
3. **Falhas fecham em vez de abrir:**
   - Se `localStorage` ou Web Locks estiverem indisponíveis, mantém-se o comportamento volátil atual e o pedido alterado fica bloqueado após incerteza. Nunca se gera chave nova às cegas.
   - Escrita no armazenamento que falhar antes do envio: o envio é abortado.
4. **Escopo:**
   - Um registro de outro `slotDigest` nunca é lido.
   - Logout ou troca de identidade (`clearAllPauseStates`) apagam os registros `v1` daquele usuário.
   - Revogação ou falta de permissão (`scope.ready` falso) desabilita o envio. Os registros ficam guardados e nunca são entregues a outro usuário.
   - Registro expirado vira "incerto, consulte Meus Pedidos". Não é apagado como se o pedido não tivesse sido enviado.
5. **Reconciliação sem a Parte 2:** a tela oferece "Verificar envio anterior", que faz um SELECT sob RLS em `partner_order_idempotency` pela própria chave.
   - Linha presente: confirmado, com número obtido pelo `order_id` na projeção canônica `get_my_commercial_orders_projection`.
   - Linha ausente: continua incerto. A ausência nunca é tratada como "não enviado".
   - O primeiro passo da implementação verifica se o `parceiro_b2b` e o commercial owner leem a própria linha. Se não leem, este botão não é montado.

### Parte 2: leitura de reconciliação que espera a trava (SQL, inativo até revisão)

`public.reconcile_partner_order_attempt_v1(p_partner_id uuid, p_idempotency_key text)` é um wrapper INVOKER que chama o core privado DEFINER `platform_private.c2_reconcile_partner_order_attempt_core`, com `search_path=''`.

- **Guards reutilizados:** os mesmos guards de papel e parceiro da função de criação, aplicados na mesma ordem, e parceiro ativo. A chave é validada no mesmo formato usado pela função.
- **Espera da trava:**
  - `SET LOCAL lock_timeout`, e depois `pg_advisory_xact_lock` com a mesma expressão `b2b_idem`.
  - Se a espera estourar: `{state:"in_progress"}`, não conclusivo.
- **Respostas:**
  - Registro encontrado: `{state:"committed", order_id, numero}`.
  - Registro ausente depois de obter a trava: `{state:"absent_after_lock"}`.
  - Erros de autorização são devolvidos antes de revelar se a chave existe.
- **Não faz:** escrita, preço, hash, cobrança ou alteração de RLS ou policies.
- **No cliente:** só com `absent_after_lock`, ainda segurando o Web Lock da mesma tentativa, a chave é retirada e uma nova é liberada. Uma aba que reabrir uma chave retirada não a envia; ela vai primeiro reconciliar.
- **Pacote:** `scripts/owner-orders-20261023/attempt-reconcile-20261026/`
  - `preflight.sql`: READ ONLY e transacional. Confere ausência do alvo, MD5 e ACL da função de criação, hashes das policies de `partner_order_idempotency` e de `has_role` e `b2b_phase1_partner_visible`.
  - `candidate.sql.review`: transação única, com os asserts antes do DDL, `CREATE` sem `OR REPLACE` e REVOKE de PUBLIC e anon.
  - `postflight.sql`: asserts exatos de assinatura, owner, `prosecdef`, `search_path`, ACL e MD5 reais.
  - `rollback.sql.review`: guardado por hash; remove só as duas funções novas.
  - `SHA256SUMS` e README com os limites.

## Testes

**Prova automática** (Vitest com respostas simuladas e PostgreSQL descartável com Auth sintética):

- Tela, guards e hook reais:
  - recarregar a página e reenviar o mesmo pedido usa a mesma chave;
  - pedido alterado fica bloqueado até a reconciliação;
  - `committed` mostra o número;
  - `absent_after_lock` libera chave nova, que só é usada depois.
- Entre abas: duas instâncias com Web Lock simulado e eventos `storage`. A segunda espera; nenhuma gera chave enquanto a outra está `pending`.
- Falhas: armazenamento ou Web Locks indisponíveis, gravação no armazenamento falhando, registro expirado, logout, troca A para B e revogação de papel.
- Leitura `poi` sob RLS: linha ausente continua incerto.
- PostgreSQL descartável, usando os corpos LIVE capturados:
  - duas sessões: criação segurando a trava enquanto a reconciliação espera → `committed`;
  - estouro do tempo de espera → `in_progress`;
  - rollback da criação → `absent_after_lock`;
  - A/B, técnico, produtor, revogado, chave inválida e parceiro inativo;
  - nenhuma escrita;
  - pre, candidate, post e rollback completos, com falhas injetadas.

**Prova real** (pendente, feita pelo auditor e não por mim):
- sessões JWT A/B;
- fechar e recarregar a aba no meio do envio;
- duas abas.

## Fora de escopo

- DDL, RLS e grants existentes, incluindo o grant `anon` registrado acima.
- Cobrança, fiscal e contabilidade: o gate A continua DRAFT, sem dados fictícios em produção.
- Publicação e aplicação de SQL.
- As 36 falhas antigas das suítes de sessão/monitor continuam abertas.

## Ordem de implementação após aprovação

1. Verificar READ ONLY se o `parceiro_b2b` e o commercial owner leem a própria linha de `poi`.
2. Parte 1 (frontend) com seus testes.
3. Pacote da Parte 2 com prova descartável, inativo, aguardando revisão independente.
