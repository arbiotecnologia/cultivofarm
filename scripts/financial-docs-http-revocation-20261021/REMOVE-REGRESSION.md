# Correção mínima de remoção — 21/10/2026 20:01 UTC

## Alteração
`DocumentosPanel.tsx` chama diretamente `supabase.rpc("rpc_financial_document_soft_delete", ...)` usando o contrato tipado já existente. Foi removido apenas o alias destacado/cast que perdia `this`. Nenhuma nova RPC ou alteração de fences, negações, query invalidation, callback, uploads ou Storage.

## Evidência local
- Mock de RPC depende de `this.rest.rpc`; a chamada destacada lança erro antes de chegar ao transporte. O teste também verifica o clique real do componente, uma chamada canônica, sucesso, invalidação e callback, sem harddelete.
- Antes do patch: 7 FAIL / 42 PASS em DocumentosPanel; erro `Cannot read properties of undefined (reading 'rest')` reproduzido.
- Depois: 95/95 PASS em quatro arquivos (DocumentosPanel 49, canal financeiro 30, contrato soft-delete 10, proibição de hard-delete 6). Logs locais `/tmp/financial-remove-before.log` e `/tmp/financial-remove-after.log`.
- Build automático: `build OK`, registro 2026-10-21T20:02:31Z em `/tmp/observability/build-errors.log`.
- Tipos: nenhum recibo separado disponível nesta rodada; comandos manuais de build/typecheck são proibidos pelo ambiente. Não declarar typecheck independente aprovado.
- Revisão de callers: único uso runtime de `rpc_financial_document_soft_delete` no recorte financeiro é DocumentosPanel. Métodos destacados em ReportShell pertencem a relatórios, não à remoção, e ficaram intactos.

## SHA256
- `src/components/financeiro/DocumentosPanel.tsx`: `39abc2f7a7b450a715d1670bee40c197f25350399eab07ddcc42b555aaea11d6`
- `src/test/financeiro/DocumentosPanel.storage.test.tsx`: `e0dded9b5d6999b293a6e64a828f4d9dafbfb2ff1a4c0eb8fb304b15a7ec80ac`

## Limites
Sem publicação, SQL executado, redeploy Edge ou alteração de dados/sessões. O comentário do SQL revisável foi corrigido; corpo/contrato SQL intocados. Fixture B não foi removido ou reparado pelo agente. A remoção real e leitura posterior de `deleted_at` aguardam o proprietário; testes simulados não são homologação de produção. Legado `f8580e22`/payment owner orgNULL sem legibilidade comprovada; cache legado pendente e SU-518022 somente ack. Monitor/XML/recibos/catálogo/contratos preservados.