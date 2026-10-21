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

## Adendo 2026-10-21 (sobre 25ed42cb) — históricos >24 e consumidores de URL gravada

Mudanças (somente frontend; sem Auth/monitor/banco/Edge/dados):
- `src/pages/Solicitacoes.tsx`: linha do tempo seleciona `arquivo_path` (não `arquivo_url`) e entrega `fotoPath/audioPath/arquivoPath`; `foto_url` legada do check-in não é consumida.
- `src/lib/pdfVisita.ts` + `src/pages/VisitaTecnica.tsx`: PDF recebe só caminhos; fotos via `downloadAuthenticatedAttachment` (bucket `consultor-arquivos`, AbortSignal, limites de bytes); falha → aviso "indisponível" sem fallback; áudios/anexos sem URL no PDF ("Disponível no sistema"). `fetch(url)` removido.
- `useAuthenticatedBlobUrls`: eager = janela de 24 por página (`pagination.setPage/showPath`), troca de página revoga a janela anterior; lazy = cache LRU ≤24 Blobs/60 MiB, com evicção revogando. Fim do bloqueio global >24.
- `AttachmentPager` nos 8 consumidores eager (históricos, timeline, roteiro, evidências, consultor, wizard, detalhe).

Testes: `authenticatedBlobPaging.test.tsx` (25º item, revogação da janela, resposta tardia, revogação parcial de papel, troca de tenant, erro/Retry, LRU, bytes, URL legada ignorada, checagens estáticas), `pdfVisitaAuthenticated.test.ts`, galeria e hook atualizados.
Bateria completa `src/test`: 8799 PASS, 12 falhas, todas em arquivos não alterados nesta etapa (pré-existentes):
1. `src/test/financeiro/financialReport.edge.test.ts` ×7 e `financialReport.candidate.edge.test.ts` ×1 — asserções sobre fonte/handler `supabase/functions/generate-financial-report` divergente das fixtures de assinatura (pacote ReportShell/Edge separado).
2. `src/test/visita/etapasVisita.test.ts` ×3 — asserções estáticas de strings ausentes em `VisitaTecnica.tsx` já na base (`disabled={!clienteId}`, ordem `etapas.bloqueio` antes de `portal_solicitacoes`, trava `finalizandoRef`).
3. `src/test/comunicacao/notification-p1-scope.test.tsx` ×1 — espera `${STORAGE_KEY}:${scope}` em `src/hooks/usePortalCliente.ts`.
(O registro anterior de "11" vinha de bateria parcial sem o item 3.)
Rollback deste adendo: restaurar os arquivos de 25ed42cb (que também não assinam); `rollback.py` segue com stub indisponível e nunca reabre assinatura.
Limites: testes sintéticos ≠ homologação real A/B; links já emitidos seguem válidos até expirar; nada publicado.
