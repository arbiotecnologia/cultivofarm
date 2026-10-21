# Recibo — abertura autenticada, base 117f9c1

## Delta runtime

Somente `src/components/financeiro/EmitirReciboButton.tsx` mudou funcionalmente.
O caller único é `PagamentosTab.tsx`, `paymentId={p.id}` de um recebimento.
Mantém `issue_financial_receipt({_payment_id})` e a Edge `generate-financial-receipt`.
Nova leitura autenticada do recibo exige ID, pagamento e organização iguais ao snapshot;
o locator existente valida número/ano/bucket/path, inclusive antes da Edge.
A resposta Edge precisa corresponder ao locator e número. Seu campo `url` é ignorado.
O opener existente baixa bytes autenticados de `financial-receipts`, com limites e fences
originais. Primeiro clique prepara, segundo clique explícito baixa o Blob.
Não usa window.open nem assina URL. RPC/read/Edge recebem AbortSignal; watchdog de 15s
encerra geração travada. Byte download mantém timeout/limites do próprio opener.
Duplo clique, respostas antigas e finally antigo não destravam uma solicitação nova.
Troca de ator/tenant/papel/epoch/recurso, pausa e unmount abortam/revogam pelo escopo existente.
Erros são neutros, sem eco de transporte. Não há retry automático de emissão.
Tipos gerados canônicos ainda não possuem organization_id nesta tabela: igual à lista,
a fronteira SDK usa cast localizado e validação de valores recebidos; não regeneramos tipos.

## Contrato servidor, auditoria estática (não hosted)

RPC retorna `{duplicate,receipt_id,receipt_number}` e exige h15_actor_organization,
is_financial_staff e pagamento/parcela/título no mesmo tenant; rejeita estorno.
Edge valida getUser, deriva organização via h15_actor_organization, filtra recibo e cliente
na organização, usa anon + bearer do ator (sem service_role), sujeito às RLS de tabela/Storage.
Storage exige organização e papel financeiro; financial-receipts é tenant-prefix scoped,
não um contrato individual de recibo. Não alteramos ACL/RLS/grants.
Migration fonte: `20261005200923_a9898565-995b-4066-a99b-e138442af842.sql`;
readiness fonte: `20261007155703_7e6f0323-4d33-488f-8cdd-e091c104108d.sql`.
Isto não certifica instalação hosted, JWT/RLS real ou verify_jwt implantado.

## Edge separada, NÃO implantada

Runtime Edge permanece byte-exato à base117f e ainda assina por 3600s, mesmo que o botão
e a lista ignorem sua URL. `edge-review/index.ts.review` remove apenas assinatura e campo url,
mantendo `{path,receipt_number}`; nenhuma implantação/config/secrets foi alterada.
Geração upload/upsert + atualização de locator é escrita, NÃO consulta e NÃO executada aqui.
Remoção candidata da assinatura não revoga capabilities emitidas anteriormente.
Só promover após revisão e autorização de implantação; rollback seguro da Edge é mantê-la
sem assinatura ou indisponibilizar a função, nunca restaurar createSignedUrl.

## Evidências locais

- 48 testes novos do botão com opener real/Auth e transporte simulados: todos PASS.
- Os mesmos 48 contra baseline: 40 FAIL / 8 PASS, sem modificar runtime para comparação.
  Happy paths demonstram abertura bearer antiga; outros casos demonstram ausência de leitura
  tenant/abort/watchdog e tratamento neutro. Falhas por etapa read/bytes ausente são esperadas
  nessa baseline, não são por si só prova JWT/RLS.
- Edge candidata real avaliada com SDK/PDF/env simulados: 10/10; baseline assina, candidata não.
- Focados (botão48 + lista51 + SDK1 + Edge10): 110/110 PASS.
- Config + financeiro integral antes de adicionar Edge10: 1778 PASS / 8 FAIL, 102 arquivos.
  Config: 1084/1084 PASS. Oito falhas em financialReport.edge (7) e
  financialReport.candidate.edge (1) já existentes, assinatura/URL antiga esperada pelos testes.
  Arquivos fonte/testes idênticos a117f e repetição isolada: 8 FAIL /134 PASS.
  Nenhuma exclusão/skip/neutralização na execução integral; não afirmar suíte toda verde.
- Compilação/typecheck automáticos: build OK após correção do tipo na fronteira SDK.
- Avisos act antigos na lista registrados; sem alterar assertions ou lista.
- Não executada UI real de emissão: A não tem recebimento e B não tem recibo/pedido/conta,
  e emitir/gerar documentos reais foi expressamente proibido. Não homologar recibo real.
- Evidência do proprietário: refresh natural A00:52:55/B00:48:55, mesmos created_at,
  App-PaPvQK3b, documentos cadastrais pós-refresh PASS e sem expire ~12min.
  RPC00:43–00:53 n1094/zeroHTTPerrors/v2max4480ms; histórico17s continua pendente.
  Não extrapolar essa evidência para recibos, OS/termos/contratos/portais ou estabilidade geral.

## Inventário para próxima fase, NÃO modificado

`getAttachmentSignedUrl`, `useCommercial.ts`, bucket order-attachments, TTL3600s:
OrderMessagesPanel usa em thumbnail e abertura, ramos legados gate false.
Upload path: `<order_id>/<message_id>/<timestamp>-<file.name>`.

`useSignedUrls` segue legado com gate global false e TTL3600s:

| Caller | Bucket |
|---|---|
| RoteiroVisita | consultor-arquivos |
| EvidenciasTabs | consultor-arquivos |
| EvidenciasGallery | aplicacao-evidencias (lazy ignorado no legado) |
| HistoricoTalhao | consultor-arquivos |
| TimelineAtendimento | consultor-arquivos |
| SolicitacaoDetalheTabs | consultor-arquivos |
| ConsultorTecnico | consultor-arquivos |
| WizardAnexosStep | consultor-arquivos |
| MobileTalhaoHistorico | consultor-arquivos |

Nenhum desses callers/gates foi alterado. Fences de apresentação não revogam bearer emitido.

## Preflight e rollback seguro

`python3 scripts/receipt-emission-attachments-20261021/rollback.py` valida hashes sem escrever.
`--apply [ROOT]` instala somente botão desabilitado, preservando monitor/CQ/Edge/gates.
Não restaura baseline vulnerável. Baselines são evidência read-only, nunca rollback de implantação.
Manifesto vincula target, rollback seguro e dependências protegidas; divergência aborta.
Rollback exercitado apenas em cópia isolada. SHA256SUMS inclui artefatos e fontes relacionadas.
Nenhum commit git manual (versionamento é gerenciado pela plataforma), SQL/DML hosted,
sessão, reload, publicação ou emissão/baixa/nota/mensagem realizada nesta rodada.