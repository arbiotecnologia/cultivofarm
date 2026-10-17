# V6 — candidata concreta, não instalada

## Arquivos

Em `scripts/authz-cache/v6/`:

- `live-guards.sql.review` e `live-storage.sql.review`: seis corpos reais de guards/tickets e helpers Storage coletados READ-ONLY no projeto canônico; não substituídos no harness.
- `row-revision.sql.review`, `row-preflight.sql.review`, `row-rollback.sql.review`: alternativa sem ledger/fan-out/UPDATE profiles. Stamp BEFORE ROW no row já bloqueado; incarnation em INSERT detecta delete/recriação e revision detecta ABA. Duas colunas em nove relações exigem revisão de SELECT */audits/imutabilidade. Gates existentes preservados.
- `reader.sql.review`, `reader-rollback.sql.review`: core privado self-only VOLATILE e wrapper INVOKER, comparação antes/depois dos resolvers e fronteiras temporais desde transaction_timestamp. Não integrado ao runtime nem executado com schema integral. Preflight continua catálogo/inventário, **não completo instalável**.
- `snapshot-time.ts.review`: lease conservadora desde início monotônico e desconto de RTT/fronteira temporal; testes separados, não certificam leitor SQL.
- `attachments.sql.review`, `attachments-preflight.sql.review`, `attachments-rollback.sql.review`, `useCommercial.patch.review`: reserva metadata antes upload e paths order/message/attachment, fences restritivas dos buckets ausentes. Nenhum bucket criado/remapeado; SELECT manifest não prova upload.
- `edges/{generate-financial-report,generate-financial-receipt,fiscal-xml-engine,entrega-termo-pdf}.index.ts.review`, respectivos patches e manifest/hash: download caller-bearer em lugar de signed URLs nos ramos candidatos; nenhum Edge runtime alterado.
- `edges/serve-verified-attachment.ts.review`: autorização antes/depois, timeout/abort 15s, limite 20MiB (fiscal10/termo15), no-store, sem fallback. SDK correto: download(path, {}, { signal }). Limite após download Blob não é limite streaming de memória.
- `test-isolated.py`: PostgreSQL descartável com corpos capturados, tabelas/RLS reduzidas; não schema integral/API Storage.
- Testes novos `src/test/config/authzV6.candidates.test.ts` e `authzV6.edges.test.ts`.

## Resultados próprios

102/102 Vitest em oito arquivos: monitor19, integração12, ownership7, Blob23, consumidores17, galeria4, tempo/helper15, handlers5. Os cinco handlers executam fontes candidatas: fiscal positivo/negado, termo legacy signed_url410 sem signer, relatório CSV binário e identidade alterada durante geração. Transportes simulados, não HTTP.

21 checks PostgreSQL local PASS: ABA entidade/identidade, rollback, guard authenticator sem ticket negado/ticket real aceito, duas conexões A/B e Storage operação/tenant reduzidos. Novo stamp de organização A não ocupa gate global e B consegue escrever entidade/profile. **Não prova todas ordens dos writers/policies live.** BYPASSRLS service_role observado: RLS não contém esse papel.

Lint dois testes novos zero; scanner fiscal OK; diff-check OK; build automático 13:07:20 UTC OK. Typecheck dedicado adicional não certificado. Evidências anteriores do auditor não reatribuídas. Falhas iniciais corrigidas em fixtures (NodeBlob, mock tipado, USAGE storage service_role local), mantendo asserções.

## Contratos adicionais READ-ONLY

Ref canônico validado swzpzcwiasxmjutrmvkm; nenhum Auth users/secret/token consultado.

- Cliente VOLATILE preservado; producer scope STABLE MD5 49b8329ce232670c1560f0683b913a26, ACL postgres-only; B2B context STABLE 02158d4204dea67308558f649113ba6d.
- Context B2B exige actor ready/h15/único papel/link/papel correspondente/partner ativo/owner/entitlement catalogo_precos. Não autorização OR role/link.
- b2b_phase1_order_visible wrapper 8812508716f279a88e3d5a31b15621d8; path_strict 94164fa3b90088b0a1f16ac465a635d4.
- Perfil sensitive_fields 1c2ad8d0ef38ea66866f8b85d3acb109; senha_provisoria e38505f726490b064e61d9aa4e3be5a7; senha_ticket bb9ea2f95f8f151ebd4b97c2a2e747b7; enforce produtor ecad56badcb2120f7048fad7519f76f4. Nenhum corpo alterado.

## Lacunas exatas

1. Reader não executado com schema integral: closure de readiness/convites, writers-filhas/FKs, planos/features/módulos/histories e minimização vetor SELECT * pendentes. Não ABA universal ou preflight completo.
2. DDL anexos não executado sob matriz integral de policies/roles live. Helpers invoker/ACL e h15 em termos Cliente precisam revisão para não negar casos legítimos; paths/metadata/order autorizados ainda sem prova integral CRUD.
3. SQL Storage reduzido não prova 401/403/404/upload HTTP nem metadata/orders CRUD. Ambos buckets continuam ausentes, sem criação permissiva.
4. Patches alteram JSON URL para binário: callers precisam candidata coordenada. Geração recibo/termo e assinatura fiscal não testadas integralmente; não afirmar preservação funcional completa. Certificados fiscais permanecem internos, não portal.
5. Demais emissores/visitas-pdf/fiscal-certificates e uso de service_role externo pendentes. T0 apenas após conter servidor/última emissão; UI atualizada não contém cliente antigo. Bytes já baixados não revogáveis.
6. READ-ONLY canônico e SQL descartável disponíveis; falta ambiente descartável Supabase completo **Storage/Auth/API** com contratos importados para prova HTTP fiel. Não falta senha de usuário real; não pedir credenciais nem instalar em produção para testar.

Cache/Blob gates false; vínculos fechados; assinatura/pagamentos/SMTP/Auth/perfis/associações intocados. Sem migration/DML hosted/deploy/publicação. UI candidata e fluxo B2B completo UNVERIFIED. SHA observado 96b7aa1953bcccb41d24f85dbb5a7aeafbb832ba, sem commit manual.