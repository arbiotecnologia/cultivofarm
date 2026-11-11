# Auditoria PB-001042 — espelho r12, sem produção

**Atualização aditiva 23:20:** ver `FOLLOWUP-20261111-2320.md` e `followup-manifest.json`; confirmações de pins pelo auditor, painel conectado, revogação determinística e pagamento persistido. Pendências antigas abaixo são históricas; nenhuma política material foi decidida nem instalação autorizada.

## Resultado e prontidão

**Diagnóstico econômico:** delta local testado. `economicDiagnosis` distingue aprovação comercial/crédito explícita vigente e pendência operacional/contábil. Não altera `eligible`, códigos de `reasons`, IDs antigos, `approved_*`, previsão, estoque ou portas. Não retorna autor/hash/ID da previsão. Usa a autorização do leitor canônico do piloto; gate off, concessão revogada/expirada e aprovador revogado não são tratados como aprovação vigente. Indisponível não significa inexistência histórica.

**Defeito reproduzido:** preparo fiscal com duas chaves concorrentes criou dois eventos distintos com a mesma `seqEvento` (tentativas 009–011). Delta separado serializa pelo documento e revalida ator/empresa/marcador após espera. Teste corrigido produziu sequências distintas; POST e rollback deny-only passaram. O rollback revoga EXECUTE e retém o corpo corrigido. **Ainda não pronto para implantação:** pins do preparo são capturas locais, não hashes LIVE fornecidos pelo auditor; falta bateria específica de revogação durante espera desse delta e revisão independente.

**Não foi criada cascata de cancelamento.** Callback real de evento `135` registra `REGISTERED`/`EVENT_REGISTERED`, mas a NF permaneceu `AUTHORIZED`; título, previsão, estoque e entrega não foram automaticamente cancelados/repostos. A ausência de cascata é comportamento observado, não uma decisão aprovada de negócio.

## Evidência executada

| Evidência | Resultado | Escopo |
|---|---|---|
| `evidence/attempt-001/prep/restore.txt` | restauração exit 0; duas FKs `true` | auth fictício antes de post-data; leitor MD5 exato 70dba088… |
| `evidence/attempt-007/` | 41 PASS, 0 FAIL, 10 INFO; exit 0 | duas sobrecargas; equivalência antes/depois; concessões; C2; OS positiva revertida; preparo, assinatura, callback concorrente, replay, rollback |
| `evidence/attempt-011/` | 23 PASS, 0 FAIL, 11 OBSERVED; exit 0 | entradas reais antes da previsão/um eixo/dois eixos; título com pagamento; pendência/rejeição/registro fiscal; autorização replay × callback cancelamento |
| `evidence/event-sequence-regression.json` | sequências distintas após correção | duas conexões/chaves, corpo candidato aa4153c… |
| `evidence/package-roundtrip.json` | 7 arquivos, exit 0 cada | POST/rollback/PRE/reinstalação diagnóstico + POST/rollback deny do preparo |

Tentativas 002/005/008 interrompidas por preparação do roteiro; 003/004/006/009/010 preservam falhas, não são PASS. A tentativa 001 inclui a negativa original reexecutada 19/20: controle antigo tinha UUID de outra restauração; a tentativa 007 corrigiu isso selecionando pedido aprovado efetivamente criado pelo harness e demonstrou sucesso transitório/rollback.

## Casos e valores concretos

- Fixture C2 inicial: `fb7e6c65-a016-40d8-9298-ea8601b0a979`, estado `em_analise_comercial`, `approved_at/by` nulos, previsão 20; inelegível nas duas sobrecargas. Nenhum título/OS/entrega; saldo e movimentos não mudaram.
- Entrada real de entrega de revenda exige OS: `rpc_b2b_resale_os_create_v1` negou C2 por `PT409 B2B_RESALE_ORDER_CONFLICT`. Mesmo ator/gate/concessão exata criou OS no controle aprovado dentro de transação revertida.
- Matriz econômica 00/10/11 foi criada/cotada/aprovada pelos writers reais: previsão 0/0/1, fiscal inelegível em todos. A ordem inversa 01/11 **não foi reexecutada nesta ampliação**; permanece cobertura histórica do piloto, não novo PASS.
- NF1 do controle r12 reconstituído: `00000000-0000-0000-0000-000000000900`, título `7c7ae490-3dc4-48a1-bca1-c6e1a45166c4`, R$10. NF2 adicional `00000000-0000-0000-0000-000000004501` autorizada pelo H13 real, um título próprio R$10. Não houve inserts de títulos, saldos ou estados finais.
- Cancelamento de cobrança B2B pelo endpoint da UI está sem EXECUTE para authenticated. `rpc_cancel_accounts_receivable`, usado por Contas a Receber, aceita título próprio não pago; outro tenant falha no trigger `42501 tenant_scope_violation`. Pagamento de R$1 pelo writer real seguido de cancelamento falhou `23514` por recebimento não estornado, revertendo atomicamente também o pagamento.
- Reprovação de pedido (`reject_partner_order`) não é cancelamento. Ator interno do controle foi negado pelo guard legado `b2b_phase1_scope_denied`, antes da transição. Não se afrouxou o guard nem se alegou prova positiva de cancelamento comercial.
- Retornos fiscais 573/103/135 foram enviados somente ao callback local, em transações revertidas; nenhum efeito financeiro/físico. `103` não autoriza cancelamento. Registro 135 e repetição concorrente produziram um evento de confirmação; após registro, novo preparo é negado. Corrida com replay da autorização teve ambos os callbacks exit 0, sem duplicar o título.

## Consumidores auditados antes do delta

- Frontend direto: `src/lib/fiscal/eligibilityDiagnostic.ts` chama somente duas sobrecargas; seu resumo atual **descarta campos novos**. Não houve alteração runtime, portanto o diagnóstico novo é verificável no SQL local, mas não aparece ainda no painel atual.
- Backend: `fn_fiscal_assert_debtor_recipient`, cálculo, reserva de número, XML e overload de três argumentos consomem `eligible/reasons`. Não adicionar informação a `reasons`: a ausência de motivos define elegibilidade.
- Pedido: `PedidosB2B → useRejectPartnerOrder → reject_partner_order`, transição para `reprovado`, não cancelamento aprovado.
- Financeiro B2B: `FinanceiroB2B → useCancelB2BReceivable → cancel_b2b_receivable_secure` contido; ContasReceber usa `rpc_cancel_accounts_receivable` (caminho distinto).
- Fiscal: `fiscal-event-sign → prepare/mark_signed`; `fiscal-sefaz-transport → transmit_begin/record → reconcile`. Nenhuma Edge foi chamada ou alterada.
- Entrega: `deliveryOperationsFlow.ts`/Entregas usam capability e revisão; contenção operacional mantém cancelamento/recomposição separados. Nenhuma cascata pedido/NF→entrega foi criada.

## Decisões materiais e lacunas abertas

1. Pedido C2 economicamente aprovado pode ser reprovado/cancelado? Quem decide e como encerrar/revogar o residual? Writer legado não oferece transição autorizada para o ator interno testado.
2. Cancelamento fiscal registrado deve mudar estado da NF e cancelar título automaticamente ou exigir reconciliação/aprovação financeira? O callback atual só registra evento. Não inventar política para códigos 135/136/155 ou prazos legais.
3. Após parcial: cancelar somente residual ou também documentos/títulos existentes? Qual exposição de crédito deve permanecer? Sem regra nova; wrappers residuais ficam sob gate/concessão próprios.
4. Título com pagamento exige tratamento financeiro explícito; não estornar, devolver dinheiro ou repor estoque automaticamente.
5. Como tratar entrega concluída, expedição e devolução física? Estoque/entrega têm contrato separado; teste fiscal não aprova reposição.
6. `rpc_cancel_accounts_receivable` prova negação estrangeira no trigger após lock; escopo antes do lock/revalidação em espera não foi corrigido nesta rodada. Precisa delta financeiro próprio e pin LIVE.
7. Cancelamento efetivo com pagamento já persistido, revogação durante lock do novo preparo, pedido aprovado cancelável e composição entrega concluída→cancelamento fiscal integral permanecem não homologados. Não declarar auditoria completa/E2E pleno.
8. Preparo fiscal pode aceitar protocolo autorizado com close-pending, porque verifica transmissão e não a conclusão da ponte. Controle da regressão de sequência expõe esse pré-requisito; decidir/hardenizar em pacote separado, sem inventar autorização de cancelamento C2.

## Proveniência, comandos e limites

- Base reconstruída por `git archive 851b14f9af3455a2f1215eefb448ef201ddf57a5 scripts` em `/tmp/r12`; substituições pelos **bytes versionados** `harness-diff/r12-compose_current.py` e `r12-forecast_residual_scenario.py` do pacote fiscal-final anterior.
- `NEW_E2E_BUILD_FORECAST=1 NEW_E2E_TIMEOUT=540 python3 /tmp/r12/scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/rebuild_current.py` exit 0. Isso reconstitui a base; não substitui o positivo r12 já encerrado.
- Dump SHA-256 `71cbb3515f0c48b9a4c416c5210a901f7ebd16a2b74075170e5b96b702d41e98`; socket `/tmp/felig`, porta 55901, sem listener TCP.
- `prep_restore.sh`: pre-data→data→usuários fictícios→post-data com exit-on-error. Globals inicialmente pararam por postgres já existente; recuperação local suprimiu apenas CREATE dos papéis já existentes. Falha não foi contada como restauração PASS.
- Vendedor 02a–02d e piloto instalados somente no espelho pelos fontes canônicos; nenhuma migration nova em `supabase/migrations`.
- `python3 scripts/c2-fiscal-cancel-audit-20261111/generate.py`; `python3 .../test_local.py`; `python3 .../test_extended.py`; `python3 .../generate_event_delta.py`. Sempre socket local explícito.
- S-FEATURE: feature fiscal sintética ausente na restauração foi adicionada via override de empresa; não houve substituição de helper. Tentativa de alterar feature de versão publicada foi corretamente negada e abandonada.
- S-AUTH, claims SQL, documentos/XML/assinaturas/transmissões SENT são entradas sintéticas declaradas; resultados exclusivamente pelos writers/callbacks reais. Não provam JWT/RLS/Storage, SEFAZ real ou configuração hosted.
- Sem runtime, chamadas remotas, emissão, cobrança, cancelamento real, envio ou publicação. Compilação automática `build OK`; suíte frontend focada registrada separadamente. Nenhuma alegação de typecheck/build manual nesta rodada.

## Pacotes

- `diagnostic/01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback.sql.review`: baseline do leitor **reportado pelo proprietário** `70dba08838cd4d5eea29f37f5f8a3373`; candidato medido `9eab0ceb7796f6a2421617dfb4013849`. Dependências owner/ACL/config são capturas locais e precisam conferência LIVE pelo auditor. Instalação não abre gates/grants.
- `event-sequence/01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback-deny.sql.review`: baseline local `9af2e91f3dbea476bffb4328fa288b2f`; candidato `aa4153c528a3c73311969e07cabf3fd4`. Prontidão bloqueada pelas provas/pins acima.
- `manifest.json` e `SHA256SUMS`: hashes dos arquivos entregues. Capturas e tentativas preservadas; não são artefatos operacionais autorizados.