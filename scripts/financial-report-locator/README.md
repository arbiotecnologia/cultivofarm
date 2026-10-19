# Exportação de relatórios financeiros sem URL assinada (ReportShell + generate-financial-report)

Baseline publicada: `5ad97d6c` (deployment 959d3749, bundle index-CZMhBo9B). Sem publicação, deploy, DDL ou mutação de dados.

## Ordem de compatibilidade
1. **Frontend (no HEAD, publicável):** ignora qualquer `url`; aceita a forma LIVE v89 `{url,path,row_count}` e a revisada
   `{bucket,path,export_id,row_count}`. Valida `path = <org do ator>/<ator>/<reportType>_<ISO>.<ext>` do formato pedido,
   bucket `financial-reports` (se presente), `export_id` UUID (se presente). Baixa via `useAuthenticatedAttachmentOpener`
   (Storage RLS `financial_storage_object_permitted`, já existente). Botões "Preparar PDF/Excel/CSV" → "Baixar <formato>" só com novo clique.
   Fences antes/depois de cada await, snapshot dos filtros (editar oculta Baixar), timeout Edge 60 s com abort, bytes
   com timeout do abridor (15 s), mensagens neutras. Troca de tenant/papel/época/unmount aborta e revoga o Blob.
2. **Edge (somente candidata, FORA de `supabase/functions` para não auto-implantar):** `edge/candidate.index.ts` remove
   `createSignedUrl(3600)` e devolve `{bucket,path,export_id,row_count}` após upload + `register_financial_report_export`.
   Auth/getUser/h15/RPC/renderizadores/CSV/XLSX/PDF/registro inalterados (teste prova delta byte-exato: só o bloco de
   assinatura, substituído por comentário, e a linha de resposta). Implantar só depois do frontend publicado.

## Fonte LIVE (corrigido 2026-10-19)
O valor `ab4d5682…20f5ec60` informado antes era o `ezbr_sha256` do PACOTE implantado, não hash do arquivo. Recibo do
auditor: a fonte LIVE v89 é byte-idêntica a `edge/repo-baseline.index.ts` (11.638 caracteres; sha256 de arquivo
`9eb9e19f…`). Não havia divergência de fonte. Edge v90 = `edge/candidate.index.ts` exato, implantada pelo auditor;
`supabase/functions/generate-financial-report/index.ts` foi sincronizado byte a byte com ela (sha256 `ca9d52a2…`).
Rollback Edge = reimplantar `edge/repo-baseline.index.ts`. Frontend publicado: commit `1c2f29e`.

## Rollback frontend
`rollback-frontend.sh` restaura bytes de 5ad97d6c (`frontend-baseline.SHA256SUMS`) e remove arquivos novos.

## Verificação local (fake Auth/Edge/transporte — não é homologação JWT/RLS real)
tsgo app/node EXIT 0; 21 arquivos / 444 testes PASS (ReportShell sessão+exportação autenticada, Edge atual e candidata,
authzV6.edges, d51-5 storage, downloads financeiros, anexos equipe técnica).

## Pendências
Relatório receivables: ver `scripts/financial-report-receivables/` (RPC fechada; candidata revisável). Download real A/B da exportação e negação entre tenants; implantação da Edge candidata; 5 imports legados de `types.ts`
(2 testes de guarda falham também na baseline); renovação natural estável. Contratos bloqueados.
