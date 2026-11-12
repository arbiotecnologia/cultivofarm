# Candidato cancelamento B2B/fiscal — NÃO PRONTO PARA IMPLANTAÇÃO

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