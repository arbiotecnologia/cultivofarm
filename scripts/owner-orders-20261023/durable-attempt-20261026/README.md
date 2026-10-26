# Continuidade de tentativa — INATIVO / NO-GO

Base de trabalho: `001b3cadf7830e90602eae87ce1042504f06d63d`.
O proprietário informou publicação 001b3cad, implantação 5cd e homologação real A/B:
close→closed, PB001033 único, replay→committed e B 403/42501 target_outside_portfolio.
São relatos externos; nenhuma operação produtiva foi repetida pelo agente.

## Decisão de segurança

Não integrar journal frontend-only ao pedido publicado. A perda **total** do armazenamento
é indistinguível do primeiro uso. Um cliente antigo também ignora qualquer journal novo.
IndexedDB, Web Locks, BroadcastChannel e `navigator.storage.persist()` não resolvem isso.
O backend instalado fecha uma **chave conhecida**, mas não descobre uma chave perdida nem
serializa duas chaves distintas do mesmo ator/empresa/parceiro.

Esta etapa entrega um **contrato servidor candidato**, não recuperação funcional publicada.
Runtime, monitor, rotas, dependências, cliente Supabase e pacote 5cd ficaram intactos.

## Contrato candidato C2_ORDER_JOURNAL_V1

- `recover_partner_order_attempt_v1`: wrapper INVOKER/core privado DEFINER, autoridade
  canônica antes/depois da espera. Slot derivado de `auth.uid()` + empresa atual + parceiro.
- Histórico privado imutável por geração: somente ator/empresa/parceiro, chave opaca,
  predecessor e data técnica. Nenhum payload, observação, preço, cart_hash ou token.
- Preparar sem chave local retorna a geração existente; só o servidor gera chave inicial.
  Crash antes de fetch permanece `uncertain`; crash após commit recupera `committed`.
- Ordem normal: lock de continuidade do escopo → lock `b2b_idem` → locks canônicos existentes.
  Create e close usam a mesma ordem. Escopo não inclui papéis/época/TTL.
- `p_advance=true` deve vir somente de clique explícito com chave+geração esperadas.
  Usa o close atômico existente. `closed` permite próxima geração; `committed` devolve
  pedido e só avança com acknowledgment explícito do UUID confirmado. CAS antigo falha.
- Erro/timeout/unknown nunca libera. A implementação candidata de recuperação propaga
  timeout como erro inconclusivo; frontend futuro deve mantê-lo bloqueado.
- Barreira na escrita de idempotência nega chave arbitrária/versão antiga e reverte
  toda criação. A contenção troca essa barreira por negação de novas escritas e revoga
  RPCs novas; preserva replay de pedido já existente e todos os históricos/tombstones.

## Arquivos e comandos executados

1. `python3 scripts/owner-orders-20261023/durable-attempt-20261026/assemble.py`
   Gera PRE, candidato, POST, contenção e hashes; não acessa banco.
2. `python3 scripts/owner-orders-20261023/durable-attempt-20261026/test-local.py`
   **20 PASS** do pacote, além do setup capturado; PostgreSQL descartável/Auth sintética.
   Saída integral em `results-postgres.txt`. Reproduz duas chaves/duas criações antes;
   depois recuperação da mesma geração, fechamento, commit perdido, CAS, A/B/técnico,
   revogação, concorrência por processos independentes, imutabilidade e contenção.
3. `python3 scripts/owner-orders-20261023/durable-attempt-20261026/test-browser.py`
   **12 PASS**, Chromium/IndexedDB reais e transporte controlado, saída `results-browser.txt`.
   Duas páginas mesma origem, fechar/reabrir, geração antiga, perda/corrupção/indisponibilidade,
   troca A/B e contexto revogado. Não testa UI integrada nem JWT hosted.
4. `bun run test -- src/test/pedidos/attemptClosureContract.test.ts src/test/pedidos/concurrentAttemptHook.test.tsx src/test/pedidos/novoPedidoAttemptClosure.test.tsx`
   **31/31 PASS**, resultado `results-vitest.txt`: compatibilidade do runtime publicado,
   duplo clique, SQLSTATE conclusivo/unknown e fechamento com fences. Não são testes
   de integração do journal candidato na tela, pois essa integração foi deliberadamente evitada.

`journal-prototype.mjs` é somente protótipo inativo de testes. Guarda chave, versão e estado
com índice SHA-256 do escopo, sem identidades em claro. Não guarda o digest fraco cyrb53 do
payload: não é hash criptográfico nem impede adivinhação de valores de baixa entropia.
Transações locais só adotam reserva emitida pelo contrato candidato; não inventam chaves.

## Gates bloqueantes antes de uma implantação

1. **Captura LIVE fresca não realizada nesta etapa.** Pins vêm do pacote revisado 5cd;
   PRE verifica corpos e metadados de fechamento, mas não certifica todos os triggers,
   ACL/RLS/índices/dependências comerciais atuais. Auditor deve capturar ref exato
   `swzpzcwiasxmjutrmvkm`, catálogo completo e `created_by` antes de substituir gate.
2. **Reconciliação de tentativas legadas desconhecidas.** Não há autoridade para dizer
   quais chaves 001b ainda estão em trânsito. Candidate tem hard gate incondicional
   `42501/C2DJ_ACTIVATION_BLOCKED:legacy_keys_and_live_capture_pending` **antes do DDL**.
   Não é contornável por GUC/claim; não remover sem novo pacote revisado.
   Migração memory→journal e recuperação de tentativas 001b permanecem não implementadas.
3. **Rollout/locks in-flight.** Corpo antigo já segurando `b2b_idem` pode encontrar a nova
   barreira que tenta lock de escopo; recuperação nova pode segurar escopo e esperar idem.
   Inversão transicional exige quiescência comprovada ou composição/barreira alternativa
   reproduzida em PostgreSQL. Não alegar que CREATE OR REPLACE drena chamadas.
   Rollout concorrente de corpo antigo e contenção em voo não foram provados neste pacote.
4. **Matriz completa pendente:** timeout servidor com espera real, falha POST injetada,
   revogação/tenant durante espera, crash do processo inteiro, quota/eviction completa,
   equivalência do callback para carrinho editado e UI integrada de duas abas após
   instalação. Testes publicados continuam passando, mas não substituem esses cenários.
5. **Rollback:** não voltar para 001b com writer novo ativo. Usar contenção deny-only
   revisada no servidor antes de downgrade; nunca excluir journal/fechamentos ou restaurar
   create permissivo. `test-install.sql` omite somente hard gate e é **DESCARTÁVEL APENAS**.
6. Nova revisão independente, teste JWT/RLS real A/B e autorização específica do auditor
   precedem qualquer implantação ou publicação. Nenhum token exposto/permissão nova concedida.

## Limites

IndexedDB só compartilha **mesma origem e mesmo perfil/contexto do navegador**.
Preview e `app.cultivofarm.com.br` não compartilham armazenamento. O contrato candidato
server-side poderia reencontrar o slot autenticado, mas essa garantia entre origens
**não foi homologada**. Estado de carrinho não é recuperado pelo journal mínimo.
Contabilidade A continua DRAFT; nenhuma cobrança/NF/entrega foi criada. As 36 falhas antigas
das suítes monitor seguem abertas. Este pacote está deliberadamente **NO-GO**.