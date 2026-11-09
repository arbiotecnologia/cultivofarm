# Opção A — integração da intenção nova no checkout (09/11/2026)

## Resultado local
- 8 arquivos, **119/119 testes PASS**, exit 0; 10 novos casos de componente real e 2 controles de handler capturado/pending.
- `oj typecheck -b --noEmit`: exit 0. Build automático OK observado em 18:25:55 UTC.
- Tela NovoPedido, layout/guards, simulação, mutation, journal e IndexedDB reais; apenas Auth e transporte simulados, sem rede hospedada. Avisos React `act` das suítes existentes preservados no log.

## Correção
- NovoPedido é o único consumidor de produção de `useOrderJournal`, incluindo reutilização pela entrada comercial. Não há editor ou writer paralelo.
- `canSubmit` e `takeDispatch` centralizam a elegibilidade: `next` válido libera botão e handler; checking/blocked/pending/lock/escopo indisponível continuam negados. Handler relê a base observada antes de enviar; identidade do slot e recibo terminal compõem a validade.
- Closed/committed só fecham confirmação quando não há intenção `next` válida. Montagem, ACK e clique de nova tentativa continuam somente leitura; reserva/CAS ocorre apenas no `prepareDurableOrder` do hook create existente.
- Lock síncrono da página impede dois cliques no mesmo tick antes de React atualizar `isPending`. O hook create, ACL/RLS, CAS, journal persistido e idempotência não foram alterados.
- Uncertain não vira next: preserva replay da chave anterior e digest do payload. Outra aba com payload diferente reprova antes da criação; stale handler e terminal atualizado também não autorizam dispatch.

## Casos verificados
Closed → iniciar → simular boleto 1x/0%/30 dias após NF/total18 → botão habilitado → 1 reserva CAS apenas no envio; none inicial; committed com ACK exato; reload sem intenção/reserva; invalidation de outra aba; falha de status/releitura; checking e pending; revogação antes de resolver reserva; duplo clique; replay incerto com payload diferente.

## Diff e revisões gerenciadas
- `frontend.diff`: diff contra `3e8bf7d2674c57f15a5dad8fea5b79c4fe9f2cda`, com código e testes. Hashes dos quatro arquivos em `result.json`.
- Implementação registrada automaticamente nas revisões `78fa67a58` e `d792ac5a1`; nenhum commit criado manualmente pelo agente.
- Logs integrais: `vitest.txt`, `typecheck.txt`; resultado estruturado: `result.json`.

## Limites e estado externo
- Seller91 instalado pelo conector/POST92 PASS, respond `97bcdb9884b54adb3bd4aae4915e32d0`, guarda81 instalada/POST82 PASS: relatos do auditor registrados separadamente, não reaplicados.
- Estoque/logística OFF, fiscal DRAFT e PB-001038 preservado. Sem SQL hospedado, publicação, emissão, cobrança, envio ou pedido real.
- Fluxo positivo real autenticado com envio **não executado**, conforme proibição do proprietário; testes de componente não certificam JWT/RLS/Storage nem E2E financeiro real.