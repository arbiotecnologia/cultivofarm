# Interrupção de novas URLs assinadas — anexos técnicos/portais (2026-10-21)

Candidata local. **Não publicada.** Sem Auth, papéis, dados, monitor, SQL ou Edge.

## Motivo histórico do gate
`AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED` ficou `false` aguardando auditoria do abridor
autenticado e drenagem do legado. Pré-requisitos hoje presentes e testados: transporte
autenticado com limites/timeout 15s (`authenticatedAttachment.ts`), fences de
identidade/tenant/papéis/epoch/lease (`useStorageAccessScope`), revogação de Blob no
cleanup, abort ownership imediato (revisões cc5fbf/6a551).

## Mudança
- Gate `true`; ramo legado `createSignedUrls(…, 3600)` **removido** de `useSignedUrls`
  (nome mantido; agora só delega a `useAuthenticatedBlobUrls`).
- `getAttachmentSignedUrl` (order-attachments, 3600s) removido; `OrderMessagesPanel` usa só
  miniatura Blob + abridor autenticado.
- Fallback para `arquivo_url`/URL gravada removido em: RoteiroVisita, EvidenciasTabs,
  MobileTalhaoHistorico, HistoricoTalhao, TimelineAtendimento, SolicitacaoDetalheTabs e
  `resolverUrlEvidencia` (registro sem path → "indisponível").
- `EvidenciasGallery` deixou de ler o gate (desligar o gate não reabre assinatura).
- Frontend de runtime: zero chamadas `createSignedUrl(s)` (teste estático).

## Testes
- Bateria equipe-tecnica/config/visita/clientes/aplicacoes/financeiro/security/comercial:
  2809+ PASS; 11 falhas **idênticas à baseline** (generate-financial-report ×8, wizard ×3).
  Zero falhas novas.
- `useSignedUrls.test.tsx` reescrito para o contrato autenticado: StrictMode/unmount, 10
  mudanças de escopo com revogação de blob, A→B→A tardia, revogação parcial de papel,
  sem papéis/tenant, bucket/paths, erro neutro + Retry, falha isolada, dedupe, abort.
- `noSignedAttachmentEmission.test.ts`: guarda estática de consumidores/fallbacks.
- Testes de gate atualizados para `true`; nenhum skip/todo. typecheck e build PASS.

## Rollback seguro
`rollback.py` NÃO restaura `baseline/` (reabriria assinatura). Substitui o hook por stub
fail-closed (anexos indisponíveis) e aborta se houver `createSignedUrl` no runtime.
`baseline/` serve só para diff (`frontend.patch`) e hashes (`SHA256SUMS.pre-post`).

## Limites / pendências separadas
- URLs assinadas já emitidas (≤3600s) e bytes/caches baixados **não são revogados**.
  Chamado SU-518022: apenas ack.
- `Solicitacoes.tsx` e `VisitaTecnica.tsx` (export PDF) ainda leem `arquivo_url` gravada
  (não emitem assinatura nova; registros atuais têm `arquivo_url` nulo). Pendência.
- `useAuthenticatedBlobUrls` eager falha fail-closed acima de 24 arquivos por lista
  (ex.: histórico longo) — exibe indisponível, sem assinar. Pendência de UX (lazy).
- Bucket `order-attachments` **não existe em produção** (zero objetos) apesar das tabelas
  `partner_order_messages`/`partner_order_message_attachments`. Não criado bucket nem
  policies. Upload/visualização de anexos de mensagens de pedido seguem indisponíveis.
- Edge `fiscal-xml-engine` ainda emite signed URL de 120s após h15 — fora deste escopo.
- Homologação real A/B (renovação natural, revogação parcial) pendente após publicação.
