# Teste autenticado mínimo de parciais em produção — PREPARADO / NÃO EXECUTADO

## Destino e barreiras

**Destino exclusivo: produção `swzpzcwiasxmjutrmvkm`, somente pelo auditor após revisão independente, instalação incremental aprovada e autorização expressa da fixture/piloto.** Em 08/11 21:45 UTC o proprietário substituiu a preparação de homologação por validações autenticadas na produção sob gates e testes sintéticos aprovados. Os documentos de homolog anteriores são históricos, não próximos passos.

Estado atual: **NOT_RUN_BLOCKED_CALLER_REVIEW_AND_PRODUCTION_APPROVAL**. O endpoint e a UI foram exercitados localmente, mas ainda não estão instalados/montados; leitores/capability/continuidade durável e dependências LIVE precisam revisão. Não pedir login para contornar essas lacunas. Rollout exato e desativado: `production-rollout-postplans-2145.md`.

Não injetar claims/GUC de autorização, usar service_role como usuário, criar Auth por harness, inventar atestação contábil ou dar grants temporários. Manter dez gatilhos/ACL de recebíveis, no-downstream, isolamento POSPLANOS e dependência fiscal real always-deny. Comunicação, provedores, NF, cobrança e pagamentos fechados. “Envio” logístico significa somente transição física, nunca mensagem externa.

## Fixture e leituras iniciais

Uma única compra autorizada de revenda e um pedido sintético aprovado de **3 embalagens inteiras de 25 kg** no tenant vendedor ARBio, com OS ligada ao item exato e estoque de compra, sem produção/CQ/envase. Preço/condição vêm do snapshot aprovado; não impor valores de referência. Identidades e vínculos devem ser criados pelos fluxos normais pelo auditor/usuário, nunca pelo agente ou SQL de fixture. Preservar teste4, cinco títulos e todos os históricos; não apagar a fixture depois.

Antes, registrar por leituras autorizadas: pedido aprovado, `ready_for_production=false`, snapshot/itens, estoque/reserva, zero deltas de dívidas/documentos/alocações/snapshots fiscais, contagem do evento terminal e recibos. Tabelas privadas só podem ser observadas pelo auditor READ ONLY; o cliente usa somente leitores escopados.

| Passo | Ação canônica em produção aprovada | Resultado obrigatório |
|---|---|---|
| 1 | Vendedor cria OS pelo endpoint público com IDs fornecidos pelo leitor, timestamp observado e key durável | Uma OS/recibo; helper privado sem EXECUTE de cliente; nenhum programa de produção |
| 2 | Preparar entrega de 1 embalagem por reserva/group/prova revisados e confirmar com timestamp/chave únicos | ACK success/replay=false; entrega, comprovante, estoque e ledger persistidos; pedido aprovado, restante 2 sem segunda OS/reserva exigida; evento terminal 0 |
| 3 | Repetir exatamente timestamp, chave e payload da confirmação | ACK replay=true; nenhum delta de estoque, ledger, recibo, snapshot, título ou evento |
| 4 | Preparar e confirmar as 2 embalagens restantes com timestamps/chaves/provas próprios | Quantidades [1,2]; pedido entregue somente agora; evento canônico `entrega_realizada` total 1 |
| 5 | Repetir ACK final e duas confirmações finais concorrentes em cenário aprovado | Replays sem delta; um evento/recibo; snapshots econômicos intactos |
| 6 | Sessões próprias de comprador, FSF, inativo/revogado e feature fechada; pedido não aprovado e contabilidade pendente | Negações sem dados estrangeiros, OS, ticket, recibo ou ledger; revogação durante wait sem mutação. Não aceitar endpoint ausente/erro de schema como prova de autorização |

Capturar ACKs sanitizados, leituras antes/depois e screenshots em sessões reais; nunca registrar JWT/cookies/URLs assinadas/credenciais. Confirmar bytes do comprovante por transporte autorizado e RLS real, sem fabricar `storage.objects`. Se a UI estiver contida, registrar bloqueio antes do dispatch e não simular sucesso pelo console.

Ao final, medir zero novos recebíveis, NF, cobranças, pagamentos, mensagens, produção/CQ/envase e efeitos externos. Desativar o gate/piloto do teste conforme aprovação, preservando o isolamento de planos. Rollback operacional é deny-only e não remove histórico nem reabre vazamento.

## Evidência local POSPLANOS desta preparação

Diretório: `evidence/review-postplans-2145/`.

- `checks.json`: **41/41**, `run.exitcode=0`, fresh PostgreSQL descartável com isolamento de planos antes do B3/logística.
- `review-70d08c.json`: **13/13**, incluindo dois itens/uma OS, 3→1→2, cancelada parcial, excesso, concorrência e revogações.
- `os-endpoint-tests.json`: **9/9**, incluindo negativos e duas criações concorrentes = uma OS + replay. FSF parou na feature, não prova isolada de tenant; service_role parou no schema, ACL do helper medida separadamente.
- `frontend/ui.txt`: **13/13**; `frontend/compat.txt`: **73/73**; typecheck exit 0. UI fora do runtime, sem browser autenticado.
- Logística `8ad4def8d4ae3c2e86518f2d82bf57f053cee66b0d7e165b84472cb586812c20`; instalador `56631263e6ebfe51e9f02822f72c98f895a728f762d3c0ef62c575e44ee7ec09`; endpoint `21d40202d32e70dfbb44c7eb2a54a4135ebace840b301c15ab37b910cbfa0ee3`, todos inalterados.

Esses resultados são sintéticos locais, não prova de JWT/RLS/PostgREST/Storage/browser de produção. Fiscal positivo integrado permanece **NOT_RUN_BLOCKED_REAL_ALWAYS_DENY**; contabilidade real não foi atestada.
