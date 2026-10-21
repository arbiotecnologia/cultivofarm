# fiscal-xml-download-blob-20261021 — candidata (NÃO implantada)

Escopo mínimo: remover a capacidade-URL `createSignedUrl(path, 120)` da action
`download` da Edge `fiscal-xml-engine` e o `window.open(url)` do frontend.
Não altera `generate`, certificado, assinatura XML (XMLDSig), SEFAZ/emissão,
SQL, dados, buckets, chaves, perfis, Auth, monitor ou cadência.

Base frontend: commit `89cff327` (publicado a82 / deployment c06ba016).
Edge canônica intocada: `supabase/functions/fiscal-xml-engine/index.ts`
SHA256 `9188f960f2f9fd5078d9fbe1ed380cbb05ec7ed1fab76d404b08d278eee984d1`
(cópia em `edge/baseline.index.ts`). Candidata: `edge/index.ts.review` (ver SHA256SUMS).

## Edge candidata (action download)
1. Prova: `fn_fiscal_can_operate` (JWT do ator) → leitura RLS de `fiscal_xml_runs`
   pelo cliente do ator → `h15_service_actor_run_access` → bucket = `fiscal-xml`.
2. Leitura dos bytes pelo cliente de serviço, só do path registrado na execução.
   Motivo comprovado (read-only): `pg_policies` não tem nenhuma policy de
   `storage.objects` citando `fiscal-xml`; download pelo JWT do ator seria
   negado. A candidata v6 antiga (`scripts/authz-cache/v6/edges/`) usa o
   cliente do ator e falharia fechada — não reutilizada. Nenhuma policy criada.
3. Limite 10 MiB, timeout 15 s, abort do cliente propagado, SHA-256 e tamanho
   conferidos com `signed_sha256/unsigned_sha256` da execução.
4. Recheck completo (as três provas + mesmo path/sha) após os bytes, antes da entrega.
5. Resposta `application/octet-stream`, `private, no-store`, `nosniff`,
   `attachment`; erros JSON genéricos (400/403/404/409/413/500/504).

## Frontend (aplicado localmente, não publicado)
`loadFiscalXmlArtifact` via `supabase.functions.invoke` (cliente canônico, signal +
timeout 15 s) e `useAuthenticatedAttachmentOpener` (escopo identidade/tenant/
papéis/epoch/lease, abort e revogação de Blob). Clique 1 prepara; clique 2 baixa.

## Compatibilidade / rollout
- Frontend novo + Edge atual (`{url}` JSON): recusado como indisponível, nunca
  abre a URL (fail-closed). Por isso, ordem segura: **Edge candidata primeiro**,
  depois frontend.
- Frontend antigo (a82) + Edge candidata: recebe Blob, `(data).url` é
  `undefined` → `window.open(undefined)` abre aba vazia / erro; sem vazamento,
  mas funcionalmente quebrado até publicar o frontend. Janela curta aceitável
  apenas porque a geração está bloqueada (`F4_1_RUNTIME_CERTIFIED=false`).
- URLs de 120 s já emitidas expiram sozinhas; não são revogadas.

## Rollback
- Frontend: `rollback.py` (download XML indisponível; não restaura baseline/).
- Edge: se necessário, implantar a action download retornando 410
  `download_unavailable`; nunca reabrir `createSignedUrl`.

## Evidências locais (simuladas, não homologação real)
`src/test/fiscal/fiscalXmlEngine.downloadCandidate.test.ts` (13) e
`src/test/fiscal/fiscalXmlAuthenticatedDownload.test.tsx` (11): 24/24.
Baterias fiscal+security+equipe-tecnica+authzV6: 2519 PASS, 4 skipped.

## Revisão 61103c85 — correções (não implantado)
- Prazo ABSOLUTO 15 s cerca provas + leitura + hash + prova fresca: cada etapa corre contra o sinal (`Promise.race`) e recebe `.abortSignal()` quando o SDK suporta; RPC pendurada → 504, sem retry.
- `req.signal.aborted` verificado no início do download → 504 sem Storage.
- Teste "perfil revogado durante leitura" corrigido para `[true,true,false]` (outer `fn_fiscal_can_operate` + 1º authorize) com Storage chamado 1× e entrega negada.
- Novos testes: RPC pendurada no 1º authorize e no recheck fresco, pedido pré-abortado. 16/16.
- Pendente para implantação: baseline da Edge em produção (get_edge_function indisponível); `fiscal_xml_runs` em produção = 0 (reportado pelo proprietário).
