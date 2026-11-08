# Teste autenticado mínimo de parciais — PREPARADO / NÃO EXECUTADO

## Ambiente e barreiras

Executar apenas pelo auditor em ambiente seguro previamente comprovado e isolado, com sessões reais e contratos exatos instalados após revisão independente. Esta preparação NÃO autoriza uso de produção ou implantação. Refs proibidos/Lovable Cloud permanecem proibidos; qualquer conexão de banco exige comprovação do ref canônico `swzpzcwiasxmjutrmvkm`. Sem um ambiente seguro que satisfaça essas restrições, manter NOT_RUN — não criar outro destino por iniciativa própria.

Não injetar claims/GUC de autorização, usar service_role como usuário, criar Auth, inventar atestação contábil ou dar grants temporários. Manter dez gatilhos de recebível, ACL/fence/no-downstream e dependência fiscal real always-deny. Comunicação, provedores, NF, cobrança e pagamentos fechados. “Envio” logístico nesta matriz é somente transição física local no ambiente autorizado, nunca envio externo.

**Bloqueio atual de entrada:** `platform_private.b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)` não tem EXECUTE para authenticated/service_role e não é endpoint de cliente. O harness usa executor PostgreSQL com identidade sintética declarada; isso NÃO é prova autenticada. Exigir fixture operacional preparada pelo auditor através de caller canônico revisado que reautorize o ator, ou um contrato revisado próprio antes de executar. Não chamar helper privado pelo cliente nem ampliar ACL para fazer o teste passar. Se o pedido exigir contabilidade, não promover artificialmente um pedido real.

## Fixture e provas

Uma única compra autorizada de revenda, pedido de **3 embalagens inteiras de 25 kg** no tenant vendedor ARBio, OS ligada ao item exato e estoque de compra, sem produção/CQ/envase. Preço/condição vêm do snapshot aprovado; não impor valores de referência. Identidades: vendedor autorizado e FSF negativa em sessões separadas, nunca impersonação administrativa. Isolar IDs das fixtures, preservar teste4 e cinco títulos; não apagar histórico depois.

Antes, registrar leituras autorizadas: pedido aprovado, `ready_for_production=false`, snapshot/itens, estoque/reserva, zero novas dívidas/documentos/alocações/snapshots fiscais, contagem do evento terminal e recibos. Não usar tabelas privadas via cliente; observação privada somente pelo auditor read-only.

| Passo | Ação canônica no ambiente autorizado | Resultado obrigatório |
|---|---|---|
| 1 | Preparar entrega de 1 embalagem usando reserva/group/prova já revisados; confirmar por `rpc_entrega_confirmar_manual_v1`, timestamp observado e chave única | ACK success/replay=false; entrega entregue, comprovante confirmado, expedição/recibo únicos; pedido aprovado, restante 2 sem obrigação de segunda OS/reserva; evento terminal 0 |
| 2 | Repetir **exatamente** timestamp, chave e payload da confirmação 1 | ACK replay=true; nenhum delta em estoque, ledger, recibo, snapshot, título ou evento |
| 3 | Preparar e confirmar as 2 embalagens restantes com seus próprios timestamps/chaves/provas | Ambas as quantidades persistidas [1,2]; pedido entregue somente agora; evento canônico `entrega_realizada` total 1 |
| 4 | Repetir confirmação final e releitura com sessão nova | Replays sem delta; evento terminal continua 1, snapshots econômicos intactos; zero recebível/NF/cobrança/envio externo |
| 5 | Sessão FSF: leitura do pedido/OS/entrega e tentativa de confirmação da fixture **somente nesse ambiente seguro** | Sem dados estrangeiros; negação autorizativa, zero mutações/recibos/ledger; não aceitar erro de endpoint ausente como prova de autorização |

Capturar ACKs sanitizados, leituras antes/depois e screenshots em sessão autenticada; nunca registrar JWT/cookies/URLs assinadas/credenciais. Confirmar bytes do comprovante por transporte autorizado e RLS real, sem fabricar `storage.objects`. Se UI permanecer contida, registrar bloqueio antes de dispatch e NÃO simular sucesso pelo console. Sem endpoint/prova/autorização, passo = NOT_RUN_BLOCKED.

## Referências verificadas nesta rodada

Diretório exato: `scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/review-a1f275/`.

- 13 regressões: `final-review-70d08c.json` (SHA256 `08a78b454f5d8a1bcc66e6e78d4c8b4661cc429f2211571f81b52d0f76fe8b1c`).
- 40 fresh checks: `final-checks.json` (SHA256 `f61c7474e8959572dce49de20e42bf43655bb9e7dace61df412742f533611995`).
- Exit/logs: `final-run.exitcode` (=0), `final-run.stdout.txt`, `final-run.stderr.txt`.
- Candidato: `final-logistics-candidate.sql.review` SHA256 `8ad4def8d4ae3c2e86518f2d82bf57f053cee66b0d7e165b84472cb586812c20`.
- Instalador: `final-logistics-install.sql.review` SHA256 `56631263e6ebfe51e9f02822f72c98f895a728f762d3c0ef62c575e44ee7ec09`.
- PRE/POST/rollback: `final-logistics-pre-metadata.json`, `final-logistics-post-metadata.json`, `final-logistics-postflight.sql.review`, `final-logistics-rollback.sql.review`.
- Manifestos: `final-source-manifest.json`, `final-canonical-composition-manifest.json`; hashes completos em `summary.json`.

`review-a1f275/after.json` **não existe** e não deve ser citado. Os 29 arquivos do summary foram verificados byte a byte, não reexecutados nesta rodada. Execuções anteriores 13/13 e 40/40 são sintéticas locais, sem aprovação. Fiscal positivo integrado permanece **NOT_RUN_BLOCKED_REAL_ALWAYS_DENY**, contabilidade real pendente; nenhuma atestação mudou.