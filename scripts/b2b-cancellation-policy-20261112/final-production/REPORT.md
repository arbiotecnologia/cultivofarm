# Candidato FINAL — original CultivoFarm — 12/11/2026

**Preparação local concluída. Instalação e operação hospedadas NÃO autorizadas/certificadas.**

Destino único: `swzpzcwiasxmjutrmvkm`. A homologação hospedada foi encerrada por decisão expressa às 02:00 UTC. Nenhuma fonte, barreira de permissões, instalador ou liberação da homolog foi transportada. Runtime, rotas, Edges, menu e publicação do original não foram modificados.

## Pacote e ordem de revisão

Diretório: `scripts/b2b-cancellation-policy-20261112/final-production/`.

| Ordem | Arquivo | SHA-256 dos bytes testados |
|---|---|---|
| PRE | `01-pre.sql.readonly` | `87c35e167fb8d97e26224a55edf414a2dde8de1593404600f91477fbcfe8cd06` |
| Instalação fechada | `02-install-closed.sql.review` | `68f68d62ca75da304fb24affd76c75a9e243d82c576faa7b94d69db9a10cab25` |
| POST | `03-post.sql.readonly` | `6495c565455cac8be5962688bb46bc6123bb65737ecf508e07e8938d568a6a76` |
| Rollback deny-only | `04-rollback-deny.sql.review` | `43523bd6fb186f2268eb438c3ed00975b65f3ac75b4ec7ed7d157fc291b37ed8` |
| POST rollback | `05-post-rollback.sql.readonly` | `6495c565455cac8be5962688bb46bc6123bb65737ecf508e07e8938d568a6a76` |

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