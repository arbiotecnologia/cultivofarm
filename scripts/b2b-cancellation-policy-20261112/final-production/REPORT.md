# Revisão 02:20 — controles originais recompostos

**Substitui o pacote 071ea24; não é apenas troca de digest. Nenhuma ação hospedada.**

A base r12 foi reconstruída em cópia temporária com fontes atuais versionadas e a variante fiscal r12. A tentativa inicial usou a variante de cenários no caminho incorreto e falhou; foi preservada em `evidence/reconstruction-1.log`. Reconstrução corrigida exit 0 em `evidence/reconstruction-2.log`. Não há exportação/importação de dados hospedados.

## Ordem local comprovada / ordem de revisão no original

1. Base original r12; Vendedor **02a → 02b → 02c → 02d** pelos instaladores originais. Reconciliação do catálogo pelo helper original; sem importar instaladores da homologação de cancelamento.
2. Coerência CCR2 **81 → 82**: pacote `scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/production-rollout-posplans-20261108-condition-contract-required/rev2-coherence-20261109/`. Três funções e três constraint triggers reais, não somente trigger UPDATE.
3. Piloto C2 `scripts/c2-pilot-economic-approval-20261111/`: **01 → 02 → 03**, gate OFF/allowlist vazia. A ativação 05 não integra a instalação; usada apenas no clone para provar duas aprovações explícitas.
4. **Diagnóstico econômico separado**, `scripts/c2-fiscal-cancel-audit-20261111/diagnostic/`: 01 → 02 → 03. INSTALL SHA `ded2e264482cc486bb9239e4198a01397575f801f52489a77f2827f9b80b6b99`. Leitor 70dba08838cd4d5eea29f37f5f8a3373 → 9eab0ceb7796f6a2421617dfb4013849; não altera eligible/reasons/aprovação.
5. **Sequência concorrente por NF separada**, `scripts/c2-fiscal-cancel-audit-20261111/event-sequence/`: 01 → 02 → 03. INSTALL SHA `9229da941744538d5a092a46b8779dbdd04fe6bb14c236c4c92b9e60fd449586`. Prepare 9af2e91f3dbea476bffb4328fa288b2f → aa4153c528a3c73311969e07cabf3fd4. Esse CREATE não está no cancelamento; o FINAL agora exige seu POST exato entre os onze pins. Rollback desse pré-requisito é deny-only, nunca restaura a sequência vulnerável.
6. FINAL **01 PRE → 02 instalação fechada → 03 POST**; rollback **04 → 05**. Bytes/hashes abaixo.

**No alvo, não reinstalar CCR2/Vendedor/piloto já instalados.** Conferir os POSTs correspondentes; aplicar somente deltas ausentes cujo PRE exato passe, após revisão externa. Diagnóstico e sequência são pré-requisitos separados identificados, não automaticamente instalados pelo FINAL. Se já estiverem no POST, não reaplicar seus INSTALLs. Nunca executar os GRANTs de reconstrução no alvo: o FINAL não altera ACLs das relações preexistentes.

`evidence/controls-exact/original-packages.json` fornece ordem, paths completos, SHA e exit 0 para cada etapa. `compose_controls.py` reproduz tudo somente no socket descartável. ACLs anon/authenticated = arwdm em partner_orders/partner_accounts; nove relações privadas com ACL explícita owner-only postgres=arwdDxtm. `evidence/controls-exact/acl-origin.json` atribui essas normalizações exclusivamente ao delta integral fornecido pelo proprietário. RLS/políticas/owners e demais controles preservados. Digest PostgreSQL recomposto: **a7a9d80e615ed42c4b5e9f5f0099a810**, captura integral em `capture/security-pins.json`. A comparação é catálogo medido após instaladores reais; não edição manual de hash.

Hashes reais dos três controles: coerência **7f793a95047846b63cb514e5a8b1af11**; snapshot Vendedor **1f82005554748b8545403372160e68a9**; barreira C2 **7064ddc0a6c7dae3efedf8558254ccca**, todos habilitados inclusive após FINAL e rollback.

## Nova rodada limpa

- PRE/INSTALL/POST exatos: exit 0, restauração repetida com os mesmos controles.
- Integração **37/37**, concorrência/revogação **49/49**, roundtrip/rollback/awaiting **18/18**, controles adicionais **17/17**: **121 testes SQL**, sem falha na rodada final `evidence/run-results.json`.
- UI/diagnóstico reexecutados: **14/14**, `evidence/ui-controls.log` (não somar 21 históricos como testes novos).
- `evidence/control-checks.json`: criação/cotação C2 por writers reais com todos os triggers ON; INSERT sem ticket negado pela própria barreira inclusive postgres; ACL nega authenticated/service_role; gate OFF nega; primeira aprovação explícita não cria previsão; segunda atravessa barreira por ticket txid do core original e cria previsão **20/20 aguardando_fiscal**. Não aprova operacionalmente C2.
- Duas conexões/chaves do preparo na mesma NF retornam sequências distintas. Metadados com TRUNCATE extra fazem PRE abortar SECURITY_DRIFT sem instalação. As 49 provas mantêm holder/waiter reais, não espera por tempo presumido.
- Integração preserva título parcialmente pago, pagamentos, estoque/entregas e cancela título somente totalmente aberto por confirmação final vinculada. Rollback conserva histórico e corpos endurecidos.

**AR Bio e atores sintéticos somente no PostgreSQL descartável.** Configurações/feature/allowlists de teste declaradas; nenhum título, saldo, autorização fiscal ou cancelamento final foi inserido para obter PASS. O teste adicional não usa replica mode nem desabilita trigger. Tentativas anteriores ficam registradas; correções de fixture criaram plano novo com vínculos canônicos em vez de trocar tenant de plano existente. Evidências históricas 071ea24 em `evidence-071ea24/`; outros deterministic-* antigos não contam como rodada adicional.

## Capturas necessárias / limites

Nenhum corpo indispensável continua ausente das fontes locais. Para decisão hospedada, os PREs dos dois pré-requisitos separados ainda devem confirmar body/owner/ACL/config do alvo: assinatura exata do leitor `public.fn_fiscal_invoice_eligibility(text,uuid)` e preparo `public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)` com hashes PRE/POST acima; diagnóstico também exige os pins de `scripts/c2-fiscal-cancel-audit-20261111/capture/pins.json`. Não requer inventário geral nem nova captura de usuário. Se divergir de ambos PRE/POST, solicitar somente pg_get_functiondef/owner/ACL/proconfig dessa assinatura, sem re-pinar por conveniência.

O PRE FINAL recomposto ainda não foi executado no alvo. Pacote apto à revisão e conferência local, **não GO hospedado**; nenhuma aplicação/publicação/SEFAZ/envio/cobrança/boletos e nenhum acesso a PB-001042. Build automático observado OK; typecheck não executado manualmente conforme restrição do ambiente. Não existe certificação JWT/RLS/Storage/provedor real.

---

# Candidato FINAL — original CultivoFarm — 12/11/2026

**Preparação local concluída. Instalação e operação hospedadas NÃO autorizadas/certificadas.**

Destino único: `swzpzcwiasxmjutrmvkm`. A homologação hospedada foi encerrada por decisão expressa às 02:00 UTC. Nenhuma fonte, barreira de permissões, instalador ou liberação da homolog foi transportada. Runtime, rotas, Edges, menu e publicação do original não foram modificados.

## Pacote e ordem de revisão

Diretório: `scripts/b2b-cancellation-policy-20261112/final-production/`.

| Ordem | Arquivo | SHA-256 dos bytes testados |
|---|---|---|
| PRE | `01-pre.sql.readonly` | `2bff97640ca54f8ccbbbaf066da8cc10e46cac6dd67608bc65dd829c5b39fd33` |
| Instalação fechada | `02-install-closed.sql.review` | `daffa3f7a1df2e506f8422f26d59db228f0a05f5090b8f4c6e06646284083b6f` |
| POST | `03-post.sql.readonly` | `0694801149380dd274d2da73b5764eb210ad4f6438473216384bfe5aeca6867c` |
| Rollback deny-only | `04-rollback-deny.sql.review` | `ec7b1628e969081b27fd9146157a911063c9df09627eaf8f4bfdd03852808a8d` |
| POST rollback | `05-post-rollback.sql.readonly` | `0694801149380dd274d2da73b5764eb210ad4f6438473216384bfe5aeca6867c` |

`SHA256SUMS` identifica fontes, pins, SQL e evidências. `sources.json` registra as fontes originais; `homolog_sources=[]`. Gerador: `generate.py`, apoiado somente no gerador/capturas do pacote original de cancelamento, sem alterar esses arquivos históricos.

Após comprovar independentemente o ref da conexão, o auditor deve fornecer o marcador de destino `b2b_cancel_final.review_project_ref=swzpzcwiasxmjutrmvkm` na mesma sessão. O marcador apenas confirma o destino declarado: não autentica ator, não concede papel, não cria tickets nem substitui a comprovação do endpoint. PRE aborta sem marcador ou com divergência. Não executar daqui.

Instalação atômica inclui PRE e POST antes de COMMIT; `lock_timeout=3s`. Todos os artefatos são autocontidos. PRE ~7 KB; INSTALL ~65 KB. O estado completo de segurança foi reduzido a digest do JSONB canônico **calculado pelo PostgreSQL**, mantendo owner/ACL/RLS/políticas/colunas/constraints/índices/trigger habilitado/corpo do trigger/enum e downstream, sem remover checks. A captura legível completa permanece em `capture/security-pins.json`, o digest em `capture/security-md5.json`; divergência aborta, não re-pinar para contorná-la.

## Comportamento final

- Comercial/Admin vendedor cancela **somente residual não faturado**, motivo obrigatório, CAS, vínculo e entitlements canônicos, gates/concessões existentes e revalidação após espera.
- Capacidade e writer reconhecem previsão `aguardando_fiscal`/`faturado_parcial`, residual positivo. `aprovado_previsto` era um estado fictício da capacidade e foi removido. Não há atualização/backfill de estado.
- `aguardando_fiscal` é o estado TEXT da **previsão**; não foi inserido artificialmente no enum do pedido. Aprovação operacional continua exigida por `approved_at`, `approved_by` e status `aprovado`/`entregue`. Se PB-001042 estiver pendente operacionalmente, uma previsão econômica não substitui essa aprovação: o candidato nega corretamente.
- Confirmação fiscal final exige transmissão/evento preparado/registro/NF/empresa/chave/protocolo/135 ou 155 vinculados exatamente. 136, rejeição, pendência, evento sem vínculo e tenant estrangeiro não cancelam título.
- Título exato totalmente aberto: NF e título cancelados uma vez. Qualquer pagamento: NF cancelada, título/pagamento preservados, reconciliação pelo Financeiro; sem estorno/baixa/reposição automática.
- Pagamento trava título antes da parcela; corridas não permitem cancelar título pago. Replay de autorização comprova snapshot/alocação/título/evento existentes e não ressuscita NF cancelada. CLOSE_PENDING verdadeiro continua bloqueado; recuperação usa callback canônico.

## Instalação é efetivamente fechada

Gate novo OFF; concessões fiscais novas vazias; RLS nas duas tabelas privadas, ACL cliente fechada. **Nenhum EXECUTE** ao cliente no cancelamento residual, capacidade ou helper fiscal, inclusive `anon`, `authenticated` e `service_role`. Callback e pagamento mantêm as ACLs originais pinadas; nenhum grant fiscal amplo, nenhum grant ao motor de entrega. Rollback mantém corpos endurecidos e histórico, gate OFF e revoga ações; não restaura writers antigos, não exclui objetos/dados.

Não existe arquivo de ativação, fixture hospedada, seed de PB-001042 ou autorização sintética para produção neste pacote. Gates/allowlists de origem continuam exigidos; o fiscal original permanece com `FISCAL_PRODUCTION_ENDPOINT_BLOCKED` e retorno ambiente 2. **Candidato de produção significa código para o schema original, não liberação de emissão fiscal em ambiente 1.** Decisão de ativação posterior exige pins do estado ativado e revisão independente, não GRANT manual ou supressão de `synthetic`/gates. O rollback entregue é para esta instalação fechada exata; após qualquer ativação futura será necessário seu rollback com pins próprios.

## Resultados locais do pacote exato

Última rodada compactada: `evidence/run-results.json`, exit 0.

| Bateria | Resultado | Evidência |
|---|---|---|
| PRE → INSTALL fechado → POST em restauração limpa | 3/3, exit 0 | `evidence/0*.result.json` |
| Integração fiscal/comercial/pagamento/replay | 37/37 | `evidence/original-harness/attempt-001/checks.json` |
| Esperas determinísticas/concorrência/revogação/recuperação | 49/49 | `evidence/original-harness/deterministic-cd167a05/checks.json` |
| Roundtrip/rollback/ACL/destino/awaiting/CAS | 18/18 | `evidence/final-checks.json` |
| UI candidata/diagnósticos existentes | 21/21 | `evidence/ui-final.log` |

As 49 provas detectam holder em `pg_blocking_pids` e lock não concedido em `pg_locks` antes de revogar ator/empresa/gate/concessão; callback e residual negam após espera. Integração cobre concorrência de pagamento e cancelamento, replay da autorização e cancelamento, uma auditoria, título pago PARTIAL e pagamento R$1 preservado. Rollback compara histórico financeiro/pedido/previsão/estoque/entrega e mantém 1+1 físico e histórico cancelado.

Teste adicional usa o core original EMISSION_STARTED→EMISSION_REJECTED para chegar a `aguardando_fiscal`, residual 10; capacidade lê a versão real, CAS antigo nega e cancelamento zera somente os 10 restantes. Nenhum resultado final foi inserido por SQL para aprovar o teste. É teste componente do core com identidade sintética, não fluxo de emissão hospedado.

Reprodução: reconstruir r12 canônico a partir dos harnesses originais e executar `python3 scripts/b2b-cancellation-policy-20261112/final-production/run_local.py`. A reconstrução desta rodada foi limpa e terminou exit 0. Seu dump é descartável e **não** integra o pacote instalável. Auth de teste e feature fiscal/concessões/gate/EXECUTE foram configurados exclusivamente no banco local `c2`; `final_closed` reteve a instalação exata fechada para rollback. `evidence-previous/` preserva a rodada anterior, não somar testes das duas rodadas. Tentativas de bootstrap anteriores ficaram em `evidence/bootstrap-attempts/`.

## Limite de conclusão e próximo bloqueio concreto

PB-001042 **não foi lido nem alterado**. Compatibilidade de `aguardando_fiscal` foi comprovada localmente; não é comprovação da elegibilidade atual desse pedido, dos seus vínculos/aprovações ou dos pins LIVE. PRE é a decisão fail-closed para o catálogo real; pins vêm da composição original r12 e não foram recapturados remotamente.

Pronto para **revisão do candidato fechado**; NO-GO para aplicação/ativação até auditor conferir PRE no ref original e revisar diferenças de catálogo, sem atualizar hashes por conveniência. Sessões reais JWT/RLS/PostgREST/Storage/provedor e homologação do fluxo autenticado continuam não executadas; a UI não foi montada no runtime original. Não houve SQL remoto, publicação, emissão, envio, boleto, cobrança ou alteração de PB-001042. Build automático observado OK; typecheck separado não executado por restrição do ambiente.