# Recibo cancelado não pode servir o PDF ISSUED anterior (21/10/2026)

Base publicada: `3d1fb7d2` (Edge v91 sem assinatura; policies `receipt_no_capability_*` já aplicadas — não reaplicar).

## Causa
- `cancel_financial_receipt` (migration 20261005200923): SECURITY DEFINER, h15 + `is_financial_staff`, motivo ≥5,
  só muda `status/cancel_reason/canceled_by/canceled_at` e audita; não toca `storage_path` nem objeto.
- `RecibosList` só chamava a Edge quando `storage_path` era vazio → recibo CANCELED abria os bytes ISSUED.
- Edge v91, quando chamada para CANCELED, sobrescrevia (upsert) o objeto ISSUED histórico.
- Blob preparado não era reconfirmado no clique; cancelamento concorrente/outra sessão não o invalidava.

## Correção (runtime local, não publicada)
- Locator ligado ao status (`receiptCurrentState.ts`): ISSUED → `<org>/<ano>/<num>.pdf`; CANCELED → `<num>.canceled.pdf`.
- Lista e `EmitirReciboButton`: releitura RLS fresca antes da Edge, após os bytes e no clique "Baixar PDF";
  divergência → `opener.discard` (revoga Blob) e exige novo preparo. Exige `status` na resposta da Edge.
- Opener ganhou só `discard(path)`. Monitor/lease/Auth/gates/CQ/OS intactos (`useAuth.tsx` b3a65696…).

## Edge candidata (`edge-review/`, NÃO implantada)
- CANCELED renderiza no próprio caminho, sem atualizar `storage_path`; ISSUED histórico preservado.
- Relê status após upload; ISSUED que perdeu corrida com cancelamento falha fechado sem atualizar locator.
- Retorna `{path, receipt_number, status}`; sem assinatura/`url`.
- **Ordem**: implantar Edge antes do frontend. Com v91 + frontend novo: CANCELED falha fechado; botão Emitir também
  exige `status` → ficaria indisponível até a Edge. ISSUED já gerado na lista não depende da Edge.

## Escopo de revogação
- Revoga: Blob preparado em qualquer aba/sessão no próximo clique; preparo concorrente; resposta tardia.
- Não revoga: bytes já baixados, cópias/cache do navegador, URLs assinadas antigas (até expirar/cache CDN).
- O objeto ISSUED histórico continua acessível por download autenticado direto do Storage a staff do tenant
  (policies atuais); a UI apenas não o oferece como atual. Investigação/correção desse acesso direto e de URLs
  antigas está AUTORIZADA pelo proprietário; pendente para rodada própria (exige SQL, não feito nesta rodada).

## Testes
- `receiptCancelCurrency.list.test.tsx` (baseline reproduz a falha; runtime corrige), `receiptCancelCurrency.edge.test.ts`.
- Financeiro+config+security: 2228/2237; 9 falhas preexistentes: 8 `financialReport*`, 1 `d51-5` (literal da assinatura removida em v91).
- Simuladores antigos: só `limit/abortSignal`, `status` e `waitFor` no clique assíncrono; asserts preservados.
- tsgo e build PASS. `preflight.sql.review` somente leitura.

## Revisão 6e645abb — watchdog e rollback
- Corrigido: o limite de 15 s não é mais encerrado antes dos bytes; cobre Edge, bytes e releitura pós-bytes até o `finally`.
- Bytes não confirmados (timeout, fence, erro, resposta tardia) são revogados no `finally`, só se a tentativa ainda for a mais recente.
- Testes novos (falham em 6e645abb, passam agora): releitura pós-bytes travada nos dois componentes → erro em 15 s,
  Blob revogado, resposta tardia ignorada, nova tentativa recupera; cancelamento concorrente no botão. Delta: `watchdog-delta.patch`.
- Rollback: `rollback.py` troca a Edge por stub 503 (`rollback/edge-503.ts.review`): não assina, não gera, não sobrescreve.
  A v91 NÃO é restaurada (geraria CANCELADO sobre o objeto ISSUED). Lista baseline não é oferecida. Sem SQL/policies.
- Suítes: 2231/2240; mesmas 9 falhas preexistentes. Hashes em `SHA256SUMS.runtime`.

## Sincronização canônica (13:18 UTC)
- Backend atual informado pelo proprietário: Edge `generate-financial-receipt` v93 (= `edge-review/index.ts.review`,
  SHA256 f2f2714a…bfcc), JWT false + getUser + h15, 3 policies intactas. Frontend 56e5b32b já publicado.
- Promovida a mesma fonte byte-exata para `supabase/functions/generate-financial-receipt/index.ts`; elimina risco de redeploy v91.
- Testes: `receiptEmission.edgeReview` compara runtime com v93 (fixtures v91/baseline preservadas);
  `d51-5` troca literal de assinatura por ausência de `createSignedUrl`. Rollback continua stub 503.
- Focados 127/127, tsgo e build PASS. Sem emissão/cancelamento/estorno, dados, SQL ou reload.

## Estado atual (13:23 UTC)
- Produção: frontend 56e5b32b publicado; Edge v93 = fonte canônica (SHA256 f2f2714a…bfcc). Homologação real A/B do
  PDF CANCELADO e revogação por perfil reportada pelo proprietário.

## Layout do PDF (`edge-layout-review/`, candidata NÃO implantada)
- Falha real: texto de "Referente a" e "Motivo" cortado na margem direita (REC-2026-000002, motivo longo).
- Candidata: quebra por largura real da fonte (`widthOfTextAtSize`), quebra de palavra maior que a linha, paginação
  com cabeçalho "(continuação)" e "Página i de n", rodapé em todas as páginas, CANCELADO em todas as páginas,
  número alinhado à direita; caracteres não codificáveis viram "?" em vez de derrubar a geração. Nada é truncado.
- Fora do layout, byte-idêntica à v93 (auth getUser+h15, tenant, status-bound, re-leitura, resposta, zero assinatura).
- Testes: `receiptPdfLayout.edge.test.ts` (v93 reproduz o estouro; candidata sem estouro, texto integral,
  token gigante, ISSUED sem marca, delta só de layout). Fixtures sintéticas reais (pdf-lib 1.17.1) em `fixtures/`.
- QA visual: v93 corta à direita; candidata sem corte em 1 e 2 páginas. Ajustado: marca CANCELADO invadia a faixa
  do cabeçalho (também na v93) → movida para baixo.
- Rollback: `rollback.py` (stub 503). Promoção: copiar `edge-layout-review/index.ts.review` byte-exata após revisão.
