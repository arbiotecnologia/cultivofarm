# Candidato cancelamento B2B/fiscal — NÃO PRONTO PARA IMPLANTAÇÃO

## Continuação 12/11/2026 01:06 UTC — itens 1–4 locais concluídos

**Suíte completa do candidato verde em duas execuções limpas consecutivas**, `evidence/suite-20261112T010445Z/` e `evidence/suite-20261112T010509Z/`, exit 0: integração 37/37, determinísticos 49/49, rollback/reinstalação 10/10 e UI/diagnóstico 21/21. Não somar rodadas históricas. Resultados individuais finais: `attempt-011`, `deterministic-8835c728`, `roundtrip-1bda3c4e`. A seção histórica abaixo permanece preservada, mas seu defeito aberto foi corrigido nesta revisão.

1. **Causa demonstrada:** o replay da ponte reentrava em `b2b_allocate_document` com `auth.uid()` do Financeiro do callback. `b2b_integration_actor` selecionava o caminho de ator externo/comercial, resultando em `forbidden_partner`; H13 absorvia esse erro como CLOSE_PENDING. Não houve autorização fiscal faltante nesse cenário. O gerador agora reconhece fechamento existente somente depois de validar transmissão protocolada/XML, snapshot/digest imutável, tenant/configuração, pedido/parceiro, alocação, título exato e evento FISCAL_CONFIRMED com receivable_id correspondente. Reutiliza o permit privado da ponte para validar as dependências; não empresta papel, não reseta claims, não cria títulos e não aceita replay como prova suficiente. A autorização histórica de NF já CANCELED valida evidência original e registro fiscal final e nunca ressuscita a nota.
2. **Recuperação e pendência real:** reprodução com corpo capturado antigo gera CLOSE_PENDING; reinstalar a ponte candidata e reprocessar o callback canônico remove a pendência sem alteração de título/parcela/estoque/entrega. Configuração contábil realmente pendente mantém bloqueio; após validação de configuração na fixture, o mesmo callback reconcilia e o cancelamento conclui uma vez. As duas asserções finais de corrida continuam obrigatórias. Esperas têm holder em pg_blocking_pids e lock não concedido em pg_locks; ator, empresa, gate e concessão revogados durante espera negam tanto o callback quanto o cancelamento residual. Controles reautorizados, duas ordens de callbacks, replay e concorrência pagamento estão exercitados.
3. **Negativas e físico:** novos pedidos C2 pendentes/sem previsão vêm de simulate→journal→create canônicos com configuração contábil de entrada pendente; nenhuma aprovação/resultado final inserido. Capacidade opaca e writer negado mesmo com concessão exata. Registro 136/chave alheia/ator estrangeiro negam; ausência de evento é negada pelo trigger de ligação e mudança de tenant pelo trigger tenant_scope_violation, sem desativá-los. A fixture física tem duas entregas efetivas de uma unidade e uma entrega histórica cancelada de duas unidades: todo o histórico é preservado, sem devolução/reabertura de estoque. NF com R$1 pago fica cancelada com título PARTIAL e reconciliação obrigatória, sem estorno.
4. **UI inativa montada:** `ui/OrderFinanceCandidate.tsx` usa o slot extra do **DetalhePedidoDrawer real** no ponto Financeiro. Só monta após `rpc_b2b_cancel_residual_capability_v1` responder capacidade estrita pedido/versão/residual. Erro/ausência/resposta estrangeira não concede ação; motivo/CAS/lock e fences preservados. Browser desktop 1280×1800 e móvel 390×844 exercitou detalhe→capacidade real no espelho→cancelamento→reabertura/releitura sem ação, sem erros JS; evidências em `evidence/browser-isolated-final/`. Transporte temporário em /tmp, limitado a duas RPCs e PostgreSQL via socket; sessão por claims sintéticas, leituras do cabeçalho/itens por inputs declarados (itens vazios), Google Fonts bloqueado. Não é JWT/RLS/PostgREST/Storage/provedor real nem homologação de todos os leitores do detalhe. Prévia 8080/produção não receberam writers nem montagem candidata.

**Roundtrip exato:** PRE/INSTALL em cada restauração; POST→rollback deny-only→POST-rollback→reinstalação fechada→POST; gate permanece OFF ao reinstalar, ACLs privadas fechadas e histórico intacto. `06-reinstall-closed.sql.review` não habilita concessões nem gate.

```text
bash scripts/b2b-cancellation-policy-20261112/run_suite.sh
# Repetido duas vezes; restaura base limpa antes dos testes que persistem pagamento.
```

SHA-256 dos SQL finais:
```text
01 4476066c11b7c859714084407939afbdc3808ea9ea6c972fb465104b40e82f7c
02 287f28ff2281f06d6d0e4710d4143fc3b2ddbee673f980573d282b6aa0d28e20
03 de5d1cd51b72b2ea468a481ad34f77d374599b79e8a9eafc5c235797b2eeff30
04 6f16b821200d2a9d490a35f45c66db0185cc0f471508df92430e01a5efcf4367
05 fad7a2febdb1ea84ade9aa6bd38352366c80a767f739ae0a7d23dd7a75ff9e5f
06 c22301df7d203188f1f6bacd84f795076d56379fcd98312de9eeb14829337e53
```

**Permanece NO-GO hosted (item 5):** pins são locais, novas dependências precisam captura/revisão LIVE independente; não existe prova JWT/RLS/Storage/provedor. Compilação automática observada build OK; typecheck separado não executado por restrição do ambiente. Não rodamos suíte inteira do projeto: rodamos a suíte completa deste candidato. Nenhuma decisão humana nova foi necessária; nenhum SQL remoto/deploy/publicação/emissão/envio/cobrança executado. Falhas intermediárias preservadas; falhas de auditoria global sobre título pago foram corrigidas pela ordem de base limpa e por escopo do título, não por aceitar observações no lugar das asserções.

## Histórico da preparação anterior (não descreve a prontidão local atual)

## Implementação preparada, somente local
- Pacote separado `scripts/b2b-cancellation-policy-20261112/`; runtime, Edges, produção e publicação não alterados.
- Endpoint residual existente exige Administrador/Gestor Comercial vendedor, pedido operacional aprovado, motivo/CAS, gates e concessão próprios; encerra somente residual e preserva cabeçalho/documentos/títulos/estoque/entrega. Replay exige versão anterior exata e autorização vigente.
- Callback existente chama helper privado sem EXECUTE para clientes. Finalidade exige transmissão SUCCEEDED, código efetivo 135/155, protocolo, chave/ambiente, evento preparado de cancelamento e registro vinculados à mesma NF/empresa. 136, rejeição e processamento não cancelam.
- NF final válida é marcada CANCELED. Título exato B2B/NF/pedido/parceiro/empresa totalmente aberto é cancelado; pagamentos preservados levam a REQUIRES_REVIEW, sem estorno. Pagamento agora trava título antes da parcela para serializar com cancelamento.
- Gate novo instalado OFF e concessões fiscais vazias; somente o espelho recebeu habilitação e escopo sintético exato. Rollback desliga gate e revoga endpoint residual, preservando corpos endurecidos e o callback de autorização existente.
- Interface candidata não montada: `ui/CancelResidualCandidate.tsx`. Usa endpoint normal, motivo/CAS, lock síncrono e fences; resultado fiscal separa finalidade de necessidade de Financeiro. Não há ação nova na prévia conectada.

## Evidência e defeito ainda aberto
- `evidence/attempt-006`: **35 PASS, 2 FAIL**, exit 1. Não é bateria integral aprovada.
- Passaram: negativos 573/103/136; finais 135/155 com título aberto e rollback; primeiro final da própria NF após pagamento persistido R$1 marca nota sem cancelar título; concorrência pagamento/cancelamento; replay fiscal sem duplicação; residual Admin/Gestor positivos, Financeiro/FSF/comprador negativos; residual concorrente 1 evento, 10→0, replay revogado negado; documentos/estoque/expedição preservados.
- **Falha real de composição em autorização replay × cancelamento:** replay de autorização pode produzir `FISCAL_AUTHORIZATION_CLOSE_PENDING` mesmo na NF previamente autorizada; o candidato conserva corretamente o bloqueio, deixando NF AUTHORIZED/título OPEN e cancelamento com `FISCAL_EVENT_RECONCILIATION_PENDING`. As duas asserções de fechamento imediato falharam e permanecem intactas. Ainda falta corrigir/validar reconciliação e recuperação sem mascarar esse close-pending. Não liberar este pacote.
- `evidence/attempt-001` falhou por feature fiscal ausente na fixture; costura S-FEATURE passou por catálogo/override, sem helper permissivo. Tentativas posteriores preservadas, não somar seus testes como prova final.
- UI candidata + diagnóstico existente: **17/17**, comando em `evidence/ui-tests.txt`. É renderização/transporte mockado, não UI autenticada real/end-to-end.
- POST antes do rollback passou; execução de POST de instalação após rollback falhou por ACL deliberadamente revogada. `05-post-rollback.sql.readonly` foi criado com pin deny-only correto e passou (gate OFF), conforme `evidence/rollback-verified.json`.
- Restauração r12 limpa, usuários fictícios antes de constraints; duas FKs validadas em `evidence/restore-scope-final/`. Primeira recomposição falhou por 02 temporário ausente; bytes históricos recuperados e recomposição seguinte concluída; logs preservados.

## Comandos e artefatos
```text
python3 scripts/b2b-cancellation-policy-20261112/generate.py
bash scripts/b2b-cancellation-policy-20261112/prepare_mirror.sh <diretório de evidência>
python3 scripts/b2b-cancellation-policy-20261112/test_integration.py
bun run test -- src/test/fiscal/cancellationPolicyCandidate.ui.test.tsx src/test/fiscal/eligibilityDiagnostic.test.ts src/test/fiscal/eligibilityEconomicDiagnosis.ui.test.tsx
```
Requer base histórica r12 em `/tmp/r12`, PostgreSQL 17.11 no socket `/tmp/felig:55901`, sem TCP. PRE/INSTALL/POST/rollback/POST-rollback gerados por `generate.py`; fontes em `capture/`, pins pós-candidato em `capture/post-pins.json`. Capturas novas são **locais**, não foram confirmadas pelo auditor em produção. Os PRE anteriores confirmados não cobrem automaticamente novas dependências.

## Bloqueios de prontidão
1. Corrigir corrida autorização/reconciliação/cancelamento e provar recuperação, mantendo as duas asserções finais.
2. Completar revogação determinística durante locks deste novo candidato, ligação inválida/registro não vinculado/tenant estrangeiro no callback e gate/concessão durante espera.
3. Completar ausência de previsão, pedido C2 pendente, controles físicos completos e fiscal com financeiro pendente nesta nova composição.
4. Integrar capacidade server-side e renderização no detalhe normal como patch inativo completo; componente isolado não equivale a integração UI/endpoints ponta a ponta.
5. Conferir pins de novas dependências/trigger/owner/ACL/configuração LIVE pelo auditor; revisão independente e validação real JWT/RLS/Storage/provedor continuam ausentes.

Compilação automática mais recente observada: build OK. Typecheck separado não executado devido às regras deste ambiente. Nenhuma automação de reposição/devolução ou reabertura da previsão. Sem SQL remoto, emissão, cobrança, envio, cancelamento real ou publicação.