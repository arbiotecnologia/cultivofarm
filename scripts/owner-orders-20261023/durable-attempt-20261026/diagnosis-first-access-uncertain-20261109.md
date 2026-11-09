# Diagnóstico — primeiro acesso gera "incerto" sem envio (09/11/2026)

Status: DIAGNOSIS_ONLY. Sem SQL hospedado, sem mudança de servidor, storage ou journal.

## Evidência
- Leitura SQL do auditor: journal geração 1 do ator `9b1438c1-…`, org ARBio, parceiro `5c4f35f8-…`, sem pedido e sem closure. Não é estado de FSF nem de teste4.
- O encerramento pela UI do comprador funcionou: retornou "closed" e depois "Iniciar nova tentativa".

## Causa (código)
1. `useOrderJournal` chama `recover_partner_order_attempt_v1` em toda montagem da tela Novo Pedido.
2. `c2_recover_order_attempt_core`, quando não existe journal, faz INSERT da geração 1 e responde `reserved`. Ou seja, a simples navegação já reserva.
3. Em qualquer montagem seguinte (recarga ou navegação), a chave existe, mas não há pedido nem closure, e o servidor responde `uncertain`.
4. O servidor não distingue "reservada e nunca despachada" de "despachada sem confirmação", por isso o bloqueio aparece sem envio.

## Não fazer
- Inferir no cliente que não houve envio a partir do IndexedDB, porque outro dispositivo ou aba pode ter despachado. Seria afrouxar a idempotência.
- Encerrar automaticamente, limpar storage ou regravar o journal.

## Correção proposta (servidor, pacote separado e revisável)
- Opção A: leitor somente leitura `partner_order_attempt_status_v1`, sem INSERT, usado na montagem. A reserva passa a ocorrer só em `prepareDurableOrder`, imediatamente antes do envio.
- Opção B: marcador server-side de despacho, gravado sob o mesmo lock `b2b_idem` pelo writer de criação antes de qualquer efeito. O recover responde `reserved` enquanto não houver marcador, e `uncertain` só depois dele.
- Ambas preservam CAS, cadeia de predecessores, closure atômico e o lock compartilhado com o create. Exigem PG descartável com concorrência real antes de revisão.
