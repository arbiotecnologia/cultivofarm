# financial_document_conflict_tenant_http409_20261026 + financial_document_not_found_http404_20261026 (NÃO REAPLICAR)
- Ref `swzpzcwiasxmjutrmvkm`. `public.rpc_financial_document_soft_delete(uuid,text)`, md5 pré `0617ea9c9acb8874a834f2fae79c37cf` (pós não informado; capturar READ ONLY).
- Delta informado pelo auditor: `v_org uuid`; exige `h15_actor_organization()` não NULL após `is_financial_staff`;
  `SELECT ... FOR UPDATE` e `UPDATE` filtram `organization_id = v_org`; revalida org/financial staff após o lock;
  2× `40001` → `PT409`; 1× `P0002` (inexistente/alheio, indistinguíveis) → `PT404`.
- ACL/config/owner/SECURITY DEFINER e triggers originais preservados; nenhum arquivo de storage alterado.
- A migration histórica `20260730000000` permanece com 40001/P0002 (histórico, não reescrito); o teste estático antigo continua valendo só para ela.
- Cliente `DocumentosPanel.tsx`: lança o erro (toast com a mensagem), sem retry, sem toast de sucesso nem invalidação. Sem mudança funcional.
- Teste cliente: `src/test/financeiro/documentSoftDeleteHttp.test.ts` (SDK simulado, não JWT/RLS real).
