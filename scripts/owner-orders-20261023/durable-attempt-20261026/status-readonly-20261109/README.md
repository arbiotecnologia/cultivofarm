# Opção A — status somente leitura ao abrir a tela (REVIEW_ONLY_INACTIVE_NOT_APPROVED)

Escolha do proprietário de 09/11/2026. Este pacote é separado do 81. Não foi aplicado no banco hospedado nem publicado.

## Servidor
- `public.partner_order_attempt_status_v1(p_partner)` chama a função de núcleo `platform_private.c2_order_attempt_status_core` (INVOKER → DEFINER, `search_path=''`, `lock_timeout=5s`).
- A função usa o mesmo lock de escopo e a mesma autorização do `recover`. Na chave atual, espera o lock `b2b_idem` dos writers e reautoriza depois da espera.
- **Nunca** insere linha no diário, nunca encerra e nunca avança.
- Respostas:
  - `{contract:C2_ORDER_ATTEMPT_STATUS_V1,state:'none',actor_id,organization_id,partner_id}` quando não há tentativa;
  - o mesmo formato `C2_ORDER_JOURNAL_V1` do recover (`uncertain`/`closed`/`committed` mais os predecessores) quando há.
- Diário legado sem histórico continua exigindo reconciliação (`C2DJ_LEGACY_RECONCILIATION_REQUIRED`).
- O recover, o create e o close não mudam: o POST confirma que o recover segue com MD5 `191fc048…`.
- EXECUTE só para authenticated, sem grant option; o rollback (99) remove apenas as 2 funções novas.

## Tela (código pronto, mas inativo enquanto o servidor responder PGRST202)
- Ao abrir, a tela chama a verificação de capacidade e depois o status. Só o PGRST202 exato que cita `partner_order_attempt_status_v1` mantém o recover antigo na abertura. Qualquer outro erro bloqueia.
- `none`: o envio fica liberado, e a reserva é feita **só** em `prepareDurableOrder`, imediatamente antes do envio. Com expectativa "nova", qualquer resposta que não seja `reserved` é recusada (outra aba ou dispositivo reservou primeiro).
- `closed` e `committed` com ACK: o clique só registra a intenção na memória. O avanço com CAS acontece só no envio, e uma geração nova invalida a intenção.
- Uma tentativa `uncertain` antiga continua bloqueada e só é liberada pelo encerramento explícito. O cliente nunca usa o IndexedDB como prova.

## Ensaio PG17 descartável (cadeia real capturada do diário, Auth sintética)
`python3 test-status-pg.py <saida.json>` executa a bateria `../test-local.py` até antes do rollback e depois este pacote. Inclui:
- PRE, INSTALL e POST, com reexecução recusada, ACL e grant option;
- primeiro acesso e recarga sem reservar;
- duas abas reservando ao mesmo tempo, que geram uma única linha (uma resposta `reserved`, outra `uncertain`);
- timeout limitado de 55P03;
- resposta perdida depois do commit;
- replay depois do sucesso sem duplicar;
- corrida entre encerramento e criação, com exatamente um desfecho e sem deadlock;
- status esperando o writer e respondendo `uncertain` (nunca `none`);
- revogação durante a espera, outro tenant, técnico isolado e anon negados;
- rollback com pin divergente, rollback exato, PRE de novo, reinstalação e POST.

| Tentativa | exit | resultado | causa |
|---|---|---|---|
| 01 | 1 | interrompida | erro do teste: o helper esperava falha no PRE; chave do JSON |
| 02 | 1 | interrompida | POST comparava `proconfig` como texto; fixture ADMIN |
| 03 | 1 | 37/38 | ator cumulativo revogado nega com `forbidden_financial_terms` (42501 canônico); asserção estreita demais |
| 04 | 0 | 38/38 | pins medidos |
| 05 | 0 | 38/38 | pins congelados no 02/99 |

MD5 das funções: núcleo `cc5167a749b5bed25adb80ef3be8a289`, wrapper `6c25d70132420bc342bcfbefad427954`. O auditor deve conferir os pins de PRE (`8e6d6191…`, `191fc048…`, `f5aa4059…`, `f6d227ad…`, `6ca96c9d…`, `4d7a7a49…`) em LIVE antes de instalar. Isto não é prova de JWT/RLS/PostgREST hospedado.
