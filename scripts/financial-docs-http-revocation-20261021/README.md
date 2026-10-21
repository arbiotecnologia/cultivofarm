# financial-docs — canal POST autenticado (publicado externamente; correção de remoção local, não publicada)

Baseline: frontend publicado `d58721b0`, config `a3c1a199`. clientes-docs (v3, JWT=true), recibos e XML v98 intocados.

## Inventário (leitura local + read-only LIVE 2026-10-21)
- Leitura de bytes: apenas `DocumentosPanel.tsx` → `useAuthenticatedAttachmentOpener(…, "financial-docs")` → `downloadAuthenticatedAttachment` (hoje SDK GET autenticado = rota cacheável pela CDN).
- Escrita (preservada): upload `DocumentosPanel.tsx` (upsert false) e `anexarComprovanteBaixa.ts` (upsert true); metadados em `ContasReceber`, `ContasPagar`, `DocumentosReceberTab`; soft delete via `rpc_financial_document_soft_delete`.
- `financial_storage_object_permitted(text,text)` LIVE: plpgsql STABLE INVOKER, `search_path=''`; path strict, `h15_actor_organization`, `is_financial_staff(auth.uid())`, dono (RECEIVABLE/PAYABLE/PAYMENT_*/FISCAL_INVOICE) no tenant.
- Preflight histórico LIVE: 4 objetos, máx 2788 B, 4 registros vivos, 0 path divergente, 0 path duplicado, 0 objeto ausente, **1 registro com organization_id NULL**. A condição SQL não comprova legibilidade: o legado `f8580e22`, com documento e payment owner orgNULL, permanece sem prova de acesso; não inferir tenant nem afirmar que é legível.

## Arquivos
- `edge/core.ts`, `edge/transport.ts`, `edge/index.ts.review` → `supabase/functions/download-financial-document/` (não criado).
- `sql/snapshot.sql.review` — `financial_document_download_snapshot(text)` INVOKER, reusa o helper; prova registro+tenant+papéis.
- `sql/origin-deny.sql.review` — RESTRICTIVE SELECT em financial-docs, preserva list/upload/upload_update/delete; aplicar só após homologação A/B do POST.
- `rollback/deny-only.sql.review` — revoga apenas a RPC; preserva uploads/list/delete; nunca reabre GET/assinatura.
- `frontend/loadFinancialDocument.ts`, `frontend/authenticatedAttachment.ts.review` (+`.patch`) — roteamento só para financial-docs; sem fallback SDK GET.
- `supabase/config.toml` — `[functions.download-financial-document] verify_jwt = true` adicionado antes de qualquer deploy.
- Testes: `src/test/security/financialDocumentChannel.review.test.ts`.

## Estado (evidência externa do proprietário, 2026-10-21; não executada pelo agente)
- Snapshot aplicado via migration `financial_document_atomic_download_snapshot`, com REVOKE também de service_role (anon=false, authenticated=true, service=false; INVOKER/STABLE). Documento orgNULL só pode passar com prova efetiva do dono pelo helper e RLS; o legado `f8580e22`/payment owner orgNULL não tem legibilidade comprovada.
- Edge `download-financial-document` v1 ACTIVE, JWT=true, import_map=false, ezbr `2ad75f43aa32f42e04587b48bccdf9dfb90b325114428747c6250f8affb05f31`, 3 arquivos exatos.
- Homologação real A/B: próprios 200 (A 137 B, B 202 B, hashes esperados); cruzados 403; retirada exata do papel admin A e B separadamente 403; restaurados mesmos IDs 200 mesmos hashes.
- Fontes canônicas integradas: `supabase/functions/download-financial-document/`, `src/lib/authz/loadFinancialDocument.ts`, `src/lib/authz/authenticatedAttachment.ts`. Sem redeploy/publicação.

## Evidência externa recebida 21/10 20:01 UTC
- Publicação `6c9ef2f0`, bundle `index-CCn7YWmY.js`; backend financeiro v2 JWT=true, três arquivos byte-exatos v1, conforme proprietário (não executado pelo agente).
- Policy `financial_document_server_channel_only` já aplicada externamente; uploads UI reais A/B PASS 168 B, downloads com hashes iguais; POST 200 e GET inédito 400. Papéis restaurados.
- Remoção UI do fixture B `803ce625-c3c8-48a7-9e8c-7d1762d8fc18` falhou com erro de receiver `rest`; `deleted_at` segue NULL conforme proprietário. Nenhum reparo manual, harddelete ou escrita de dados nesta rodada.
- Correção mínima local: chamada tipada `supabase.rpc(...)`, sem destacar o método. Fences, negações, invalidação e callback existentes preservados. Único caller da RPC de remoção financeira encontrado; métodos destacados em relatórios não pertencem a este recorte e não foram alterados.

## Próximo passo
Revisão independente/publicação pelo proprietário e novo clique real de remoção com leitura posterior de `deleted_at`. Testes locais com transporte simulado não substituem homologação real; não publicar automaticamente.

## Rollback
`rollback/deny-only.sql.review` só revoga a RPC de snapshot (Edge passa a 403, sem bytes). Uploads, list, update e delete ficam preservados; política GET, se aplicada, é mantida. Opcional: Edge stub 503 com JWT=true. Nunca reabre GET/assinatura.

## Limites
- Bloqueio de origem **não purga** respostas já em cache na CDN (plano FREE; purge é Pro+). GET legado em HIT pode seguir servindo até `max-age` — gate aberto até prova de expiração.
- `cache: no-store` no cliente não invalida a CDN. SU-518022 apenas ack; nada resolvido globalmente.
- financial-receipts/financial-reports fora deste pacote.
