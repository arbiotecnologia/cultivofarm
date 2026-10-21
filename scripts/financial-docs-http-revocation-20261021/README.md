# financial-docs — canal POST autenticado (CANDIDATA, NÃO IMPLANTADA)

Baseline: frontend publicado `d58721b0`, config `a3c1a199`. clientes-docs (v3, JWT=true), recibos e XML v98 intocados.

## Inventário (leitura local + read-only LIVE 2026-10-21)
- Leitura de bytes: apenas `DocumentosPanel.tsx` → `useAuthenticatedAttachmentOpener(…, "financial-docs")` → `downloadAuthenticatedAttachment` (hoje SDK GET autenticado = rota cacheável pela CDN).
- Escrita (preservada): upload `DocumentosPanel.tsx` (upsert false) e `anexarComprovanteBaixa.ts` (upsert true); metadados em `ContasReceber`, `ContasPagar`, `DocumentosReceberTab`; soft delete via `rpc_financial_document_soft_delete`.
- `financial_storage_object_permitted(text,text)` LIVE: plpgsql STABLE INVOKER, `search_path=''`; path strict, `h15_actor_organization`, `is_financial_staff(auth.uid())`, dono (RECEIVABLE/PAYABLE/PAYMENT_*/FISCAL_INVOICE) no tenant.
- Preflight LIVE: 4 objetos, máx 2788 B, 4 registros vivos, 0 path divergente, 0 path duplicado, 0 objeto ausente, **1 registro com organization_id NULL** (aceito só via prova do dono pelo helper canônico).

## Arquivos
- `edge/core.ts`, `edge/transport.ts`, `edge/index.ts.review` → `supabase/functions/download-financial-document/` (não criado).
- `sql/snapshot.sql.review` — `financial_document_download_snapshot(text)` INVOKER, reusa o helper; prova registro+tenant+papéis.
- `sql/origin-deny.sql.review` — RESTRICTIVE SELECT em financial-docs, preserva list/upload/upload_update/delete; aplicar só após homologação A/B do POST.
- `rollback/deny-only.sql.review` — nega financial-docs inteiro e revoga a RPC; nunca reabre GET/assinatura.
- `frontend/loadFinancialDocument.ts`, `frontend/authenticatedAttachment.ts.review` (+`.patch`) — roteamento só para financial-docs; sem fallback SDK GET.
- `supabase/config.toml` — `[functions.download-financial-document] verify_jwt = true` adicionado antes de qualquer deploy.
- Testes: `src/test/security/financialDocumentChannel.review.test.ts`.

## Ordem segura (cada passo exige revisão do proprietário)
1. Aplicar `snapshot.sql.review`; postflight A/B da RPC (próprio = 1 snapshot; cruzado/sem papel financeiro = NULL).
2. Implantar Edge com JWT=true; conferir config LIVE.
3. Promover frontend; publicar.
4. Homologar real: próprio 200/hash, cruzado 403, revogação 403, restauração 200, upload/delete preservados.
5. Só então `origin-deny.sql.review`.

## Limites
- Bloqueio de origem **não purga** respostas já em cache na CDN (plano FREE; purge é Pro+). GET legado em HIT pode seguir servindo até `max-age` — gate aberto até prova de expiração.
- `cache: no-store` no cliente não invalida a CDN. SU-518022 apenas ack; nada resolvido globalmente.
- financial-receipts/financial-reports fora deste pacote.
